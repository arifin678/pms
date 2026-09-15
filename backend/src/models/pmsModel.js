const { sql, poolPromise } = require('../config/db');

const findActiveSchedule = async (productName, eventTime) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('productName', sql.VarChar(50), productName)
    .input('eventTime', sql.DateTime, eventTime)
    .query(`
      SELECT TOP (1)
        ds.schedule_id,
        ds.schedule_date,
        ds.line_product_id,
        lp.line_id,
        lp.product_name,
        ds.day_type,
        ds.shift_name,
        ds.cycle_no,
        ds.scheduled_start_dt,
        ds.scheduled_finish_dt,
        ds.target_ct_sec
      FROM dbo.DX_PMS_M_LineProduct lp
      JOIN dbo.DX_PMS_T_DailySchedule ds
        ON lp.line_product_id = ds.line_product_id
      WHERE lp.product_name = @productName
        AND lp.active = 1
        AND @eventTime >= ds.scheduled_start_dt
        AND @eventTime < ds.scheduled_finish_dt
      ORDER BY ds.scheduled_start_dt DESC;
    `);

  return result.recordset[0] || null;
};

const findOpenCounting = async (productName) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('productName', sql.VarChar(50), productName)
    .query(`
      SELECT TOP (1)
        ct.counting_id,
        ct.schedule_id,
        ct.user_id,             
        ct.actual_start,
        ct.actual_finish,
        ct.duration_sec,
        ct.status,
        ct.problem_code,
        ct.start_source,
        ct.finish_source,

        ds.schedule_date,
        ds.shift_name,
        ds.cycle_no,
        ds.scheduled_start_dt,
        ds.scheduled_finish_dt,
        ds.target_ct_sec,

        lp.line_id,
        lp.product_name
      FROM dbo.DX_PMS_T_CountingTime ct
      JOIN dbo.DX_PMS_T_DailySchedule ds
        ON ct.schedule_id = ds.schedule_id
      JOIN dbo.DX_PMS_M_LineProduct lp
        ON ds.line_product_id = lp.line_product_id
      WHERE lp.product_name = @productName
        AND ct.actual_finish IS NULL
      ORDER BY ct.actual_start DESC;
    `);

  return result.recordset[0] || null;
};

const findCountingBySchedule = async (scheduleId) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('scheduleId', sql.Int, scheduleId)
    .query(`
      SELECT TOP (1)
        counting_id,
        schedule_id,
        actual_start,
        actual_finish,
        status
      FROM dbo.DX_PMS_T_CountingTime
      WHERE schedule_id = @scheduleId
      ORDER BY counting_id DESC;
    `);

  return result.recordset[0] || null;
};

const insertCountingStart = async ({ scheduleId, actualStart, startSource, userId }) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('scheduleId', sql.Int, scheduleId)
    .input('userId', sql.VarChar(50), userId)       
    .input('actualStart', sql.DateTime, actualStart)
    .input('status', sql.VarChar(30), 'COUNTING')
    .input('startSource', sql.VarChar(30), startSource)
    .query(`
      INSERT INTO dbo.DX_PMS_T_CountingTime
      (
        schedule_id,
        user_id,                                    
        actual_start,
        status,
        start_source
      )
      OUTPUT INSERTED.counting_id
      VALUES
      (
        @scheduleId,
        @userId,                                    
        @actualStart,
        @status,
        @startSource
      );
    `);

  return result.recordset[0];
};

const updateCountingFinish = async ({
  countingId,
  actualFinish,
  durationSec,
  status,
  problemCode,
  problemNote,
  finishSource
}) => {
  const pool = await poolPromise;

  await pool.request()
    .input('countingId', sql.Int, countingId)
    .input('actualFinish', sql.DateTime, actualFinish)
    .input('durationSec', sql.Float, durationSec)
    .input('status', sql.VarChar(30), status)
    .input('problemCode', sql.VarChar(50), problemCode)
    .input('problemNote', sql.VarChar(255), problemNote)
    .input('finishSource', sql.VarChar(30), finishSource)
    .query(`
      UPDATE dbo.DX_PMS_T_CountingTime
      SET
        actual_finish = @actualFinish,
        duration_sec = @durationSec,
        status = @status,
        problem_code = @problemCode,
        finish_source = @finishSource,
        updated_at = GETDATE()
      WHERE counting_id = @countingId;
    `);
};

