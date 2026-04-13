import React, { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, superLogin as apiSuperLogin, logout as apiLogout } from '../services/api';
import toast from 'react-hot-toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  const login = async (email, password, restaurantSlug) => {
    const { data } = await apiLogin({ email, password, restaurantSlug });
    localStorage.setItem('accessToken',  data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user',         JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const superLogin = async (email, password) => {
    const { data } = await apiSuperLogin({ email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('user',        JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try { await apiLogout({ refreshToken }); } catch {}
    localStorage.clear();
    setUser(null);
    toast.success('Logged out');
  };

  const loginFromToken = (accessToken, refreshToken, userData) => {
    localStorage.setItem('accessToken',  accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user',         JSON.stringify(userData));
    setUser(userData);
  };

  const hasPermission = (permission) => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return (user.permissions || []).includes(permission);
  };

  const hasModule = (moduleKey) => {
    if (!user) return false;
    if (user.isSuperAdmin) return true;
    return (user.modules || []).includes(moduleKey);
  };

  // Refresh active modules from server (call after subscription change)
  const refreshModules = async () => {
    if (!user || user.isSuperAdmin) return;
    try {
      const { default: API } = await import('../services/api');
      const { data } = await API.get('/subscriptions/modules');
      const updated = { ...user, modules: data.modules };
      localStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, superLogin, logout, loginFromToken, hasPermission, hasModule, refreshModules }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
