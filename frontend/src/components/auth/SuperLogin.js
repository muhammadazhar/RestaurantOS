import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';

export default function SuperLogin() {
  const { superLogin }    = useAuth();
  const { mode, theme: T, toggle } = useTheme();
  const navigate          = useNavigate();
  const [form, setForm]   = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await superLogin(form.email, form.password);
      toast.success('Welcome, Super Admin!');
      navigate('/admin');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  const inp = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 14px', color: T.text, fontSize: 14, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%', marginTop: 8 };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", transition: 'background 0.3s' }}>
      <button onClick={toggle} style={{ position: 'fixed', top: 20, right: 20, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, color: T.text }}>
        {mode === 'dark' ? '☀️' : '🌙'}
      </button>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 40, textAlign: 'center' }}>🏢</div>
        <h1 style={{ color: T.text, textAlign: 'center', fontSize: 22, fontWeight: 800, marginTop: 8 }}>Super Admin Portal</h1>
        <p style={{ color: T.textMid, textAlign: 'center', fontSize: 13, marginBottom: 28 }}>Platform management access</p>
        <form onSubmit={submit}>
          <div style={{ color: T.textMid, fontSize: 12, fontWeight: 600 }}>Email</div>
          <input name="email" type="email" value={form.email} onChange={handle} placeholder="superadmin@restaurantos.com" style={inp} required />
          <div style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginTop: 14 }}>Password</div>
          <input name="password" type="password" value={form.password} onChange={handle} placeholder="••••••••" style={inp} required />
          <button type="submit" disabled={loading} style={{ marginTop: 20, background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, cursor: 'pointer', width: '100%', fontFamily: "'Inter', sans-serif" }}>
            {loading ? 'Signing in…' : '🏢 Super Admin Login'}
          </button>
        </form>
        <div style={{ marginTop: 16, background: T.surface, borderRadius: 10, padding: '10px 14px' }}>
          <code style={{ color: '#7C3AED', fontSize: 11, display: 'block' }}>superadmin@restaurantos.com</code>
          <code style={{ color: '#7C3AED', fontSize: 11, display: 'block' }}>password123</code>
        </div>
        <p style={{ marginTop: 16, fontSize: 12, color: T.textMid, textAlign: 'center' }}>
          Restaurant staff? <Link to="/login" style={{ color: T.accent }}>Restaurant login</Link>
        </p>
      </div>
    </div>
  );
}
