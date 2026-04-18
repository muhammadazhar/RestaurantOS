import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { resetPassword } from '../../services/api';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const { mode, theme: T, toggle } = useTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get('token') || '', [params]);
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [loading, setLoading] = useState(false);

  const inp = {
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 10, padding: '12px 14px', color: T.text,
    fontSize: 14, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%',
  };

  const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  const submit = async e => {
    e.preventDefault();
    if (!token) return toast.error('Reset token is missing');
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters');
    if (form.password !== form.confirmPassword) return toast.error('Passwords do not match');

    setLoading(true);
    try {
      const { data } = await resetPassword({ token, password: form.password });
      toast.success(data.message || 'Password reset successful');
      navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not reset password');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", transition: 'background 0.3s' }}>
      <button onClick={toggle} style={{ position: 'fixed', top: 20, right: 20, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 13, color: T.text }}>
        {mode === 'dark' ? 'Light' : 'Dark'}
      </button>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 8, color: T.text, fontWeight: 900 }}>RestaurantOS</div>
        <h1 style={{ color: T.text, textAlign: 'center', fontSize: 24, fontWeight: 800, margin: 0 }}>Set New Password</h1>
        <p style={{ color: T.textMid, textAlign: 'center', fontSize: 14, marginTop: 6, marginBottom: 28 }}>
          Choose a new password for your account.
        </p>

        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, letterSpacing: 0.5 }}>New Password</label>
          <input name="password" type="password" value={form.password} onChange={handle} placeholder="********" style={inp} required />
          <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, letterSpacing: 0.5 }}>Confirm Password</label>
          <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handle} placeholder="********" style={inp} required />
          <button type="submit" disabled={loading || !token} style={{ marginTop: 20, background: T.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, cursor: loading || !token ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif" }}>
            {loading ? 'Saving...' : 'Reset Password'}
          </button>
        </form>

        {!token && (
          <p style={{ marginTop: 14, fontSize: 12, color: '#E74C3C', textAlign: 'center' }}>
            This reset link is missing its token.
          </p>
        )}

        <p style={{ marginTop: 20, fontSize: 12, color: T.textMid, textAlign: 'center' }}>
          Remembered it? <Link to="/login" style={{ color: T.accent }}>Back to login</Link>
        </p>
      </div>
    </div>
  );
}