const getPlanCountByPn = async (scheduleId, pnCode) => {
  if (!scheduleId) return 0;

  const pool = await poolPromise;

  const result = await pool.request()
    .input('scheduleId', sql.Int, scheduleId)
    .input('pnCode', sql.VarChar(100), pnCode)
    .query(`
      SELECT COUNT(*) AS total_plan
      FROM dbo.DX_PMS_T_HeijunkaPlan
      WHERE schedule_id = @scheduleId
        AND UPPER(pn_code) = UPPER(@pnCode);
    `);

  return result.recordset[0]?.total_plan || 0;
};

const insertScannedKanban = async ({
  scheduleId,
  scanTime,
  qrCodeData,
  pnCode,
  scanQty,
  scanSource,
  scanResult
}) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('scheduleId', sql.Int, scheduleId)
    .input('scanTime', sql.DateTime, scanTime)
    .input('qrCodeData', sql.VarChar(255), qrCodeData)
    .input('pnCode', sql.VarChar(100), pnCode)
    .input('scanQty', sql.Int, scanQty)
    .input('scanSource', sql.VarChar(30), scanSource)
    .input('scanResult', sql.VarChar(30), scanResult)
    .query(`
      INSERT INTO dbo.DX_PMS_T_ScannedKanban
      (
        schedule_id,
        scan_time,
        qr_code_data,
        pn_code,
        scan_qty,
        scan_source,
        scan_result
      )
      OUTPUT INSERTED.scan_id
      VALUES
      (
        @scheduleId,
        @scanTime,
        @qrCodeData,
        @pnCode,
        @scanQty,
        @scanSource,
        @scanResult
      );
    `);

  return result.recordset[0];
};

const getMonitoring = async ({ date, productName }) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('date', sql.Date, date)
    .input('productName', sql.VarChar(50), productName)
    .query(`
      SELECT
        CASE
          WHEN ct.counting_id IS NULL THEN ds.schedule_id
          ELSE ct.counting_id
        END AS id,

        ds.schedule_id,
        ct.counting_id,
        
        ct.user_id,
        md.pic AS operator_name,

        lp.line_id,
        lp.product_name AS product,

        ds.day_type,
        ds.shift_name,
        ds.cycle_no,

        FORMAT(ds.scheduled_start_dt, 'yyyy-MM-dd HH:mm:ss') AS scheduled_start,
        FORMAT(ds.scheduled_finish_dt, 'yyyy-MM-dd HH:mm:ss') AS scheduled_finish,

        FORMAT(ct.actual_start, 'yyyy-MM-dd HH:mm:ss') AS start,
        FORMAT(ct.actual_finish, 'yyyy-MM-dd HH:mm:ss') AS finish,

        ct.duration_sec AS duration,
        ct.status,
        ct.problem_code,

        ds.target_ct_sec
      FROM dbo.DX_PMS_T_DailySchedule ds
      JOIN dbo.DX_PMS_M_LineProduct lp
        ON ds.line_product_id = lp.line_product_id

      LEFT JOIN dbo.DX_PMS_T_CountingTime ct
        ON ct.schedule_id = ds.schedule_id
        
      LEFT JOIN dbo.DX_PMS_M_Masterdata md
        ON ct.user_id = md.user_id

      WHERE ds.schedule_date = @date
        AND (@productName IS NULL OR lp.product_name = @productName)

      ORDER BY
        lp.line_product_id,
        ds.scheduled_start_dt,
        ds.cycle_no,
        CASE WHEN ct.counting_id IS NULL THEN 1 ELSE 0 END,
        ct.actual_start,
        ct.counting_id;
    `);

  return result.recordset;
};

