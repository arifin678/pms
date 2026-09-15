const accuracyModel = require('../models/dashboardAccuracyModel');

const fetchAccuracyProducts = async (req, res) => {
  const { date } = req.query;
  try {
    const data = await accuracyModel.getAccuracyProductsByDate(date);
    res.json(data);
  } catch (err) {
    console.error('Fetch Accuracy Products Error:', err.message || err);
    res.status(500).json({ success: false, message: 'Gagal mengambil data akurasi' });
  }
};

module.exports = {
    fetchAccuracyProducts
};