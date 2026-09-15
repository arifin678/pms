import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cek token saat aplikasi dimuat ulang
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token && storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // Membungkus fungsi dengan useCallback agar tidak dirakit ulang setiap render
  const login = useCallback((token, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  // S6481: Membungkus objek value dengan useMemo agar alamat memorinya dikunci (di-cache)
  const contextValue = useMemo(() => ({
    user,
    login,
    logout,
    loading
  }), [user, loading, login, logout]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};