const getScans = async ({ date, productName }) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('date', sql.Date, date)
    .input('productName', sql.VarChar(50), productName)
    .query(`
      SELECT TOP (5000)
        sk.scan_id AS ID,
        sk.scan_id,
        sk.schedule_id,
        FORMAT(sk.scan_time, 'yyyy-MM-dd HH:mm:ss') AS ScanTime,
        FORMAT(sk.scan_time, 'yyyy-MM-dd HH:mm:ss') AS scan_time,

        sk.qr_code_data AS QRCodeData,
        sk.qr_code_data,
        sk.pn_code,
        sk.scan_qty,
        sk.scan_source,
        sk.scan_result,

        ds.schedule_date,
        ds.shift_name,
        ds.cycle_no,
        lp.line_id,
        lp.product_name AS product
      FROM dbo.DX_PMS_T_ScannedKanban sk
      LEFT JOIN dbo.DX_PMS_T_DailySchedule ds
        ON sk.schedule_id = ds.schedule_id
      LEFT JOIN dbo.DX_PMS_M_LineProduct lp
        ON ds.line_product_id = lp.line_product_id
      WHERE CAST(sk.scan_time AS DATE) = @date
        AND (@productName IS NULL OR lp.product_name = @productName)
      ORDER BY sk.scan_time ASC;
    `);

  return result.recordset;
};

const getHeijunka = async ({ date, productName }) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('date', sql.Date, date)
    .input('productName', sql.VarChar(50), productName)
    .query(`
      WITH ScanAgg AS (
        SELECT
          schedule_id,
          UPPER(pn_code) AS pn_code,
          SUM(ISNULL(scan_qty, 1)) AS scan_qty
        FROM dbo.DX_PMS_T_ScannedKanban
        WHERE schedule_id IS NOT NULL
        GROUP BY
          schedule_id,
          UPPER(pn_code)
      )
      SELECT
        ds.schedule_id,
        ds.schedule_date,
        lp.line_id,
        lp.product_name AS product,
        ds.shift_name,
        ds.cycle_no,

        hp.heijunka_id,
        hp.sequence_no,
        hp.pn_code,
        hp.plan_qty,

        ISNULL(sa.scan_qty, 0) AS scan_qty,

        CASE
          WHEN ISNULL(sa.scan_qty, 0) = hp.plan_qty THEN 'OK'
          ELSE 'NG'
        END AS scan_status
      FROM dbo.DX_PMS_T_DailySchedule ds
      JOIN dbo.DX_PMS_M_LineProduct lp
        ON ds.line_product_id = lp.line_product_id
      JOIN dbo.DX_PMS_T_HeijunkaPlan hp
        ON ds.schedule_id = hp.schedule_id
      LEFT JOIN ScanAgg sa
        ON hp.schedule_id = sa.schedule_id
       AND UPPER(hp.pn_code) = sa.pn_code
      WHERE ds.schedule_date = @date
        AND lp.product_name = @productName
      ORDER BY
        ds.scheduled_start_dt,
        hp.sequence_no;
    `);

  return result.recordset;
};

