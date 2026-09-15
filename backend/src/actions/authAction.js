const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sql, poolPromise } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET; // Idealnya taruh di file .env

const login = async (req, res) => {
  const { userId, password } = req.body;

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input('user_id', sql.VarChar, userId)
      .query(`SELECT * FROM DX_PMS_M_Users WHERE user_id = @user_id`);

    const user = result.recordset[0];

    // 1. Cek User Ada atau Tidak
    if (!user) {
      return res.status(401).json({ success: false, message: 'ID atau Password salah!' });
    }

    // 2. Verifikasi Password Bcrypt
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'ID atau Password salah!' });
    }

    // 3. Terbitkan Token JWT
    const token = jwt.sign(
      { userId: user.user_id, role: user.role }, 
      JWT_SECRET, 
      { expiresIn: '12h' } // Token mati otomatis dalam 12 jam
    );

    res.json({
      success: true,
      token,
      user: { userId: user.user_id, role: user.role, name: user.name }
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = { login };