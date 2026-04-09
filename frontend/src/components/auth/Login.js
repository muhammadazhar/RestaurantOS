import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';

export default function Login() {
  const { login }         = useAuth();
  const { mode, theme: T, toggle } = useTheme();
  const navigate          = useNavigate();
  const [form, setForm]   = useState({ email: '', password: '', restaurantSlug: '' });
  const [loading, setLoading] = useState(false);

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (!form.restaurantSlug) return toast.error('Restaurant slug required');
    setLoading(true);
    try {
      const user = await login(form.email, form.password, form.restaurantSlug);
      toast.success(`Welcome, ${user.name}!`);
      // Redirect to first permitted page
      const perms = user.permissions || [];
      const PERM_ROUTES = [
        ['dashboard', '/dashboard'],
        ['pos',       '/pos'],
        ['kitchen',   '/kitchen'],
        ['tables',    '/tables'],
        ['inventory', '/inventory'],
        ['recipes',   '/recipes'],
        ['employees', '/employees'],
        ['attendance','/attendance'],
        ['gl',        '/ledger'],
      ];
      const landing = PERM_ROUTES.find(([p]) => perms.includes(p));
      navigate(landing ? landing[1] : '/alerts');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  const inp = {
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 10, padding: '12px 14px', color: T.text,
    fontSize: 14, fontFamily: "'Syne', sans-serif", outline: 'none', width: '100%',
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Syne', sans-serif", transition: 'background 0.3s' }}>
      {/* Theme toggle */}
      <button onClick={toggle} style={{ position: 'fixed', top: 20, right: 20, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, color: T.text }}>
        {mode === 'dark' ? '☀️' : '🌙'}
      </button>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>🍽</div>
        <h1 style={{ color: T.text, textAlign: 'center', fontSize: 24, fontWeight: 800, margin: 0 }}>RestaurantOS</h1>
        <p style={{ color: T.textMid, textAlign: 'center', fontSize: 14, marginTop: 6, marginBottom: 28 }}>Sign in to your restaurant</p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, letterSpacing: 0.5 }}>Restaurant Slug</label>
          <input name="restaurantSlug" value={form.restaurantSlug} onChange={handle} placeholder="e.g. golden-fork" style={inp} required />
          <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, letterSpacing: 0.5 }}>Email</label>
          <input name="email" type="email" value={form.email} onChange={handle} placeholder="you@restaurant.com" style={inp} required />
          <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, letterSpacing: 0.5 }}>Password</label>
          <input name="password" type="password" value={form.password} onChange={handle} placeholder="••••••••" style={inp} required />
          <button type="submit" disabled={loading} style={{ marginTop: 20, background: T.accent, color: '#000', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Syne', sans-serif" }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: 24, background: T.surface, borderRadius: 10, padding: '12px 14px' }}>
          <p style={{ marginBottom: 6, fontSize: 12, color: T.textMid }}>Demo credentials:</p>
          <code style={{ color: T.accent, fontSize: 11, display: 'block' }}>Slug: golden-fork</code>
          <code style={{ color: T.accent, fontSize: 11, display: 'block' }}>Email: ahmed@goldenfork.com</code>
          <code style={{ color: T.accent, fontSize: 11, display: 'block' }}>Pass: password123</code>
        </div>
        <p style={{ marginTop: 20, fontSize: 12, color: T.textMid, textAlign: 'center' }}>
          Super Admin? <Link to="/super-login" style={{ color: T.accent }}>Login here</Link>
        </p>
        <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: T.textMid, marginBottom: 8 }}>Don't have an account yet?</p>
          <Link to="/register" style={{
            display: 'inline-block', background: T.surface, border: `1px solid ${T.border}`,
            color: T.text, borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 700,
            textDecoration: 'none', transition: 'all 0.2s',
          }}>🏪 Register Your Restaurant →</Link>
        </div>
      </div>
    </div>
  );
}
