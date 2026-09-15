const { sql, poolPromise } = require('../config/db');

const getMasterSchedule = async () => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT 
        shift_name, 
        cycle_no, 
        -- Mengubah format waktu SQL menjadi string HH:mm agar mudah dibaca React
        CONVERT(varchar(5), start_time, 108) as start_time, 
        CONVERT(varchar(5), finish_time, 108) as finish_time
      FROM DX_PMS_M_CycleSchedule
      ORDER BY shift_name, cycle_no
    `);
    return result.recordset;
  } catch (err) {
    console.error('Error fetching master schedule:', err.message);
    throw err;
  }
};

module.exports = { getMasterSchedule }; // Gabungkan jika ada fungsi lain