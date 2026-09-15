const { sql, poolPromise } = require('../config/db');

const getScheduleId = async (pool, data) => {
  const schedResult = await pool.request()
    .input('product', sql.VarChar, data.product)
    .input('date', sql.VarChar, data.schedule_date)
    .input('shift', sql.VarChar, data.shift_name)
    .input('cycle', sql.Int, data.cycle_no)
    .query(`
      SELECT ds.schedule_id 
      FROM DX_PMS_T_DailySchedule ds
      JOIN DX_PMS_M_LineProduct lp ON ds.line_product_id = lp.line_product_id
      WHERE lp.product_name = @product 
        AND CONVERT(VARCHAR(10), ds.schedule_date, 120) = @date
        AND ds.shift_name = @shift
        AND ds.cycle_no = @cycle
    `);
  if (schedResult.recordset.length === 0) throw new Error('Jadwal tidak ditemukan');
  return schedResult.recordset[0].schedule_id;
};

const calcStatus = (data) => {
  let duration = null;
  let status = 'NORMAL';
  if (data.actual_start && data.actual_finish) {
    const s = new Date(data.actual_start).getTime();
    const f = new Date(data.actual_finish).getTime();
    duration = Math.max(Math.round((f - s) / 1000), 0);
    if (duration > 13 * 60) status = 'ABNORMAL';
  }
  return { duration, status };
};

const createCounting = async (data) => {
  const pool = await poolPromise;
  const scheduleId = await getScheduleId(pool, data);
  const { duration, status } = calcStatus(data);
  await pool.request()
    .input('scheduleId', sql.Int, scheduleId)
    .input('start', sql.DateTime, data.actual_start)
    .input('finish', sql.DateTime, data.actual_finish || null)
    .input('duration', sql.Float, duration)
    .input('status', sql.VarChar, status)
    .input('code', sql.VarChar, data.problem_code || '')
    .query(`INSERT INTO DX_PMS_T_CountingTime (schedule_id, actual_start, actual_finish, duration_sec, status, problem_code, scan_type) VALUES (@scheduleId, @start, @finish, @duration, @status, @code, 'WEB_MANUAL')`);
  return { success: true };
};

const updateCounting = async (countingId, data) => {
  const pool = await poolPromise;
  const scheduleId = await getScheduleId(pool, data);
  const { duration, status } = calcStatus(data);
  await pool.request()
    .input('countingId', sql.Int, countingId)
    .input('scheduleId', sql.Int, scheduleId)
    .input('start', sql.DateTime, data.actual_start)
    .input('finish', sql.DateTime, data.actual_finish || null)
    .input('duration', sql.Float, duration)
    .input('status', sql.VarChar, status)
    .input('code', sql.VarChar, data.problem_code || '')
    .query(`UPDATE DX_PMS_T_CountingTime SET schedule_id = @scheduleId, actual_start = @start, actual_finish = @finish, duration_sec = @duration, status = @status, problem_code = @code WHERE counting_id = @countingId`);
  return { success: true };
};

module.exports = { createCounting, updateCounting };