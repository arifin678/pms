const express = require('express');
const cors = require('cors');
const http = require('node:http');
const { Server } = require('socket.io');

const { poolPromise } = require('./src/config/db');
const createPmsAction = require('./src/actions/pmsAction');

const app = express();
const server = http.createServer(app);

const corsOptions = {
    origin: [
        'http://localhost:5173',      
        process.env.CLIENT_URL 
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true 
};

const io = new Server(server, {
    cors: corsOptions
});

const dashboardAction = require('./src/actions/dashboardAction');
const lineSummaryAction = require('./src/actions/lineSummaryAction');
const lineAccuAction = require('./src/actions/lineAccuAction');
const pmsAction = createPmsAction(io);
const countingAction = require('./src/actions/ProductDetailAction');
const scheduleAction = require('./src/actions/ScheduleAction');

const accuracyAction = require('./src/actions/dashboardAccuracyAction');

const authAction = require('./src/actions/authAction');
const { verifyAdmin } = require('./src/middleware/authMiddleware');
require('dotenv').config()

app.use(cors(corsOptions));
app.use(express.json());


// TEST KONEKSI DATABASE

poolPromise
  .then((pool) => {
    if (pool.connected) {
      console.log('✅ STATUS: Berhasil terhubung ke SQL Server DX_TRIAL');
    }
  })
  .catch((err) => {
    console.error('❌ STATUS: Gagal terhubung ke Database');
    console.error('DETAIL:', err.message);
  });


// SOCKET.IO

io.on('connection', pmsAction.handleSocketConnection);


// ROUTES

app.get('/api/health', pmsAction.health);

app.get('/api/current-schedule', pmsAction.currentSchedule);

app.post('/api/counting/start', pmsAction.startCounting);
app.post('/api/counting/finish', pmsAction.finishCounting);

app.post('/api/scan', pmsAction.scanKanban);

app.post('/api/counting/manual', pmsAction.createManualCounting);
app.put('/api/counting/:countingId', pmsAction.updateManualCounting);
app.delete('/api/counting/:countingId', pmsAction.deleteManualCounting);

app.get('/api/counting/active', pmsAction.getActiveCounting);

app.get('/api/monitoring', pmsAction.getMonitoring);
app.get('/api/scans', pmsAction.getScans);
app.get('/api/heijunka', pmsAction.getHeijunka);

app.get('/api/kanban-problem-alert', pmsAction.getKanbanProblemAlert);
app.post('/api/counting/problem', pmsAction.submitCountingProblem);

app.get('/api/dashboard/summary', dashboardAction.getSummary);
app.get('/api/dashboard/products', dashboardAction.getProducts);
app.get('/api/dashboard/daily', dashboardAction.getDaily);
app.get('/api/dashboard/monthly', dashboardAction.getMonthly);

app.get('/api/heijunka', lineAccuAction.fetchHeijunka);
app.get('/api/scans', lineAccuAction.fetchScans);

app.get('/api/dashboard/accuracy/products', dashboardAction.getAccuracyProducts);
app.get('/api/dashboard/accuracy/daily', dashboardAction.getAccuracyDaily);
app.get('/api/dashboard/accuracy/monthly', dashboardAction.getAccuracyMonthly);

app.get('/api/monitoring', lineSummaryAction.getMonitoring);
app.get('/api/heijunka', lineSummaryAction.getHeijunka);
app.get('/api/pics', lineSummaryAction.getPics);

app.post('/api/counting/manual', countingAction.saveCounting);
app.put('/api/counting/:id', countingAction.updateCounting);

app.get('/api/master-schedule', scheduleAction.fetchMasterSchedule);
app.put('/api/master-schedule', scheduleAction.updateMasterSchedule);
// Rute Proxy ESP32 Hardware
app.post('/api/esp32/control', scheduleAction.controlESP32);

// Route Login
app.post('/api/auth/login', authAction.login);

// verifyAdmin middleware 
app.post('/api/counting/manual', verifyAdmin, pmsAction.createManualCounting);
app.put('/api/counting/:countingId', verifyAdmin, pmsAction.updateManualCounting);
app.delete('/api/counting/:countingId', verifyAdmin, pmsAction.deleteManualCounting);

app.get('/api/dashboard/accuracy/products', accuracyAction.fetchAccuracyProducts);
// RUN SERVER

server.listen(5000, '0.0.0.0', () => {
  console.log('🚀 Server Backend berjalan di http://0.0.0.0:5000');
});