const { sql, poolPromise } = require('../config/db');

// 1. QUERY TIME PERFORMANCE (KIRI) - LOGIC BARU: SINKRON DENGAN LINE SUMMARY
// Target dinamis: 36 (Jika 1 Shift) atau 72 (Jika 2 Shift) dikurangi Total Abnormal
const getSummaryByDate = async (date) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('date', sql.Date, date).query(`
        SELECT 
          ISNULL(AVG(ct.duration_sec), 0) AS avg_ct_sec,
          ISNULL(MAX(ct.duration_sec), 0) AS highest_ct_sec,
          ISNULL(MIN(ct.duration_sec), 0) AS lowest_ct_sec,
          CASE 
            WHEN COUNT(DISTINCT ds.shift_name) > 0 THEN 
              ( (COUNT(DISTINCT ds.shift_name) * 36.0) - SUM(CASE WHEN ct.status IN ('ABNORMAL', 'DELAY') THEN 1 ELSE 0 END) ) 
              / (COUNT(DISTINCT ds.shift_name) * 36.0) * 100.0
            ELSE 0 
          END AS performance
        FROM DX_PMS_T_DailySchedule ds
        JOIN DX_PMS_T_CountingTime ct ON ds.schedule_id = ct.schedule_id AND ct.actual_finish IS NOT NULL
        WHERE ds.schedule_date = @date;
      `);
    return result.recordset[0] || { avg_ct_sec: 0, highest_ct_sec: 0, lowest_ct_sec: 0, performance: 0 };
  } catch (err) { 
    // PERBAIKAN S2486: Menangani error exception
    console.error('getSummaryByDate Error:', err.message);
    return { avg_ct_sec: 0, highest_ct_sec: 0, lowest_ct_sec: 0, performance: 0 }; 
  }
};

const getProductsByDate = async (date) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('date', sql.Date, date).query(`
        SELECT 
          lp.line_product_id,
          lp.product_name AS name,
          (
            SELECT TOP 1
              CASE 
                WHEN COUNT(DISTINCT ds.shift_name) > 0 THEN 
                  ( (COUNT(DISTINCT ds.shift_name) * 36.0) - SUM(CASE WHEN ct.status IN ('ABNORMAL', 'DELAY') THEN 1 ELSE 0 END) ) 
                  / (COUNT(DISTINCT ds.shift_name) * 36.0) * 100.0
                ELSE NULL 
              END
            FROM DX_PMS_T_DailySchedule ds
            JOIN DX_PMS_T_CountingTime ct ON ds.schedule_id = ct.schedule_id AND ct.actual_finish IS NOT NULL
            WHERE ds.line_product_id = lp.line_product_id AND ds.schedule_date = @date
          ) AS value
        FROM DX_PMS_M_LineProduct lp
        WHERE lp.active = 1 ORDER BY lp.line_product_id ASC;
      `);
    return result.recordset.map(row => ({ name: row.name, value: row.value !== null ? Number(row.value.toFixed(1)) : null }));
  } catch (err) { 
    // PERBAIKAN S2486
    console.error('getProductsByDate Error:', err.message);
    return []; 
  }
};

const getDailyByMonth = async (year, month) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const defaultDaily = Array.from({ length: daysInMonth }, (_, i) => ({ name: String(i + 1), value: null, isHoliday: false }));
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('year', sql.Int, year).input('month', sql.Int, month).query(`
        SELECT ds.schedule_date,
          CASE 
            WHEN COUNT(DISTINCT ds.shift_name) > 0 THEN 
              ( (COUNT(DISTINCT ds.shift_name) * 36.0) - SUM(CASE WHEN ct.status IN ('ABNORMAL', 'DELAY') THEN 1 ELSE 0 END) ) 
              / (COUNT(DISTINCT ds.shift_name) * 36.0) * 100.0
            ELSE NULL 
          END AS value
        FROM DX_PMS_T_DailySchedule ds
        JOIN DX_PMS_T_CountingTime ct ON ds.schedule_id = ct.schedule_id AND ct.actual_finish IS NOT NULL
        WHERE YEAR(ds.schedule_date) = @year AND MONTH(ds.schedule_date) = @month GROUP BY ds.schedule_date;
      `);
    result.recordset.forEach(row => {
      const d = new Date(row.schedule_date); const dayNum = d.getDate();
      if (row.value !== null && dayNum >= 1 && dayNum <= daysInMonth) defaultDaily[dayNum - 1].value = Number(row.value.toFixed(1));
    });
    return defaultDaily;
  } catch (err) { 
    // PERBAIKAN S2486
    console.error('getDailyByMonth Error:', err.message);
    return defaultDaily; 
  }
};

