const { sql, poolPromise } = require('../config/db');

// Mengambil Data Waktu Aktual & Staging (Monitoring)
const getMonitoringByLineAndDate = async (product, date) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('product', sql.VarChar, product)
      .input('date', sql.VarChar, date)
      .query(`
        SELECT 
          ds.schedule_id,
          ds.user_id,
          ds.shift_name,
          ds.cycle_no,
          ds.target_ct_sec,
          ds.customer,
          ds.dept,
          ds.date_dlv,
          ds.prepare_status,
          ds.description,
          ds.cycle_prepare_today,
          ct.counting_id,
          ct.actual_start,
          ct.actual_finish,
          ct.duration_sec,
          ct.status
        FROM DX_PMS_T_DailySchedule ds
        JOIN DX_PMS_M_LineProduct lp ON ds.line_product_id = lp.line_product_id
        LEFT JOIN DX_PMS_T_CountingTime ct ON ds.schedule_id = ct.schedule_id
        WHERE lp.product_name = @product AND CONVERT(VARCHAR(10), ds.schedule_date, 120) = @date
        ORDER BY ds.shift_name ASC, ds.cycle_no ASC;
      `);
    return result.recordset;
  } catch (err) {
    console.error('Model Error [getMonitoring]:', err.message);
    return [];
  }
};

// Mengambil Data Rencana vs Aktual Scan Kanban (Heijunka)
const getHeijunkaByLineAndDate = async (product, date) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('product', sql.VarChar, product)
      .input('date', sql.VarChar, date)
      .query(`
        SELECT 
          ds.schedule_id,
          ds.shift_name,
          ds.cycle_no,
          hp.pn_code,
          hp.plan_qty,
          ISNULL(SUM(sk.scan_qty), 0) AS scan_qty,
          hp.kanban_problem_code
        FROM DX_PMS_T_DailySchedule ds
        JOIN DX_PMS_M_LineProduct lp ON ds.line_product_id = lp.line_product_id
        LEFT JOIN DX_PMS_T_HeijunkaPlan hp ON ds.schedule_id = hp.schedule_id
        LEFT JOIN DX_PMS_T_ScannedKanban sk ON hp.schedule_id = sk.schedule_id AND hp.pn_code = sk.pn_code
        WHERE lp.product_name = @product AND CONVERT(VARCHAR(10), ds.schedule_date, 120) = @date
        GROUP BY ds.schedule_id, ds.shift_name, ds.cycle_no, hp.pn_code, hp.plan_qty, hp.kanban_problem_code;
      `);
    return result.recordset;
  } catch (err) {
    console.error('Model Error [getHeijunka]:', err.message);
    return [];
  }
};

// Mengambil Daftar Nama PIC dari tabel Masterdata
const getMasterPics = async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT DISTINCT 
        user_id, 
        pic AS user_name  /* <--- DI SINI LETAK PERBAIKANNYA */
      FROM DX_PMS_M_Masterdata
      WHERE user_id IS NOT NULL
      ORDER BY pic ASC;
    `);
    return result.recordset;
  } catch (err) {
    console.error('Model Error [getMasterPics]:', err.message);
    return [];
  }
};

// Jangan lupa ekspor fungsinya!
module.exports = { getMonitoringByLineAndDate, getHeijunkaByLineAndDate, getMasterPics };