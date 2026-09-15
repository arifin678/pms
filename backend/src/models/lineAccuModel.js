const { sql, poolPromise } = require('../config/db');

const getHeijunkaPlan = async (product, date) => {
  try {
    const pool = await poolPromise;
    // BACA LANGSUNG DARI TABEL HEIJUNKA PLAN
    const result = await pool.request()
      .input('product', sql.VarChar, product)
      .input('date', sql.Date, date)
      .query(`
        SELECT 
          hp.shift_name, 
          hp.cycle_no, 
          hp.pn_code, 
          hp.plan_qty
        FROM DX_PMS_T_HeijunkaPlan hp
        JOIN DX_PMS_M_LineProduct lp ON hp.line_product_id = lp.line_product_id
        WHERE hp.schedule_date = @date AND lp.product_name = @product
      `);
    return result.recordset;
  } catch (err) {
    throw new Error(err.message);
  }
};

const getScansKanban = async (product, date) => {
  try {
    const pool = await poolPromise;
    // BACA LANGSUNG DARI TABEL SCANNED KANBAN
    const result = await pool.request()
      .input('product', sql.VarChar, product)
      .input('date', sql.Date, date)
      .query(`
        SELECT 
          sk.shift_name, 
          sk.cycle_no, 
          sk.pn_code, 
          SUM(sk.scan_qty) AS scan_qty
        FROM DX_PMS_T_ScannedKanban sk
        JOIN DX_PMS_M_LineProduct lp ON sk.line_product_id = lp.line_product_id
        WHERE sk.schedule_date = @date AND lp.product_name = @product
        GROUP BY sk.shift_name, sk.cycle_no, sk.pn_code
      `);
    return result.recordset;
  } catch (err) {
    throw new Error(err.message);
  }
};

module.exports = {
  getHeijunkaPlan,
  getScansKanban
};