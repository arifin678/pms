require('dotenv').config(); // Tambahkan baris ini di paling atas
const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, // SonarQube tidak akan protes lagi
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    connectionTimeout: 30000,
    requestTimeout: 60000,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    },
  options: {
    instanceName: 'SQLEXPRESS',
    encrypt: false,
    trustServerCertificate: true,
    useUTC: false,
    enableArithAbort: true
  }
};

const pool = new sql.ConnectionPool(dbConfig);

const poolPromise = pool.connect()
  .then(pool => {
    console.log('Connected to SQL Server Database.');
    return pool;
  })
  .catch(err => {
    console.error('Database Connection Failed! Bad Config: ', err);
    process.exit(1);
  });

module.exports = {
  sql,
  poolPromise
};