const pmsModel = require('../models/pmsModel');
const { poolPromise } = require('../config/db');
const axios = require('axios'); 
const actionLocks = new Set();
const ESP_IP = process.env.ESP32_TARGET_IP;

const syncESP32 = async (command) => {
  if (!ESP_IP) {
    console.warn('[ESP32 SYNC] Abaikan ping: ESP32_TARGET_IP belum diatur di .env');
    return;
  }

  try {
    await axios.get(`http://${ESP_IP}/api/force_${command}`, { timeout: 3000 });
    console.log(`[ESP32 SYNC] Berhasil memaksa ESP32 untuk: FORCE ${command.toUpperCase()}`);
  } catch (err) {
    console.log(`[ESP32 SYNC] ESP32 tidak terhubung. Alasan: ${err.message}`);
  }
};

const formatDateOnlyLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getEventTime = (inputTime) => {
  if (!inputTime) return new Date();
  const d = new Date(inputTime);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const getProductName = (req) => {
  return (
    req.body?.productName ||
    req.body?.product ||
    req.query?.productName ||
    req.query?.product ||
    'Alternator'
  );
};

const normalizePnCode = (rawValue) => {
  let value = String(rawValue || '').trim();
  try {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      const url = new URL(value);
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        // Menggunakan .at(-1) sesuai saran SonarQube (S7755)
        value = decodeURIComponent(pathParts.at(-1));
      }
    }
  } catch (err) {}
  return value.toUpperCase();
};

const getCountingStatus = (actualStart, actualFinish, scheduledStart, scheduledFinish, targetCtSec) => {
  const durationSec = Math.round((actualFinish.getTime() - actualStart.getTime()) / 1000);

  if (durationSec > targetCtSec) {
    return { status: 'ABNORMAL', problem_code: 'More Than 13 Min', durationSec };
  }
  if (scheduledFinish && actualFinish.getTime() > scheduledFinish.getTime()) {
    return { status: 'ABNORMAL', problem_code: 'Delay Finish', durationSec };
  }

  const LATE_START_TOLERANCE_MS = 2 * 60 * 1000;
  if (scheduledStart && (actualStart.getTime() - scheduledStart.getTime() > LATE_START_TOLERANCE_MS)) {
    return { status: 'DELAY', problem_code: 'Delay Start', durationSec };
  }

  return { status: 'NORMAL', problem_code: null, durationSec };
};

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const calculateManualStatus = ({ actualStart, actualFinish, schedule }) => {
  if (!actualStart || !actualFinish) {
    return { durationSec: null, status: 'COUNTING', problemCode: null };
  }

  const durationSec = Math.round((actualFinish.getTime() - actualStart.getTime()) / 1000);
  const scheduledStart = schedule?.scheduled_start_dt ? new Date(schedule.scheduled_start_dt) : null;
  const scheduledFinish = schedule?.scheduled_finish_dt ? new Date(schedule.scheduled_finish_dt) : null;
  const targetCtSec = Number(schedule?.target_ct_sec || 780);

  if (durationSec > targetCtSec) {
    return { durationSec, status: 'ABNORMAL', problemCode: 'OVER_CT' };
  }
  if (scheduledFinish && actualFinish.getTime() > scheduledFinish.getTime()) {
    return { durationSec, status: 'ABNORMAL', problemCode: 'LATE_FINISH' };
  }
  if (scheduledStart && actualStart.getTime() > scheduledStart.getTime()) {
    return { durationSec, status: 'DELAY', problemCode: 'LATE_START' };
  }

  return { durationSec, status: 'NORMAL', problemCode: null };
};

// Ekstraksi fungsi untuk memeriksa jadwal masa depan (Menurunkan Cognitive Complexity)
const getUnfilledFutureSchedule = async (productName, futureTime, currentScheduleId) => {
  const futureSchedule = await pmsModel.findActiveSchedule(productName, futureTime);
  
  // Guard Clauses: Return lebih awal jika kondisi tidak terpenuhi (Tanpa Nested If)
  if (!futureSchedule) return null;
  if (currentScheduleId && futureSchedule.schedule_id === currentScheduleId) return null;

  const futureExisting = await pmsModel.findCountingBySchedule(futureSchedule.schedule_id);
  if (futureExisting) return null;

  return futureSchedule;
};

