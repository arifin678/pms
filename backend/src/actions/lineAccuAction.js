const lineAccuModel = require('../models/lineAccuModel');

const fetchHeijunka = async (req, res) => {
  const { product, date } = req.query;
  try {
    if (!product || !date) {
      return res.status(400).json({ success: false, message: 'Parameter product dan date wajib diisi!' });
    }
    const data = await lineAccuModel.getHeijunkaPlan(product, date);
    res.json(data);
  } catch (err) {
    console.error('Error Heijunka Action:', err.message);
    res.status(500).json({ success: false, message: 'Gagal mengambil data Heijunka' });
  }
};

const fetchScans = async (req, res) => {
  const { product, date } = req.query;
  try {
    if (!product || !date) {
      return res.status(400).json({ success: false, message: 'Parameter product dan date wajib diisi!' });
    }
    const data = await lineAccuModel.getScansKanban(product, date);
    res.json(data);
  } catch (err) {
    console.error('Error Scans Action:', err.message);
    res.status(500).json({ success: false, message: 'Gagal mengambil data Scans' });
  }
};

module.exports = {
  fetchHeijunka,
  fetchScans
};