const getFinishedCycleKanbanProblem = async ({ productName }) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('productName', sql.VarChar(50), productName)
    .query(`
      WITH ScanAgg AS (
        SELECT
          schedule_id,
          UPPER(pn_code) AS pn_code,
          SUM(ISNULL(scan_qty, 1)) AS scan_qty
        FROM dbo.DX_PMS_T_ScannedKanban
        WHERE schedule_id IS NOT NULL
        GROUP BY schedule_id, UPPER(pn_code)
      ),
      ProblemAgg AS (
        SELECT
          ds.schedule_id,
          ct.counting_id,
          ds.schedule_date,
          ds.shift_name,
          ds.cycle_no,
          lp.line_id,
          lp.product_name,
          ct.actual_start,
          ct.actual_finish,
          ct.status,
          ct.problem_code,


          COUNT(hp.heijunka_id) AS total_pn,
          SUM(hp.plan_qty) AS total_plan_qty,
          SUM(ISNULL(sa.scan_qty, 0)) AS total_scan_qty,

          SUM(CASE WHEN ISNULL(sa.scan_qty, 0) < hp.plan_qty THEN 1 ELSE 0 END) AS total_less_item,
          SUM(CASE WHEN ISNULL(sa.scan_qty, 0) > hp.plan_qty THEN 1 ELSE 0 END) AS total_more_item,

          STRING_AGG(
            CASE 
              WHEN ISNULL(sa.scan_qty, 0) < hp.plan_qty THEN
                CONCAT(hp.pn_code, ' kurang ', hp.plan_qty - ISNULL(sa.scan_qty, 0), ' pcs')
              WHEN ISNULL(sa.scan_qty, 0) > hp.plan_qty THEN
                CONCAT(hp.pn_code, ' lebih ', ISNULL(sa.scan_qty, 0) - hp.plan_qty, ' pcs')
              ELSE NULL
            END,
            CHAR(10)
          ) AS problem_detail

        FROM dbo.DX_PMS_T_CountingTime ct
        JOIN dbo.DX_PMS_T_DailySchedule ds
          ON ct.schedule_id = ds.schedule_id
        JOIN dbo.DX_PMS_M_LineProduct lp
          ON ds.line_product_id = lp.line_product_id
        JOIN dbo.DX_PMS_T_HeijunkaPlan hp
          ON ds.schedule_id = hp.schedule_id
        LEFT JOIN ScanAgg sa
          ON hp.schedule_id = sa.schedule_id
         AND UPPER(hp.pn_code) = sa.pn_code
        WHERE lp.product_name = @productName
          AND ct.actual_finish IS NOT NULL
        GROUP BY
          ds.schedule_id,
          ct.counting_id,
          ds.schedule_date,
          ds.shift_name,
          ds.cycle_no,
          lp.line_id,
          lp.product_name,
          ct.actual_start,
          ct.actual_finish,
          ct.status,
          ct.problem_code
      )
      SELECT TOP (1)
        *
      FROM ProblemAgg
      WHERE 
        (total_less_item > 0 OR total_more_item > 0)
        AND ISNULL(problem_code, '') NOT LIKE '%KANBAN_QTY_NOT_MATCH%'
      ORDER BY actual_finish DESC;
    `);

  return result.recordset[0] || null;
};

const updateCountingProblem = async ({ countingId, problemNote }) => {
  const pool = await poolPromise;

  await pool.request()
    .input('countingId', sql.Int, countingId)
    .input('problemNote', sql.VarChar(255), problemNote)
    .query(`
      UPDATE dbo.DX_PMS_T_CountingTime
      SET
        problem_code = 
          CASE
            WHEN problem_code IS NULL OR LTRIM(RTRIM(problem_code)) = ''
              THEN 'KANBAN_QTY_NOT_MATCH'
            WHEN problem_code LIKE '%KANBAN_QTY_NOT_MATCH%'
              THEN problem_code
            ELSE CONCAT(problem_code, ';KANBAN_QTY_NOT_MATCH')
          END,
        updated_at = GETDATE()
      WHERE counting_id = @countingId;
    `);
};