// Fungsi utama sekarang diratakan (Flat Logic) menggunakan pola Early Return (S3776)
const resolveScheduleWithAllowance = async (productName, startTime, currentSchedule) => {
  const futureTime = new Date(startTime.getTime() + (5 * 60000));
  const currentId = currentSchedule ? currentSchedule.schedule_id : null;

  // Kasus 1: Tidak ada jadwal aktif saat ini
  if (!currentSchedule) {
    const validFuture = await getUnfilledFutureSchedule(productName, futureTime, null);
    if (validFuture) {
      console.log(`[ALLOWANCE] Curi start terdeteksi di luar jadwal! Masuk ke Cycle ${validFuture.cycle_no}.`);
    }
    return validFuture;
  }

  // Kasus 2: Jadwal aktif ada. Cek apakah Cycle tersebut sudah pernah dikerjakan
  const existingCycle = await pmsModel.findCountingBySchedule(currentId);
  if (!existingCycle) {
    return currentSchedule; // Belum dikerjakan, aman digunakan
  }

  // Kasus 3: Jadwal saat ini SUDAH selesai. Cek apakah bisa curi start jadwal berikutnya
  const validFuture = await getUnfilledFutureSchedule(productName, futureTime, currentId);
  if (validFuture) {
    console.log(`[ALLOWANCE] Curi start terdeteksi! Waktu digeser ke Cycle ${validFuture.cycle_no}.`);
    return validFuture;
  }

  // Kasus Default: Tetap kembalikan jadwal saat ini (Sistem di bawah akan memblokirnya karena sudah terisi)
  return currentSchedule;
};

