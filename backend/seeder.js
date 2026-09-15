const bcrypt = require('bcryptjs');
const { sql, poolPromise } = require('./src/config/db'); // Sesuaikan path db Anda

const seedUsers = async () => {
  try {
    const pool = await poolPromise;
    
    // Hash Password
    const hashPMS = await bcrypt.hash('Pms@2026', 10);
    const hashAdmin = await bcrypt.hash('2250705', 10);

    // Inject ke Database
    await pool.request().query(`
      INSERT INTO [DX_PMS_M_Users] (user_id, password_hash, role, name)
      VALUES 
      ('PMS', '${hashPMS}', 'viewer', 'PMS Viewer Account'),
      ('2250705', '${hashAdmin}', 'admin', 'Super Admin')
    `);
    
    console.log('✅ Akun berhasil dibuat dengan standar Bcrypt!');
    process.exit(0);
  } catch (err) {
    console.error('Gagal:', err);
  }
};
seedUsers();