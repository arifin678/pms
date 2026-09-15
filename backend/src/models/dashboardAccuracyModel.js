const { sql, poolPromise } = require('../config/db');

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
    return result.recordset.map(row => ({ name: row.name, value: row.value !== null ? Number(row.value.toFixed(1)) : null }));
  } catch (err) { 
    // PERBAIKAN S2486: Jangan biarkan error menganggur, cetak ke console
    console.error('getAccuracyProductsByDate Error:', err.message);
    return []; 
  }
};

module.exports = { getAccuracyProductsByDate };