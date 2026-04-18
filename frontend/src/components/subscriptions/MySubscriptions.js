import React, { useEffect, useState, useCallback } from 'react';
import { getMySubscriptions, requestSubscription } from '../../services/api';
import { Card, Btn, Spinner, PageHeader, T, useT } from '../shared/UI';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  trial: '#f39c12', active: '#2ecc71', pending_payment: '#3498db',
  expired: '#e74c3c', cancelled: '#95a5a6', rejected: '#e74c3c',
};
const STATUS_ICON = {
  trial: '🧪', active: '✅', pending_payment: '⏳',
  expired: '❌', cancelled: '⚫', rejected: '🚫',
};
const PLAN_LABELS = {
  trial: 'Free Trial', monthly: 'Monthly', quarterly: 'Quarterly',
  half_yearly: 'Half Yearly', yearly: 'Yearly',
};
const MODULE_ICONS = {
  base: '🍽', tables: '🪑', inventory: '📦', staff: '👥',
  rider: '🛵', gl: '📒', reports: '📊', support: '🎫', maps: '🗺',
};

export default function MySubscriptions() {
  useT();
  const { refreshModules } = useAuth();
  const [data,       setData]       = useState(null);
  const [requesting, setRequesting] = useState({});   // moduleKey → plan_type being requested
  const [modal,      setModal]      = useState(null);  // { module_key, module_name, plans }

  const load = useCallback(async () => {
    try {
      const res = await getMySubscriptions();
      setData(res.data);
    } catch { toast.error('Failed to load subscriptions'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRequest = async (module_key, plan_type) => {
    setRequesting(p => ({ ...p, [module_key]: plan_type }));
    try {
      await requestSubscription({ module_key, plan_type });
      toast.success(plan_type === 'trial'
        ? `Free trial for ${module_key} activated!`
        : `Payment request submitted! Activation pending confirmation.`
      );
      await load();
      await refreshModules();
      setModal(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Request failed');
    } finally {
      setRequesting(p => ({ ...p, [module_key]: null }));
    }
  };

  if (!data) return <Spinner />;

  // Build map: module_key → latest active/trial sub
  const activeSubs = {};
  const pendingSubs = {};
  for (const s of data.subscriptions) {
    if (s.status === 'active' || s.status === 'trial') {
      if (!activeSubs[s.module_key] || new Date(s.expires_at) > new Date(activeSubs[s.module_key].expires_at)) {
        activeSubs[s.module_key] = s;
      }
    }
    if (s.status === 'pending_payment') pendingSubs[s.module_key] = s;
  }

  // Group pricing by module
  const pricingByModule = {};
  for (const p of data.pricing) {
    if (!pricingByModule[p.module_key]) pricingByModule[p.module_key] = [];
    pricingByModule[p.module_key].push(p);
  }

  const modules = ['base', 'tables', 'inventory', 'staff', 'rider', 'gl', 'reports', 'support', 'maps'];
  const moduleNames = {
    base: 'RestaurantOS Base', tables: 'Table Management', inventory: 'Inventory & Recipes',
    staff: 'Staff Management', rider: 'Rider Delivery', gl: 'General Ledger', reports: 'Advanced Reports',
    support: 'Support Tickets', maps: 'Delivery Zone Maps',
  };
  const moduleDesc = {
    base: 'Core POS, orders, kitchen display', tables: 'Tables and reservations',
    inventory: 'Stock management, recipes, menu management', staff: 'Employees, attendance, shifts',
    rider: 'Rider management, delivery tracking, incentives',
    gl: 'Double-entry accounting, GL reports', reports: 'Sales reports, shift reports, analytics',
    support: 'Submit and track support tickets, get help from our team',
    maps: 'Visual zone editor with Leaflet polygon drawing for delivery pricing',
  };

  const daysLeft = (expires_at) => {
    if (!expires_at) return null;
    const diff = Math.ceil((new Date(expires_at) - Date.now()) / 86400000);
    return diff;
  };

  return (
    <div>
      <PageHeader title="🏷️ My Subscriptions" subtitle="Manage your module licenses and request renewals" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {modules.map(key => {
          const sub    = activeSubs[key];
          const pend   = pendingSubs[key];
          const plans  = pricingByModule[key] || [];
          const days   = sub ? daysLeft(sub.expires_at) : null;
          const expiring = days !== null && days <= 7;

          return (
            <Card key={key} style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
                <div style={{ fontSize: 28 }}>{MODULE_ICONS[key]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{moduleNames[key]}</div>
                  <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>{moduleDesc[key]}</div>
                </div>
              </div>

              {/* Active/Trial subscription */}
              {sub && (
                <div style={{
                  background: T.surface, border: `1px solid ${expiring ? '#f39c12' : T.border}`,
                  borderRadius: 10, padding: '10px 14px', marginBottom: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: STATUS_COLOR[sub.status] }}>
                      {STATUS_ICON[sub.status]} {sub.status.toUpperCase().replace('_', ' ')}
                    </span>
                    <span style={{ fontSize: 11, color: T.textMid }}>
                      {PLAN_LABELS[sub.plan_type]}
                    </span>
                  </div>
                  {sub.expires_at && (
                    <div style={{ fontSize: 11, color: expiring ? '#f39c12' : T.textMid, marginTop: 4 }}>
                      {days > 0
                        ? `Expires in ${days} day${days !== 1 ? 's' : ''} · ${new Date(sub.expires_at).toLocaleDateString()}`
                        : `Expired · ${new Date(sub.expires_at).toLocaleDateString()}`
                      }
                    </div>
                  )}
                </div>
              )}

              {/* Pending payment */}
              {pend && (
                <div style={{
                  background: '#3498db11', border: '1px solid #3498db44',
                  borderRadius: 10, padding: '10px 14px', marginBottom: 12,
                  fontSize: 12, color: '#3498db',
                }}>
                  ⏳ Payment request pending — {PLAN_LABELS[pend.plan_type]} (PKR {Number(pend.price).toLocaleString()})
                </div>
              )}

              {/* Actions */}
              {!sub && !pend && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {plans.filter(p => p.plan_type === 'trial').map(p => (
                    <Btn
                      key={p.plan_type}
                      size="sm"
                      onClick={() => handleRequest(key, p.plan_type)}
                      disabled={!!requesting[key]}
                      style={{ background: '#f39c12', color: '#fff' }}
                    >
                      {requesting[key] === p.plan_type ? '⏳' : '🧪 Free Trial'}
                    </Btn>
                  ))}
                  <Btn
                    size="sm"
                    onClick={() => setModal({ module_key: key, module_name: moduleNames[key], plans: plans.filter(p => p.plan_type !== 'trial') })}
                  >
                    💳 Subscribe
                  </Btn>
                </div>
              )}

              {(sub || pend) && (expiring || sub?.status === 'trial') && !pend && (
                <Btn
                  size="sm"
                  onClick={() => setModal({ module_key: key, module_name: moduleNames[key], plans: plans.filter(p => p.plan_type !== 'trial') })}
                  style={{ background: expiring ? '#f39c12' : undefined, color: expiring ? '#000' : undefined }}
                >
                  🔄 {expiring ? 'Renew Now' : 'Upgrade Plan'}
                </Btn>
              )}
            </Card>
          );
        })}
      </div>

      {/* Recent requests */}
      {data.subscriptions.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 12 }}>Request History</div>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  {['Module','Plan','Status','Requested','Expires','Amount'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((s, i) => (
                  <tr key={s.id} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: T.text, fontWeight: 600 }}>
                      {MODULE_ICONS[s.module_key]} {moduleNames[s.module_key] || s.module_key}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: T.textMid }}>{PLAN_LABELS[s.plan_type] || s.plan_type}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[s.status] }}>
                        {STATUS_ICON[s.status]} {s.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: T.textMid }}>
                      {new Date(s.requested_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: T.textMid }}>
                      {s.expires_at ? new Date(s.expires_at).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: T.text, fontWeight: 600 }}>
                      {s.price > 0 ? `PKR ${Number(s.price).toLocaleString()}` : 'Free'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {/* Plan selection modal */}
      {modal && (
        <PlanModal
          module_key={modal.module_key}
          module_name={modal.module_name}
          plans={modal.plans}
          requesting={requesting[modal.module_key]}
          onRequest={(plan_type) => handleRequest(modal.module_key, plan_type)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function PlanModal({ module_key, module_name, plans, requesting, onRequest, onClose }) {
  useT();
  const [selected, setSelected] = useState(plans[0]?.plan_type || 'monthly');

  const selectedPlan = plans.find(p => p.plan_type === selected);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: T.surface, borderRadius: 16, padding: '28px 32px', width: 420,
        border: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 4 }}>
          {MODULE_ICONS[module_key]} Subscribe to {module_name}
        </div>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 20 }}>
          Select a plan. Your subscription will activate after payment confirmation.
        </div>

        {plans.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: T.textMid, fontSize: 13 }}>
            Pricing not yet configured for this module.<br />
            Please contact your administrator or restart the backend server.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {plans.map(p => (
            <div
              key={p.plan_type}
              onClick={() => setSelected(p.plan_type)}
              style={{
                padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                border: `2px solid ${selected === p.plan_type ? T.accent : T.border}`,
                background: selected === p.plan_type ? T.accentGlow : T.card,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                  {PLAN_LABELS[p.plan_type]}
                </div>
                <div style={{ fontSize: 11, color: T.textMid }}>{p.duration_days} days</div>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.accent }}>
                PKR {Number(p.price).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {selectedPlan && (
          <div style={{ background: T.accentGlow, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: T.textMid, marginBottom: 16 }}>
            After submitting, our team will contact you for payment. Subscription activates upon confirmation.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <Btn onClick={onClose} style={{ flex: 1, background: T.card, color: T.text, border: `1px solid ${T.border}` }}>
            Cancel
          </Btn>
          <Btn onClick={() => onRequest(selected)} disabled={!!requesting} style={{ flex: 2 }}>
            {requesting ? '⏳ Requesting…' : '📩 Request Subscription'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
