const lineSummaryModel = require('../models/lineSummaryModel');

const getMonitoring = async (req, res) => {
  try {
    const { product, date } = req.query;
    if (!product || !date) return res.status(400).json({ error: 'Product dan Date wajib diisi' });

    const data = await lineSummaryModel.getMonitoringByLineAndDate(product, date);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getHeijunka = async (req, res) => {
  try {
    const { product, date } = req.query;
    if (!product || !date) return res.status(400).json({ error: 'Product dan Date wajib diisi' });

    const data = await lineSummaryModel.getHeijunkaByLineAndDate(product, date);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Tambahkan fungsi ini di dalam lineSummaryAction.js
const getPics = async (req, res) => {
  try {
    const data = await lineSummaryModel.getMasterPics();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Pastikan diekspor:
module.exports = { getMonitoring, getHeijunka, getPics };