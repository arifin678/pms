import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Lock, User, LogIn, AlertCircle, ShieldCheck } from 'lucide-react';
import './login.css'; // Pastikan path ini benar

const Login = () => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      });
      const data = await response.json();

      if (data.success) {
        login(data.token, data.user);
        navigate('/'); // Lempar ke Dashboard setelah berhasil
      } else {
        setError(data.message || 'Gagal login, periksa kembali data Anda.');
      }
    } catch (err) {
      // PERBAIKAN S2486: Mencetak log error ke konsol agar 'err' tidak menganggur
      console.error('Login API Error:', err.message || err);
      setError('Gagal terhubung ke server backend.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        
        <div className="login-header">
          <div className="login-icon-wrap">
            <ShieldCheck size={32} />
          </div>
          <h2>PMS LOGIN</h2>
          <p>Pulling Monitoring System</p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}
        
        <form onSubmit={handleLogin}>
          <div className="login-form-group">
            <User size={20} className="login-input-icon" />
            <input 
              type="text" 
              className="login-input"
              placeholder="User ID" 
              required 
              value={userId} 
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>

          <div className="login-form-group">
            <Lock size={20} className="login-input-icon" />
            <input 
              type="password" 
              className="login-input"
              placeholder="Password" 
              required 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <button type="submit" className="login-btn" disabled={isLoading}>
            {isLoading ? 'Memeriksa...' : 'MASUK'} <LogIn size={18} />
          </button>
        </form>

      </div>
    </div>
  );
};

export default Login;