const getMonthlyByYear = async (year) => {
  const monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const defaultMonthly = monthShorts.map(m => ({ name: `${m}'${String(year).slice(2)}`, value: null }));
  try {
    const pool = await poolPromise;
    const result = await pool.request().input('year', sql.Int, year).query(`
        SELECT MONTH(ds.schedule_date) AS month_num,
          CASE 
            WHEN COUNT(DISTINCT CONVERT(VARCHAR, ds.schedule_date, 23) + '_' + ds.shift_name) > 0 THEN 
              ( (COUNT(DISTINCT CONVERT(VARCHAR, ds.schedule_date, 23) + '_' + ds.shift_name) * 36.0) - SUM(CASE WHEN ct.status IN ('ABNORMAL', 'DELAY') THEN 1 ELSE 0 END) ) 
              / (COUNT(DISTINCT CONVERT(VARCHAR, ds.schedule_date, 23) + '_' + ds.shift_name) * 36.0) * 100.0
            ELSE NULL 
          END AS value
        FROM DX_PMS_T_DailySchedule ds
        JOIN DX_PMS_T_CountingTime ct ON ds.schedule_id = ct.schedule_id AND ct.actual_finish IS NOT NULL
        WHERE YEAR(ds.schedule_date) = @year GROUP BY MONTH(ds.schedule_date);
      `);
    result.recordset.forEach(row => {
      if (row.value !== null && row.month_num >= 1 && row.month_num <= 12) defaultMonthly[row.month_num - 1].value = Number(row.value.toFixed(1));
    });
    return defaultMonthly;
  } catch (err) { 
    // PERBAIKAN S2486
    console.error('getMonthlyByYear Error:', err.message);
    return defaultMonthly; 
  }
};



// 2. QUERY ACCURACY PERFORMANCE (KANAN) - Logic: (Total Scan / Total Plan) * 100


const getAccuracyProductsByDate = async (date) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('date', sql.Date, date)
      .query(`
        WITH PlanAgg AS (
            SELECT ds.line_product_id, SUM(ISNULL(hp.plan_qty, 0)) AS total_plan
            FROM DX_PMS_T_DailySchedule ds
            JOIN DX_PMS_T_HeijunkaPlan hp ON ds.schedule_id = hp.schedule_id
            WHERE ds.schedule_date = @date
            GROUP BY ds.line_product_id
        ),
        ScanAgg AS (
            SELECT ds.line_product_id, SUM(ISNULL(sk.scan_qty, 1)) AS total_scan
            FROM DX_PMS_T_DailySchedule ds
            JOIN DX_PMS_T_ScannedKanban sk ON ds.schedule_id = sk.schedule_id
            WHERE ds.schedule_date = @date
            GROUP BY ds.line_product_id
        )
        SELECT 
            lp.line_product_id,
            lp.product_name AS name,
            CASE 
                WHEN p.total_plan > 0 THEN 
                    CASE WHEN (CAST(ISNULL(s.total_scan, 0) AS FLOAT) * 100.0 / p.total_plan) > 100 THEN 100.0
                    ELSE (CAST(ISNULL(s.total_scan, 0) AS FLOAT) * 100.0 / p.total_plan) END
                ELSE NULL 
            END AS value
        FROM DX_PMS_M_LineProduct lp
        LEFT JOIN PlanAgg p ON lp.line_product_id = p.line_product_id
        LEFT JOIN ScanAgg s ON lp.line_product_id = s.line_product_id
        WHERE lp.active = 1
        ORDER BY lp.line_product_id ASC;
      `);
    
    return result.recordset.map(row => ({ 
      name: row.name, 
      value: row.value !== null ? Number(row.value.toFixed(1)) : null 
    }));
  } catch (err) { 
    // PERBAIKAN S2486
    console.error('getAccuracyProductsByDate Error:', err.message);
    return []; 
  }
};