const createPmsAction = (io) => {
    
  // CRON JOB: AUTO-FINISH JAM ISTIRAHAT
  setInterval(async () => {
    try {
      const currentTime = new Date(); 
      const expiredData = await pmsModel.getExpiredOpenCountings(currentTime); 
      
      for (let row of expiredData) {
        const actualStart = new Date(row.actual_start);
        const scheduledFinish = new Date(row.scheduled_finish_dt);
        const scheduledStart = new Date(row.scheduled_start_dt);
        const targetCt = Number(row.target_ct_sec || 780);

        const statusResult = getCountingStatus(actualStart, scheduledFinish, scheduledStart, scheduledFinish, targetCt);

        await pmsModel.updateCountingFinish({
          countingId: row.counting_id,
          actualFinish: scheduledFinish, 
          durationSec: statusResult.durationSec,
          status: 'ABNORMAL',
          problemCode: 'Auto Close (Rest Time)',
          problemNote: '',
          finishSource: 'SYSTEM_CRON'
        });

        console.log(`[CRON SYSTEM] Auto-Close Cycle ID: ${row.counting_id} (Jam Istirahat)`);
        syncESP32('finish');
        io.emit('update_dashboard_realtime', { success: true, message: 'Auto Close Triggered' });
      }
    } catch (err) {
      console.error('[CRON ERROR] Gagal menjalankan Auto-Finish:', err.message);
    }
  }, 60000);

  const executeStartCounting = async (productName, startTime, startSource, userId) => {
    try {
      const openCounting = await pmsModel.findOpenCounting(productName);
      if (openCounting) {
        console.warn(`[BLOCKED] Cycle ${openCounting.cycle_no} pada ${productName} belum FINISH!`);
        return {
          success: false,
          code: 'OPEN_COUNTING_EXISTS',
          message: `Cycle ${openCounting.cycle_no} belum FINISH! Selesaikan cycle ini terlebih dahulu.`,
          data: openCounting
        };
      }

      let schedule = await pmsModel.findActiveSchedule(productName, startTime);

      // Memanggil helper fungsi allowance yang sudah di-ekstrak (S3776)
      schedule = await resolveScheduleWithAllowance(productName, startTime, schedule);
      
      if (!schedule) {
        console.warn(`[REJECTED] Tidak ditemukan schedule aktif untuk ${productName} pada jam ${startTime}`);
        return {
          success: false,
          code: 'SCHEDULE_NOT_FOUND',
          message: `Schedule tidak ditemukan untuk produk ${productName} pada jam ini.`
        };
      }

      // VALIDASI MUTLAK: TOLAK JIKA BELUM MASUK WAKTU ALLOWANCE 5 MENIT
      const scheduledStartDt = new Date(schedule.scheduled_start_dt);
      const earliestAllowedTime = new Date(scheduledStartDt.getTime() - (5 * 60000));

      if (startTime.getTime() < earliestAllowedTime.getTime()) {
        const pad = (n) => String(n).padStart(2, '0');
        const jamBolehBuka = `${pad(earliestAllowedTime.getHours())}.${pad(earliestAllowedTime.getMinutes())}`;
        
        console.warn(`[BLOCKED] Terlalu cepat! Cycle ${schedule.cycle_no} baru bisa dimulai pukul ${jamBolehBuka}`);
        return {
          success: false,
          code: 'TOO_EARLY',
          message: `Terlalu cepat! Cycle ${schedule.cycle_no} baru bisa di-scan paling cepat 5 menit sebelum jadwal (Pukul ${jamBolehBuka}).`
        };
      }

      const finalExistingCycle = await pmsModel.findCountingBySchedule(schedule.schedule_id);
      if (finalExistingCycle) {
        console.warn(`[BLOCKED] Schedule ID ${schedule.schedule_id} (Cycle ${schedule.cycle_no}) sudah terisi sebelumnya!`);
        return {
          success: false,
          code: 'CYCLE_ALREADY_EXISTS',
          message: `Siklus ${schedule.cycle_no} sudah dikerjakan sebelumnya. Harap tunggu hingga jam siklus berikutnya.`
        };
      }

      const inserted = await pmsModel.insertCountingStart({
        scheduleId: schedule.schedule_id,
        actualStart: startTime,
        startSource,
        userId
      });

      const responseData = {
        success: true,
        code: 'START_ACCEPTED',
        message: 'START counting berhasil',
        counting_id: inserted.counting_id,
        schedule_id: schedule.schedule_id,
        product: schedule.product_name || productName,
        user_id: userId,
        line_id: schedule.line_id,
        shift_name: schedule.shift_name,
        cycle_no: schedule.cycle_no,
        actual_start: startTime,
        status: 'COUNTING',
        source: startSource
      };

      io.emit('update_counting_time', responseData);
      io.emit('update_dashboard_realtime', responseData);

      return responseData;
    } catch (err) {
      console.error('❌ Execute START error:', err.message);
      return { success: false, code: 'INTERNAL_ERROR', message: err.message };
    }
  };

  const getActiveCounting = async (req, res) => {
    try {
      const productName = getProductName(req);
      const openCounting = await pmsModel.findOpenCounting(productName);

      if (!openCounting) {
        return res.json({ success: true, hasActive: false, message: 'Tidak ada counting aktif' });
      }

      return res.json({
        success: true,
        hasActive: true,
        data: {
          counting_id: openCounting.counting_id,
          schedule_id: openCounting.schedule_id,
          cycle_no: openCounting.cycle_no,
          shift_name: openCounting.shift_name,
          line_id: openCounting.line_id,
          product_name: openCounting.product_name,
          start_time: openCounting.actual_start,
          user_id: openCounting.user_id
        }
      });
    } catch (err) {
      console.error('❌ getActiveCounting error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    }
  };

  const currentSchedule = async (req, res) => {
    try {
      const productName = getProductName(req);
      const eventTime = getEventTime(req.query.time);

      const schedule = await pmsModel.findActiveSchedule(productName, eventTime);

      if (!schedule) {
        return res.status(404).json({
          success: false,
          message: 'Tidak ada schedule aktif untuk waktu ini',
          productName,
          eventTime
        });
      }

      res.json({ success: true, schedule });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  const startCounting = async (req, res) => {
    const productName = getProductName(req);

    console.log(`\n[API HIT] Menerima request START (${productName}) dari IP: ${req.ip}`);
    console.log(`[API HIT] Payload:`, req.body);

    if (actionLocks.has(productName)) {
      return res.status(429).json({ success: false, code: 'LOCKED', message: 'DITOLAK: Sistem sedang memproses request lain.' });
    }

    actionLocks.add(productName);

    try {
      const startTime = getEventTime(req.body.startTime || req.body.actual_start);
      const startSource = req.body.source || 'ESP32_RFID';
      const userId = req.body.user_id || req.body.operator_id || null;

      const result = await executeStartCounting(productName, startTime, startSource, userId);

      if (!result.success) {
        if (result.code === 'OPEN_COUNTING_EXISTS') {
          return res.status(409).json(result);
        }
        if (result.code === 'SCHEDULE_NOT_FOUND') {
          return res.status(404).json(result);
        }
        if (result.code === 'TOO_EARLY') {
          return res.status(403).json(result); 
        }
        return res.status(500).json(result);
      }

      return res.status(201).json(result);
    } catch (err) {
      console.error('❌ START counting error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      actionLocks.delete(productName);
    }
  };

  const finishCounting = async (req, res) => {
    const productName = getProductName(req);

    console.log(`\n[API HIT] Menerima request FINISH (${productName}) dari IP: ${req.ip}`);
    console.log(`[API HIT] Payload:`, req.body);

    if (actionLocks.has(productName)) {
      return res.status(429).json({ success: false, code: 'LOCKED', message: 'DITOLAK: Sistem sedang memproses request lain.' });
    }

    actionLocks.add(productName);

    try {
      const finishTime = getEventTime(req.body.finishTime || req.body.actual_finish);
      const finishSource = req.body.source || 'ESP32_RFID';
      const userId = req.body.user_id || req.body.operator_id || null;

      const openCounting = await pmsModel.findOpenCounting(productName);

      if (!openCounting) {
        return res.status(404).json({
          success: false,
          code: 'NO_OPEN_COUNTING',
          message: 'FINISH ditolak: tidak ada cycle START aktif untuk produk ini.'
        });
      }

      if (openCounting.user_id && userId && String(openCounting.user_id).trim() !== String(userId).trim()) {
        return res.status(403).json({
          success: false,
          code: 'USER_MISMATCH',
          message: `FINISH ditolak: ID RFID (${userId}) berbeda dengan operator Start (${openCounting.user_id})`
        });
      }

      const actualStart = new Date(openCounting.actual_start);
      const scheduledStart = openCounting.scheduled_start_dt ? new Date(openCounting.scheduled_start_dt) : null;
      const scheduledFinish = openCounting.scheduled_finish_dt ? new Date(openCounting.scheduled_finish_dt) : null;
      const targetCtSec = Number(openCounting.target_ct_sec || 780);

      const statusResult = getCountingStatus(actualStart, finishTime, scheduledStart, scheduledFinish, targetCtSec);

      await pmsModel.updateCountingFinish({
        countingId: openCounting.counting_id,
        actualFinish: finishTime,
        durationSec: statusResult.durationSec,
        status: statusResult.status,
        problemCode: statusResult.problem_code,
        problemNote: null,
        finishSource
      });

      console.log(`[STATE] ${productName}: FINISH Sukses oleh User ${userId || openCounting.user_id}.`);

      const responseData = {
        success: true,
        code: 'FINISH_ACCEPTED',
        message: 'FINISH counting berhasil',
        counting_id: openCounting.counting_id,
        schedule_id: openCounting.schedule_id,
        product: openCounting.product_name || productName,
        user_id: openCounting.user_id,
        line_id: openCounting.line_id,
        shift_name: openCounting.shift_name,
        cycle_no: openCounting.cycle_no,
        actual_start: actualStart,
        actual_finish: finishTime,
        duration_sec: statusResult.durationSec,
        status: statusResult.status,
        problem_code: statusResult.problem_code,
      };

      io.emit('update_counting_time', responseData);
      io.emit('update_dashboard_realtime', responseData);

      const kanbanProblem = await pmsModel.getKanbanProblemByScheduleId({
        scheduleId: openCounting.schedule_id
      });

      if (kanbanProblem) {
        io.emit('kanban_problem_alert', { success: true, hasProblem: true, data: kanbanProblem });
      }

      return res.status(200).json({ ...responseData, kanban_problem: kanbanProblem || null });
    } catch (err) {
      console.error('❌ FINISH counting error:', err.message);
      return res.status(500).json({ success: false, error: err.message });
    } finally {
      actionLocks.delete(productName);
    }
  };

  const createManualCounting = async (req, res) => {
    try {
      const productName = getProductName(req);
      const scheduleDate = req.body.schedule_date;
      const shiftName = req.body.shift_name;
      const cycleNo = Number(req.body.cycle_no);

      const actualStart = toDateOrNull(req.body.actual_start);
      const actualFinish = toDateOrNull(req.body.actual_finish);
      // Variabel problemNote dihapus sesuai arahan SonarQube (S1481) karena tidak dipakai di sini

      if (!scheduleDate || !shiftName || !cycleNo || !actualStart) {
        return res.status(400).json({ success: false, message: 'Data esensial wajib diisi' });
      }

      const schedule = await pmsModel.findScheduleByCycle({ productName, scheduleDate, shiftName, cycleNo });

      if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule tidak ditemukan' });
      }

      const resultStatus = calculateManualStatus({ actualStart, actualFinish, schedule });

      const inserted = await pmsModel.insertManualCounting({
        scheduleId: schedule.schedule_id,
        actualStart,
        actualFinish,
        durationSec: resultStatus.durationSec,
        status: resultStatus.status,
        problemCode: resultStatus.problemCode,
      });

      const responseData = { success: true, message: 'Data berhasil ditambahkan', counting_id: inserted.counting_id };

      io.emit('update_dashboard_realtime', responseData);
      io.emit('update_counting_time', responseData);

      res.json(responseData);

      if (!actualFinish) {
        syncESP32('start'); 
      } else {
        syncESP32('finish');
      }

    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      } else {
        console.error("Error Background Create:", err.message);
      }
    }
  };

  const updateManualCounting = async (req, res) => {
    try {
      const countingId = Number(req.params.countingId);
      const productName = getProductName(req);
      const scheduleDate = req.body.schedule_date;
      const shiftName = req.body.shift_name;
      const cycleNo = Number(req.body.cycle_no);

      const actualStart = toDateOrNull(req.body.actual_start);
      const actualFinish = toDateOrNull(req.body.actual_finish);
      const problemNote = String(req.body.problem_code || '').trim() || null;

      if (!countingId || !actualStart) {
        return res.status(400).json({ success: false, message: 'Data esensial tidak valid' });
      }

      const schedule = await pmsModel.findScheduleByCycle({ productName, scheduleDate, shiftName, cycleNo });

      if (!schedule) {
        return res.status(404).json({ success: false, message: 'Schedule tidak ditemukan' });
      }

      const resultStatus = calculateManualStatus({ actualStart, actualFinish, schedule });

      await pmsModel.updateCountingById({
        countingId, actualStart, actualFinish, durationSec: resultStatus.durationSec,
        status: resultStatus.status, problemCode: resultStatus.problemCode, problemNote
      });

      const responseData = { success: true, message: 'Data berhasil diupdate', counting_id: countingId };

      io.emit('update_dashboard_realtime', responseData);
      io.emit('update_counting_time', responseData);

      res.json(responseData);
      syncESP32('finish');

    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      } else {
        console.error("Error Background Update:", err.message);
      }
    }
  };

  const deleteManualCounting = async (req, res) => {
    try {
      const countingId = Number(req.params.countingId);
      if (!countingId) return res.status(400).json({ success: false, message: 'countingId tidak valid' });

      await pmsModel.deleteCountingById({ countingId });
      const responseData = { success: true, message: 'Data berhasil dihapus', counting_id: countingId };

      io.emit('update_dashboard_realtime', responseData);
      io.emit('update_counting_time', responseData);
      
      res.json(responseData);
      syncESP32('finish');
      
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      } else {
        console.error("Error Background Delete:", err.message);
      }
    }
  };

  const health = async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`SELECT GETDATE() AS server_time, DB_NAME() AS database_name`);
      res.json({ success: true, message: 'Backend OK', data: result.recordset[0] });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  const scanKanban = async (req, res) => {
    try {
      const barcode = req.body.barcode || req.body.QRCodeData || req.body.qr_code_data || '';
      const productName = getProductName(req);
      const scanTime = getEventTime(req.body.startTime || req.body.scanTime);
      const scanSource = req.body.source || 'MOBILE_SCANNER';

      if (!barcode) return res.status(400).json({ success: false, message: 'barcode kosong' });

      const qrCodeData = String(barcode).trim();
      const pnCode = normalizePnCode(qrCodeData);

      const schedule = await pmsModel.findActiveSchedule(productName, scanTime);
      const scheduleId = schedule ? schedule.schedule_id : null;

      const planCount = await pmsModel.getPlanCountByPn(scheduleId, pnCode);
      
      // Memecah Nested Ternary sesuai perintah SonarQube (S3358)
      let scanResult = 'WRONG_KANBAN';
      if (!scheduleId) {
        scanResult = 'OUT_OF_SCHEDULE';
      } else if (planCount > 0) {
        scanResult = 'MATCH';
      }

      const inserted = await pmsModel.insertScannedKanban({
        scheduleId,
        scanTime,
        qrCodeData,
        pnCode,
        scanQty: 1,
        scanSource,
        scanResult
      });

      const responseData = {
        success: true,
        message: 'Scan tersimpan',
        scan_id: inserted.scan_id,
        schedule_id: scheduleId,
        pn_code: pnCode,
        qr_code_data: qrCodeData,
        scan_time: scanTime,
        scan_result: scanResult,
        schedule
      };

      io.emit('update_scan_transaction', responseData);
      io.emit('update_dashboard_realtime', responseData);

      res.status(200).json({ success: true, message: 'Scan tersimpan', data: responseData });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  const getMonitoring = async (req, res) => {
    try {
      const date = req.query.date || formatDateOnlyLocal(new Date());
      const productName = req.query.product || req.query.productName || null;
      const data = await pmsModel.getMonitoring({ date, productName });
      res.json(data);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  const getScans = async (req, res) => {
    try {
      const date = req.query.date || formatDateOnlyLocal(new Date());
      const productName = req.query.product || req.query.productName || null;
      const data = await pmsModel.getScans({ date, productName });
      res.json(data);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  const getHeijunka = async (req, res) => {
    try {
      const date = req.query.date || formatDateOnlyLocal(new Date());
      const productName = req.query.product || req.query.productName || 'Alternator';
      const data = await pmsModel.getHeijunka({ date, productName });
      res.json(data);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  const handleSocketConnection = (socket) => {
    socket.on('scan_barcode', async (data) => {
      try {
        const fakeReq = {
          body: { barcode: data.barcode || '', product: data.product || 'Alternator', scanTime: data.scanTime, source: 'SOCKET' },
          query: {}
        };
        const fakeRes = { status: () => fakeRes, json: (payload) => socket.emit('scan_response', payload) };
        await scanKanban(fakeReq, fakeRes);
      } catch (err) {
        socket.emit('scan_error', { success: false, error: err.message });
      }
    });
  };

  const getKanbanProblemAlert = async (req, res) => {
    try {
      const productName = getProductName(req);
      const problem = await pmsModel.getFinishedCycleKanbanProblem({ productName });
      if (!problem) return res.json({ success: true, hasProblem: false, message: 'Aman' });
      res.json({ success: true, hasProblem: true, data: problem });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  const submitCountingProblem = async (req, res) => {
    try {
      const countingId = Number(req.body.counting_id || req.body.countingId);
      const problemNote = String(req.body.problem_code || req.body.problemNote || '').trim();

      if (!countingId || !problemNote) {
        return res.status(400).json({ success: false, message: 'ID dan Note wajib diisi' });
      }

      await pmsModel.updateCountingProblem({ countingId, problemCode: 'KANBAN_QTY_NOT_MATCH', problemNote });

      const responseData = {
        success: true,
        message: 'Tersimpan',
        counting_id: countingId,
        problem_code: 'KANBAN_QTY_NOT_MATCH',
        problem_note: problemNote // Diperbaiki dari duplikasi problem_code (S1534)
      };

      io.emit('update_counting_problem', responseData);
      io.emit('update_dashboard_realtime', responseData);

      res.json(responseData);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  };

  return {
    getActiveCounting,
    health,
    currentSchedule,
    startCounting,
    finishCounting,
    scanKanban,
    getMonitoring,
    getScans,
    getHeijunka,
    handleSocketConnection,
    getKanbanProblemAlert,
    submitCountingProblem,
    createManualCounting,
    updateManualCounting,
    deleteManualCounting
  };
};

module.exports = createPmsAction;