const getKanbanProblemByScheduleId = async ({ scheduleId }) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('scheduleId', sql.Int, scheduleId)
    .query(`
      WITH ScanAgg AS (
        SELECT
          schedule_id,
          UPPER(LTRIM(RTRIM(pn_code))) AS pn_code,
          SUM(ISNULL(scan_qty, 1)) AS scan_qty
        FROM dbo.DX_PMS_T_ScannedKanban
        WHERE schedule_id = @scheduleId
        GROUP BY
          schedule_id,
          UPPER(LTRIM(RTRIM(pn_code)))
      )
      SELECT
        ds.schedule_id,
        ct.counting_id,
        ds.schedule_date,
        ds.shift_name,
        ds.cycle_no,
        lp.line_id,
        lp.product_name,
        ct.actual_finish,
        ct.problem_code,

        SUM(hp.plan_qty) AS total_plan_qty,
        SUM(ISNULL(sa.scan_qty, 0)) AS total_scan_qty,

        SUM(CASE WHEN ISNULL(sa.scan_qty, 0) < hp.plan_qty THEN 1 ELSE 0 END) AS total_less_item,
        SUM(CASE WHEN ISNULL(sa.scan_qty, 0) > hp.plan_qty THEN 1 ELSE 0 END) AS total_more_item,

        STRING_AGG(
          CASE 
            WHEN ISNULL(sa.scan_qty, 0) < hp.plan_qty THEN
              CONCAT(hp.pn_code, ' kurang ', hp.plan_qty - ISNULL(sa.scan_qty, 0), ' pcs')
            WHEN ISNULL(sa.scan_qty, 0) > hp.plan_qty THEN
              CONCAT(hp.pn_code, ' lebih ', ISNULL(sa.scan_qty, 0) - hp.plan_qty, ' pcs')
            ELSE NULL
          END,
          CHAR(10)
        ) AS problem_detail

      FROM dbo.DX_PMS_T_DailySchedule ds
      JOIN dbo.DX_PMS_M_LineProduct lp
        ON ds.line_product_id = lp.line_product_id
      JOIN dbo.DX_PMS_T_CountingTime ct
        ON ds.schedule_id = ct.schedule_id
      JOIN dbo.DX_PMS_T_HeijunkaPlan hp
        ON ds.schedule_id = hp.schedule_id
      LEFT JOIN ScanAgg sa
        ON hp.schedule_id = sa.schedule_id
       AND UPPER(LTRIM(RTRIM(hp.pn_code))) = sa.pn_code

      WHERE ds.schedule_id = @scheduleId
        AND ct.actual_finish IS NOT NULL
        AND ISNULL(ct.problem_code, '') NOT LIKE '%KANBAN_QTY_NOT_MATCH%'

      GROUP BY
        ds.schedule_id,
        ct.counting_id,
        ds.schedule_date,
        ds.shift_name,
        ds.cycle_no,
        lp.line_id,
        lp.product_name,
        ct.actual_finish,
        ct.problem_code

      HAVING
        SUM(CASE WHEN ISNULL(sa.scan_qty, 0) < hp.plan_qty THEN 1 ELSE 0 END) > 0
        OR
        SUM(CASE WHEN ISNULL(sa.scan_qty, 0) > hp.plan_qty THEN 1 ELSE 0 END) > 0;
    `);

  return result.recordset[0] || null;
};

const findScheduleByCycle = async ({ productName, scheduleDate, shiftName, cycleNo }) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('productName', sql.VarChar(50), productName)
    .input('scheduleDate', sql.Date, scheduleDate)
    .input('shiftName', sql.VarChar(20), shiftName)
    .input('cycleNo', sql.Int, cycleNo)
    .query(`
      SELECT TOP (1)
        ds.schedule_id,
        ds.schedule_date,
        ds.line_product_id,
        ds.shift_name,
        ds.cycle_no,
        ds.scheduled_start_dt,
        ds.scheduled_finish_dt,
        ds.target_ct_sec,
        lp.line_id,
        lp.product_name
      FROM dbo.DX_PMS_T_DailySchedule ds
      JOIN dbo.DX_PMS_M_LineProduct lp
        ON ds.line_product_id = lp.line_product_id
      WHERE lp.product_name = @productName
        AND ds.schedule_date = @scheduleDate
        AND ds.shift_name = @shiftName
        AND ds.cycle_no = @cycleNo;
    `);

  return result.recordset[0] || null;
};