const getAccuracyDailyByMonth = async (year, month) => {
  const daysInMonth = new Date(year, month, 0).getDate();
  const defaultDaily = Array.from({ length: daysInMonth }, (_, i) => ({
    name: String(i + 1), value: null, isHoliday: false
  }));

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('year', sql.Int, year)
      .input('month', sql.Int, month)
      .query(`
        WITH PlanAgg AS (
            SELECT ds.schedule_date, SUM(ISNULL(hp.plan_qty, 0)) AS total_plan
            FROM DX_PMS_T_DailySchedule ds
            JOIN DX_PMS_T_HeijunkaPlan hp ON ds.schedule_id = hp.schedule_id
            WHERE YEAR(ds.schedule_date) = @year AND MONTH(ds.schedule_date) = @month
            GROUP BY ds.schedule_date
        ),
        ScanAgg AS (
            SELECT ds.schedule_date, SUM(ISNULL(sk.scan_qty, 1)) AS total_scan
            FROM DX_PMS_T_DailySchedule ds
            JOIN DX_PMS_T_ScannedKanban sk ON ds.schedule_id = sk.schedule_id
            WHERE YEAR(ds.schedule_date) = @year AND MONTH(ds.schedule_date) = @month
            GROUP BY ds.schedule_date
        )
        SELECT 
            p.schedule_date,
            CASE 
                WHEN p.total_plan > 0 THEN 
                    CASE WHEN (CAST(ISNULL(s.total_scan, 0) AS FLOAT) * 100.0 / p.total_plan) > 100 THEN 100.0
                    ELSE (CAST(ISNULL(s.total_scan, 0) AS FLOAT) * 100.0 / p.total_plan) END
                ELSE NULL 
            END AS value
        FROM PlanAgg p
        LEFT JOIN ScanAgg s ON p.schedule_date = s.schedule_date;
      `);
      
    result.recordset.forEach(row => {
      const d = new Date(row.schedule_date);
      const dayNum = d.getDate();
      if (row.value !== null && dayNum >= 1 && dayNum <= daysInMonth) {
        defaultDaily[dayNum - 1].value = Number(row.value.toFixed(1));
      }
    });

    return defaultDaily;
  } catch (err) { 
    // PERBAIKAN S2486
    console.error('getAccuracyDailyByMonth Error:', err.message);
    return defaultDaily; 
  }
};

const getAccuracyMonthlyByYear = async (year) => {
  const monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const defaultMonthly = monthShorts.map(m => ({ name: `${m}'${String(year).slice(2)}`, value: null }));

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('year', sql.Int, year)
      .query(`
        WITH PlanAgg AS (
            SELECT MONTH(ds.schedule_date) AS month_num, SUM(ISNULL(hp.plan_qty, 0)) AS total_plan
            FROM DX_PMS_T_DailySchedule ds
            JOIN DX_PMS_T_HeijunkaPlan hp ON ds.schedule_id = hp.schedule_id
            WHERE YEAR(ds.schedule_date) = @year
            GROUP BY MONTH(ds.schedule_date)
        ),
        ScanAgg AS (
            SELECT MONTH(ds.schedule_date) AS month_num, SUM(ISNULL(sk.scan_qty, 1)) AS total_scan
            FROM DX_PMS_T_DailySchedule ds
            JOIN DX_PMS_T_ScannedKanban sk ON ds.schedule_id = sk.schedule_id
            WHERE YEAR(ds.schedule_date) = @year
            GROUP BY MONTH(ds.schedule_date)
        )
        SELECT 
            p.month_num,
            CASE 
                WHEN p.total_plan > 0 THEN 
                    CASE WHEN (CAST(ISNULL(s.total_scan, 0) AS FLOAT) * 100.0 / p.total_plan) > 100 THEN 100.0
                    ELSE (CAST(ISNULL(s.total_scan, 0) AS FLOAT) * 100.0 / p.total_plan) END
                ELSE NULL 
            END AS value
        FROM PlanAgg p
        LEFT JOIN ScanAgg s ON p.month_num = s.month_num;
      `);

    result.recordset.forEach(row => {
      if (row.value !== null && row.month_num >= 1 && row.month_num <= 12) {
        defaultMonthly[row.month_num - 1].value = Number(row.value.toFixed(1));
      }
    });

    return defaultMonthly;
  } catch (err) { 
    // PERBAIKAN S2486
    console.error('getAccuracyMonthlyByYear Error:', err.message);
    return defaultMonthly; 
  }
};

module.exports = { 
  getSummaryByDate, getProductsByDate, getDailyByMonth, getMonthlyByYear,
  getAccuracyProductsByDate, getAccuracyDailyByMonth, getAccuracyMonthlyByYear
};