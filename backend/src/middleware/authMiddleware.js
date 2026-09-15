const jwt = require('jsonwebtoken');

const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Akses Ditolak. Token tidak ada.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Akses Dilarang. Hanya Admin yang diizinkan melakukan aksi ini.' });
    }
    
    req.user = decoded;
    next();
  } catch (err) {
    console.error("JWT Verification Error:", err.message);

    return res.status(401).json({ success: false, message: 'Token tidak valid atau kadaluarsa.' });
  }
};

module.exports = { verifyAdmin };