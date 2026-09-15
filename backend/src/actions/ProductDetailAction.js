const countingModel = require('../models/ProductDetailModel');

const saveCounting = async (req, res) => {
  try {
    await countingModel.createCounting(req.body);
    res.json({ success: true, message: 'Data berhasil ditambahkan' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

const updateCounting = async (req, res) => {
  try {
    await countingModel.updateCounting(req.params.id, req.body);
    res.json({ success: true, message: 'Data berhasil diperbarui' });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
};

module.exports = { saveCounting, updateCounting };