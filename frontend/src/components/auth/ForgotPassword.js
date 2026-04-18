import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { forgotPassword } from '../../services/api';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const { mode, theme: T, toggle } = useTheme();
  const [form, setForm] = useState({ email: '', restaurantSlug: '' });
  const [loading, setLoading] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState('');

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const inp = {
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 10, padding: '12px 14px', color: T.text,
    fontSize: 14, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%',
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.restaurantSlug.trim()) return toast.error('Restaurant slug required');
    if (!form.email.trim()) return toast.error('Email required');
    setLoading(true);
    try {
      const { data } = await forgotPassword({
        email: form.email.trim(),
        restaurantSlug: form.restaurantSlug.trim(),
      });
      setDevResetUrl(data.resetUrl || '');
      toast.success(data.message || 'Password reset instructions sent');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not request password reset');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", transition: 'background 0.3s' }}>
      <button onClick={toggle} style={{ position: 'fixed', top: 20, right: 20, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: T.text }}>
        {mode === 'dark' ? 'Light' : 'Dark'}
      </button>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8, color: T.text, fontWeight: 900 }}>RestaurantOS</div>
        <h1 style={{ color: T.text, textAlign: 'center', fontSize: 24, fontWeight: 800, margin: 0 }}>Forgot Password</h1>
        <p style={{ color: T.textMid, textAlign: 'center', fontSize: 14, marginTop: 6, marginBottom: 28 }}>
          Enter your restaurant slug and email to receive a reset link.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, letterSpacing: 0.5 }}>Restaurant Slug</label>
          <input name="restaurantSlug" value={form.restaurantSlug} onChange={handle} placeholder="e.g. golden-fork" style={inp} required />
          <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, letterSpacing: 0.5 }}>Email</label>
          <input name="email" type="email" value={form.email} onChange={handle} placeholder="you@restaurant.com" style={inp} required />
          <button type="submit" disabled={loading} style={{ marginTop: 20, background: T.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif" }}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        {devResetUrl && (
          <div style={{ marginTop: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text, marginBottom: 6 }}>Development reset link</div>
            <a href={devResetUrl} style={{ color: T.accent, fontSize: 12, wordBreak: 'break-all' }}>{devResetUrl}</a>
          </div>
        )}

        <p style={{ marginTop: 20, fontSize: 12, color: T.textMid, textAlign: 'center' }}>
          Remembered it? <Link to="/login" style={{ color: T.accent }}>Back to login</Link>
        </p>
      </div>
    </div>
  );
}
