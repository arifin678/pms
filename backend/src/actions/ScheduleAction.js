const scheduleModel = require('../models/ScheduleModel');
const axios = require('axios'); // WAJIB di-install untuk menembak ESP32

// --- A. LOGIKA UNTUK DATABASE SQL ---

const fetchMasterSchedule = async (req, res) => {
  try {
    const data = await scheduleModel.getMasterSchedule();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateMasterSchedule = async (req, res) => {
  try {
    const { shift_name, cycle_no, start_time, finish_time } = req.body;
    await scheduleModel.updateSchedule(shift_name, cycle_no, start_time, finish_time);
    res.json({ success: true, message: 'Jadwal berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// --- B. LOGIKA PROXY UNTUK HARDWARE ESP32 ---

const controlESP32 = async (req, res) => {
  const { ip_esp32, action, value_ms } = req.body;

  try {
    let esp32_url = "";
    
    // Merakit URL target sesuai IP yang dikirim dari React
    if (action === 'reset') {
      esp32_url = `http://${ip_esp32}/api/reset`;
    } else if (action === 'duration') {
      esp32_url = `http://${ip_esp32}/api/duration?ms=${value_ms}`;
    }

    console.log(`[Hardware Proxy] Menembak ESP32: ${esp32_url}`);
    
    // Menembak ESP32 dengan batas waktu (timeout) 5 detik
    const hardware_response = await axios.get(esp32_url, { timeout: 5000 });

    res.json({ 
      success: true, 
      hardware_message: hardware_response.data 
    });

  } catch (error) {
    console.error("[!] Gagal terhubung ke ESP32:", error.message);
    res.status(504).json({ 
      success: false, 
      error: "ESP32 Timeout / Tidak berada di jaringan yang sama" 
    });
  }
};

module.exports = { fetchMasterSchedule, updateMasterSchedule, controlESP32 };