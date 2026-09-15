const dashboardModel = require('../models/dashboardModel');

// --- FUNGSI UNTUK TIME PERFORMANCE (KIRI) ---
const getSummary = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const data = await dashboardModel.getSummaryByDate(date);
    res.json(data || { avg_ct_sec: 0, highest_ct_sec: 0, lowest_ct_sec: 0, performance: 0 });
  } catch (err) {
    console.error('Error /summary:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

const getProducts = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const data = await dashboardModel.getProductsByDate(date);
    res.json(data || []);
  } catch (err) {
    console.error('Error /products:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

const getDaily = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1);
    const data = await dashboardModel.getDailyByMonth(year, month);
    res.json(data || []);
  } catch (err) {
    console.error('Error /daily:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

const getMonthly = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const data = await dashboardModel.getMonthlyByYear(year);
    res.json(data || []);
  } catch (err) {
    console.error('Error /monthly:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// --- FUNGSI BARU UNTUK ACCURACY PERFORMANCE (KANAN) ---

const getAccuracyProducts = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const data = await dashboardModel.getAccuracyProductsByDate(date);
    res.json(data || []);
  } catch (err) {
    console.error('Error /accuracy/products:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

const getAccuracyDaily = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const month = Number(req.query.month) || (new Date().getMonth() + 1);
    const data = await dashboardModel.getAccuracyDailyByMonth(year, month);
    res.json(data || []);
  } catch (err) {
    console.error('Error /accuracy/daily:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

const getAccuracyMonthly = async (req, res) => {
  try {
    const year = Number(req.query.year) || new Date().getFullYear();
    const data = await dashboardModel.getAccuracyMonthlyByYear(year);
    res.json(data || []);
  } catch (err) {
    console.error('Error /accuracy/monthly:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { 
  getSummary, getProducts, getDaily, getMonthly,
  getAccuracyProducts, getAccuracyDaily, getAccuracyMonthly 
};