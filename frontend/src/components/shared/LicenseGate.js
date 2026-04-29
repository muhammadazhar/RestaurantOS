import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { requestSubscription } from '../../services/api';
import toast from 'react-hot-toast';

const PLAN_LABELS = {
  monthly: 'Monthly', quarterly: 'Quarterly',
  half_yearly: 'Half Yearly', yearly: 'Yearly',
};

export default function LicenseGate({ moduleKey = 'base', moduleName = 'RestaurantOS', pricing = [] }) {
  const { theme: T } = useTheme();
  const { logout, refreshModules } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState('monthly');
  const [requesting, setRequesting]     = useState(false);

  const plans = pricing.filter(p => p.module_key === moduleKey && p.plan_type !== 'trial');

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await requestSubscription({ module_key: moduleKey, plan_type: selectedPlan });
      toast.success('Payment request submitted! Your subscription will be activated once payment is confirmed.');
      try {
        await refreshModules();
      } catch {
        // A pending renewal does not activate the module immediately, so a
        // refresh failure should not replace the success message.
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Request failed');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{
        background: T.surface, borderRadius: 20, padding: '40px 48px',
        maxWidth: 480, width: '90%', textAlign: 'center',
        border: `1px solid ${T.border}`,
        boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔒</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 8 }}>
          License Expired
        </div>
        <div style={{ fontSize: 14, color: T.textMid, marginBottom: 28, lineHeight: 1.6 }}>
          Your <strong style={{ color: T.accent }}>{moduleName}</strong> subscription has expired.
          Please renew to continue using the system.
        </div>

        {/* Plan selector */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {plans.map(p => (
            <div
              key={p.plan_type}
              onClick={() => setSelectedPlan(p.plan_type)}
              style={{
                padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${selectedPlan === p.plan_type ? T.accent : T.border}`,
                background: selectedPlan === p.plan_type ? T.accentGlow : T.card,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                {PLAN_LABELS[p.plan_type]}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>
                PKR {Number(p.price).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={handleRequest}
          disabled={requesting}
          style={{
            width: '100%', padding: '13px', borderRadius: 10, border: 'none',
            background: T.accent, color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: requesting ? 'not-allowed' : 'pointer', marginBottom: 12,
            opacity: requesting ? 0.7 : 1,
          }}
        >
          {requesting ? '⏳ Submitting…' : '📩 Request Renewal'}
        </button>

        <button
          onClick={logout}
          style={{
            background: 'none', border: 'none', color: T.textDim,
            fontSize: 12, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
          }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