const insertManualCounting = async ({
  scheduleId,
  actualStart,
  actualFinish,
  durationSec,
  status,
  problemCode,
  problemNote
}) => {
  const pool = await poolPromise;

  const result = await pool.request()
    .input('scheduleId', sql.Int, scheduleId)
    .input('actualStart', sql.DateTime, actualStart)
    .input('actualFinish', sql.DateTime, actualFinish)
    .input('durationSec', sql.Float, durationSec)
    .input('status', sql.VarChar(30), status)
    .input('problemCode', sql.VarChar(100), problemCode)
    .input('problemNote', sql.VarChar(255), problemNote)
    .query(`
      INSERT INTO dbo.DX_PMS_T_CountingTime
      (
        schedule_id,
        actual_start,
        actual_finish,
        duration_sec,
        status,
        problem_code,
        problem_note,
        start_source,
        finish_source
      )
      OUTPUT INSERTED.counting_id
      VALUES
      (
        @scheduleId,
        @actualStart,
        @actualFinish,
        @durationSec,
        @status,
        @problemCode,
        @problemNote,
        'WEB_MANUAL',
        CASE WHEN @actualFinish IS NULL THEN NULL ELSE 'WEB_MANUAL' END
      );
    `);

  return result.recordset[0];
};

const updateCountingById = async ({
  countingId,
  actualStart,
  actualFinish,
  durationSec,
  status,
  problemCode,
  problemNote
}) => {
  const pool = await poolPromise;

  await pool.request()
    .input('countingId', sql.Int, countingId)
    .input('actualStart', sql.DateTime, actualStart)
    .input('actualFinish', sql.DateTime, actualFinish)
    .input('durationSec', sql.Float, durationSec)
    .input('status', sql.VarChar(30), status)
    .input('problemCode', sql.VarChar(100), problemCode)
    .input('problemNote', sql.VarChar(255), problemNote)
    .query(`
      UPDATE dbo.DX_PMS_T_CountingTime
      SET
        actual_start = @actualStart,
        actual_finish = @actualFinish,
        duration_sec = @durationSec,
        status = @status,
        problem_code = @problemCode,
        problem_note = @problemNote,
        updated_at = GETDATE()
      WHERE counting_id = @countingId;
    `);
};

const deleteCountingById = async ({ countingId }) => {
  const pool = await poolPromise;

  await pool.request()
    .input('countingId', sql.Int, countingId)
    .query(`
      DELETE FROM dbo.DX_PMS_T_CountingTime
      WHERE counting_id = @countingId;
    `);
};

const getExpiredOpenCountings = async (currentTime) => {
  const pool = await poolPromise;
  
  const result = await pool.request()
    .input('currentTime', sql.DateTime, currentTime)
    .query(`
      SELECT 
        ct.counting_id,
        ct.actual_start,
        ds.scheduled_start_dt,
        ds.scheduled_finish_dt,
        ds.target_ct_sec,
        lp.product_name
      FROM dbo.DX_PMS_T_CountingTime ct
      JOIN dbo.DX_PMS_T_DailySchedule ds ON ct.schedule_id = ds.schedule_id
      JOIN dbo.DX_PMS_M_LineProduct lp ON ds.line_product_id = lp.line_product_id
      WHERE ct.actual_finish IS NULL
        AND @currentTime >= ds.scheduled_finish_dt
        AND NOT EXISTS (
            SELECT 1 FROM dbo.DX_PMS_T_DailySchedule ds2
            WHERE ds2.line_product_id = ds.line_product_id
              AND @currentTime >= ds2.scheduled_start_dt
              AND @currentTime < ds2.scheduled_finish_dt
        );
    `);

  return result.recordset;
};

module.exports = {
  findActiveSchedule,
  findOpenCounting,
  findCountingBySchedule,
  insertCountingStart,
  updateCountingFinish,
  getPlanCountByPn,
  insertScannedKanban,
  getMonitoring,
  getScans,
  getHeijunka,
  getFinishedCycleKanbanProblem,
  updateCountingProblem,
  getKanbanProblemByScheduleId,
  findScheduleByCycle,
  insertManualCounting,
  updateCountingById,
  deleteCountingById,
  getExpiredOpenCountings
};