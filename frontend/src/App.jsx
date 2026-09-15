import React, { useContext } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ProductDetail from './pages/ProductDetail';
import DownloadHistory from './pages/DownloadHistory';
import NotFound from './pages/NotFound';
import Status from './pages/Status'; 
import MasterSchedule from './pages/Schedule'; 
import LiveMonitoring from './pages/LiveMonitoring'; 
import LineSummary from './pages/LineSummary'; 
import LineAccu from './pages/LineAccu';
import Login from './context/login'; // PASTIKAN FILE INI SUDAH DI-IMPORT
import { AuthProvider, AuthContext } from './context/AuthContext';
import './App.css';


const ProtectedRoute = ({ children }) => {
  const { user, loading } = useContext(AuthContext);

  // Saat sedang mengecek token di local storage
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontWeight: 'bold' }}>
        Memeriksa Autentikasi...
      </div>
    );
  }

  // Jika tidak ada user (belum login), paksa lempar ke halaman /login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Jika sudah login, tampilkan Sidebar dan Halaman yang dituju
  return (
    <>
      <Sidebar />
      <main className="app-main-content">
        {children}
      </main>
    </>
  );
};


// MANAJEMEN ROUTING

function AppRoutes() {
  return (
    <Router>
      <Routes>
        {/* ROUTE PUBLIK (Tidak butuh login, Sidebar disembunyikan otomatis) */}
        <Route path="/login" element={<Login />} />

        {/* ROUTE PRIVATE (Wajib Login) */}
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/product/:productName" element={<ProtectedRoute><ProductDetail /></ProtectedRoute>} />
        <Route path="/download-history" element={<ProtectedRoute><DownloadHistory /></ProtectedRoute>} />
        <Route path="/status" element={<ProtectedRoute><Status /></ProtectedRoute>} />
        <Route path="/master-schedule" element={<ProtectedRoute><MasterSchedule /></ProtectedRoute>} />
        <Route path="/live-monitoring" element={<ProtectedRoute><LiveMonitoring /></ProtectedRoute>} />
        <Route path="/line-summary/:productName" element={<ProtectedRoute><LineSummary /></ProtectedRoute>} />
        <Route path="/line-accu/:productName" element={<ProtectedRoute><LineAccu /></ProtectedRoute>} />

        {/* 404 NOT FOUND */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  );
}


// ROOT COMPONENT
function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;