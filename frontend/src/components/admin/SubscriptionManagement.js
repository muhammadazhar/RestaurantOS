import React, { useEffect, useState, useCallback } from 'react';
import { getAdminSubscriptions, approveSubscription, rejectSubscription } from '../../services/api';
import { Card, Btn, Spinner, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  trial: '#f39c12', active: '#2ecc71', pending_payment: '#3498db',
  expired: '#e74c3c', cancelled: '#95a5a6', rejected: '#e74c3c',
};
const STATUS_ICON  = { trial: '🧪', active: '✅', pending_payment: '⏳', expired: '❌', cancelled: '⚫', rejected: '🚫' };
const PLAN_LABELS  = { trial: 'Free Trial', monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half Yearly', yearly: 'Yearly' };
const MODULE_ICONS = { base: '🍽', tables: '🪑', inventory: '📦', staff: '👥', rider: '🛵', gl: '📒', reports: '📊' };

export default function SubscriptionManagement() {
  useT();
  const [subs,       setSubs]       = useState(null);
  const [filter,     setFilter]     = useState('pending_payment');
  const [processing, setProcessing] = useState(null);
  const [modal,      setModal]      = useState(null);  // { sub, action: 'approve'|'reject' }
  const [notes,      setNotes]      = useState('');

  const load = useCallback(async () => {
    try {
      const res = await getAdminSubscriptions({ status: filter || undefined });
      setSubs(res.data);
    } catch { toast.error('Failed to load subscriptions'); }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const handleAction = async () => {
    if (!modal) return;
    setProcessing(modal.sub.id);
    try {
      if (modal.action === 'approve') {
        await approveSubscription(modal.sub.id, { payment_notes: notes });
        toast.success(`Subscription approved for ${modal.sub.restaurant_name}`);
      } else {
        await rejectSubscription(modal.sub.id, { payment_notes: notes });
        toast.success(`Subscription rejected`);
      }
      setModal(null);
      setNotes('');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed');
    } finally {
      setProcessing(null);
    }
  };

  const STATUS_TABS = [
    { key: 'pending_payment', label: '⏳ Pending' },
    { key: 'active',          label: '✅ Active' },
    { key: 'trial',           label: '🧪 Trial' },
    { key: 'expired',         label: '❌ Expired' },
    { key: 'rejected',        label: '🚫 Rejected' },
    { key: '',                label: '📋 All' },
  ];

  return (
    <div>
      <PageHeader title="📋 Subscription Management" subtitle="Review and manage restaurant module subscriptions" />

      {/* Status tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            style={{
              padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: filter === t.key ? 700 : 500,
              background: filter === t.key ? T.accent : T.card,
              color: filter === t.key ? '#000' : T.textMid,
              border: `1px solid ${filter === t.key ? T.accent : T.border}`,
              fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
            }}
          >{t.label}</button>
        ))}
      </div>

      {!subs ? <Spinner /> : subs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
          <div>No subscriptions found</div>
        </div>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                {['Restaurant','Module','Plan','Status','Requested','Expires','Amount','Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {subs.map((s, i) => (
                <tr key={s.id} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{s.restaurant_name}</div>
                    <div style={{ fontSize: 11, color: T.textMid }}>{s.restaurant_email}</div>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 13, color: T.text }}>
                    {MODULE_ICONS[s.module_key]} {s.module_name}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: T.textMid }}>
                    {PLAN_LABELS[s.plan_type] || s.plan_type}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[s.status] }}>
                      {STATUS_ICON[s.status]} {s.status.replace('_',' ').toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: T.textMid }}>
                    {new Date(s.requested_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: T.textMid }}>
                    {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600, color: T.text }}>
                    {s.price > 0 ? `PKR ${Number(s.price).toLocaleString()}` : 'Free'}
                  </td>
                  <td style={{ padding: '8px 14px' }}>
                    {s.status === 'pending_payment' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { setModal({ sub: s, action: 'approve' }); setNotes(''); }}
                          disabled={processing === s.id}
                          style={{
                            padding: '5px 10px', borderRadius: 6, border: 'none',
                            background: '#2ecc71', color: '#fff', fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                          }}
                        >✓ Approve</button>
                        <button
                          onClick={() => { setModal({ sub: s, action: 'reject' }); setNotes(''); }}
                          disabled={processing === s.id}
                          style={{
                            padding: '5px 10px', borderRadius: 6, border: 'none',
                            background: '#e74c3c', color: '#fff', fontSize: 11, fontWeight: 700,
                            cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                          }}
                        >✗ Reject</button>
                      </div>
                    )}
                    {s.payment_notes && (
                      <div style={{ fontSize: 10, color: T.textDim, marginTop: 4, maxWidth: 160 }}>{s.payment_notes}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Action Modal */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ background: T.surface, borderRadius: 16, padding: '28px 32px', width: 400, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 8 }}>
              {modal.action === 'approve' ? '✅ Approve Subscription' : '🚫 Reject Subscription'}
            </div>
            <div style={{ fontSize: 13, color: T.textMid, marginBottom: 16 }}>
              <strong>{modal.sub.restaurant_name}</strong> — {modal.sub.module_name} ({PLAN_LABELS[modal.sub.plan_type]})
              {modal.sub.price > 0 && <span> · PKR {Number(modal.sub.price).toLocaleString()}</span>}
            </div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={modal.action === 'approve' ? 'Payment confirmation note (optional)' : 'Reason for rejection (optional)'}
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${T.border}`, background: T.card,
                color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif",
                resize: 'vertical', outline: 'none', marginBottom: 16, boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={() => setModal(null)} style={{ flex: 1, background: T.card, color: T.text, border: `1px solid ${T.border}` }}>
                Cancel
              </Btn>
              <Btn
                onClick={handleAction}
                disabled={!!processing}
                style={{
                  flex: 2,
                  background: modal.action === 'approve' ? '#2ecc71' : '#e74c3c',
                  color: '#fff',
                }}
              >
                {processing ? '⏳ Processing…' : modal.action === 'approve' ? '✓ Confirm Approval' : '✗ Confirm Rejection'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
