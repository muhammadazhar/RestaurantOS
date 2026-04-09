import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import toast from 'react-hot-toast';
import {
  getDeliveryOrders, simulateDeliveryOrder, acceptDeliveryOrder,
  rejectDeliveryOrder, getDeliveryPlatforms, updateDeliveryPlatform,
  getDeliveryStats,
} from '../../services/api';

// ── Platform metadata ─────────────────────────────────────────────────────────
const PLATFORMS = {
  foodpanda:   { label: 'Foodpanda',   color: '#E3006D', logo: '🐼' },
  uber_eats:   { label: 'Uber Eats',   color: '#06C167', logo: '🟢' },
  careem_food: { label: 'Careem Food', color: '#00CA9D', logo: '🚗' },
  talabat:     { label: 'Talabat',     color: '#FF6E00', logo: '🟠' },
};

const STATUS_META = {
  pending:   { label: 'New Order',  color: '#E3006D', pulse: true  },
  confirmed: { label: 'Confirmed', color: '#3498DB', pulse: false },
  preparing: { label: 'Preparing', color: '#F39C12', pulse: false },
  ready:     { label: 'Ready',     color: '#27AE60', pulse: false },
  served:    { label: 'Delivered', color: '#95A5A6', pulse: false },
  cancelled: { label: 'Cancelled', color: '#E74C3C', pulse: false },
};

const REJECT_REASONS = [
  'Restaurant busy', 'Item unavailable', 'Kitchen closing soon',
  'Delivery area too far', 'Technical issue', 'Other',
];

const fmt    = (n) => `PKR ${Number(n || 0).toLocaleString()}`;
const fmtMin = (ts) => {
  if (!ts) return null;
  const diff = Math.round((new Date(ts) - Date.now()) / 60000);
  if (diff <= 0) return 'Overdue';
  return `${diff} min`;
};
const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const elapsed = (ts) => {
  const mins = Math.round((Date.now() - new Date(ts)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
};

// Countdown hook
function useCountdown(expiresAt, onExpire) {
  const [secs, setSecs] = useState(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const s = Math.round((new Date(expiresAt) - Date.now()) / 1000);
      setSecs(s);
      if (s <= 0 && onExpire) onExpire();
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [expiresAt, onExpire]);
  return secs;
}

export default function Delivery() {
  const { theme: T } = useTheme();
  const { socket }   = useSocket();

  const [tab, setTab]           = useState('orders');
  const [orders, setOrders]     = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [stats, setStats]       = useState([]);
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus,   setFilterStatus]   = useState('pending,confirmed,preparing,ready');
  const [selectedOrder,  setSelectedOrder]  = useState(null);
  const [rejectModal,    setRejectModal]    = useState(null); // orderId
  const [rejectReason,   setRejectReason]   = useState('Restaurant busy');
  const [platformModal,  setPlatformModal]  = useState(null);
  const [simLoading,     setSimLoading]     = useState(false);
  const audioRef = useRef(null);

  // ── Loaders ───────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    try {
      const p = {};
      if (filterPlatform) p.platform = filterPlatform;
      if (filterStatus)   p.status   = filterStatus;
      const r = await getDeliveryOrders(p);
      setOrders(r.data || []);
    } catch {}
  }, [filterPlatform, filterStatus]);

  const loadPlatforms = useCallback(async () => {
    try { const r = await getDeliveryPlatforms(); setPlatforms(r.data || []); } catch {}
  }, []);

  const loadStats = useCallback(async () => {
    try { const r = await getDeliveryStats(); setStats(r.data || []); } catch {}
  }, []);

  useEffect(() => { loadOrders(); loadPlatforms(); loadStats(); }, []);
  useEffect(() => { loadOrders(); }, [filterPlatform, filterStatus]);

  // ── Socket: live incoming orders ──────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      toast.custom((t) => (
        <div style={{ background: '#E3006D', color: '#fff', borderRadius: 12, padding: '12px 18px', fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, display: 'flex', gap: 10, alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <span style={{ fontSize: 22 }}>🐼</span>
          <div>
            <div>New Foodpanda Order!</div>
            <div style={{ fontWeight: 400, fontSize: 12 }}>{data.customerName} · {data.orderNumber}</div>
          </div>
        </div>
      ), { duration: 6000 });
      loadOrders();
    };
    socket.on('new_delivery_order', handler);
    return () => socket.off('new_delivery_order', handler);
  }, [socket, loadOrders]);

  useEffect(() => {
    if (!socket) return;
    socket.on('order_updated', loadOrders);
    return () => socket.off('order_updated', loadOrders);
  }, [socket, loadOrders]);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleAccept = async (orderId) => {
    try {
      await acceptDeliveryOrder(orderId, { prep_time_min: 30 });
      toast.success('Order accepted! Kitchen notified.');
      loadOrders(); loadStats();
      if (selectedOrder?.id === orderId) setSelectedOrder(null);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    try {
      await rejectDeliveryOrder(rejectModal, { reason: rejectReason });
      toast.success('Order rejected.');
      setRejectModal(null);
      loadOrders(); loadStats();
      if (selectedOrder?.id === rejectModal) setSelectedOrder(null);
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleSimulate = async (platform = 'foodpanda') => {
    setSimLoading(true);
    try {
      await simulateDeliveryOrder({ platform });
      toast.success(`Simulated ${PLATFORMS[platform]?.label} order!`);
      loadOrders(); loadStats();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setSimLoading(false); }
  };

  const handlePlatformToggle = async (platform, is_active) => {
    try {
      await updateDeliveryPlatform(platform, { is_active });
      toast.success(`${PLATFORMS[platform]?.label} ${is_active ? 'enabled' : 'disabled'}`);
      loadPlatforms();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handlePlatformSave = async (platform, data) => {
    try {
      await updateDeliveryPlatform(platform, data);
      toast.success('Settings saved');
      setPlatformModal(null); loadPlatforms();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const card = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 18 };
  const inp  = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', color: T.text, fontSize: 13, fontFamily: "'Syne',sans-serif", outline: 'none' };
  const btn  = (bg = T.accent, col = '#000') => ({ background: bg, color: col, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne',sans-serif" });

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const activeOrders  = orders.filter(o => ['confirmed','preparing','ready'].includes(o.status));

  // ── TAB: Orders ───────────────────────────────────────────────────────────
  const renderOrders = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Incoming — pending orders requiring action */}
      {pendingOrders.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E3006D', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
            <span style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>Incoming Orders ({pendingOrders.length})</span>
            <span style={{ fontSize: 12, color: T.textMid }}>— requires action</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingOrders.map(o => (
              <PendingOrderCard key={o.id} order={o} T={T} btn={btn} card={card}
                onAccept={() => handleAccept(o.id)}
                onReject={() => { setRejectModal(o.id); setRejectReason('Restaurant busy'); }}
                onView={() => setSelectedOrder(o)} />
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <select style={inp} value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
          <option value="">All Platforms</option>
          {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.logo} {v.label}</option>)}
        </select>
        <select style={inp} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="pending,confirmed,preparing,ready">Active</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="preparing">Preparing</option>
          <option value="ready">Ready</option>
          <option value="served">Delivered</option>
          <option value="cancelled">Cancelled</option>
          <option value="">All</option>
        </select>
        <button style={btn(T.surface, T.text)} onClick={loadOrders}>↺ Refresh</button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {Object.entries(PLATFORMS).filter(([k]) => platforms.find(p => p.platform === k)?.is_active).map(([k, v]) => (
            <button key={k} style={{ ...btn(v.color, '#fff'), fontSize: 12 }}
              disabled={simLoading} onClick={() => handleSimulate(k)}>
              {v.logo} Simulate {v.label}
            </button>
          ))}
          {!platforms.some(p => p.is_active) && (
            <button style={{ ...btn('#E3006D', '#fff'), fontSize: 12 }}
              disabled={simLoading} onClick={() => handleSimulate('foodpanda')}>
              🐼 Simulate Foodpanda Order
            </button>
          )}
        </div>
      </div>

      {/* Active orders pipeline */}
      {activeOrders.length > 0 && (
        <div>
          <div style={{ fontWeight: 800, color: T.text, fontSize: 15, marginBottom: 12 }}>Active Orders ({activeOrders.length})</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {activeOrders.map(o => (
              <ActiveOrderCard key={o.id} order={o} T={T} card={card} btn={btn}
                onView={() => setSelectedOrder(o)}
                onStatusChange={async (status) => {
                  try {
                    const { updateOrderStatus } = await import('../../services/api');
                    await updateOrderStatus(o.id, status);
                    toast.success(`Order marked as ${status}`);
                    loadOrders();
                  } catch (e) { toast.error('Failed'); }
                }} />
            ))}
          </div>
        </div>
      )}

      {/* All orders table */}
      <div style={card}>
        <div style={{ fontWeight: 800, color: T.text, marginBottom: 14 }}>Order History</div>
        {orders.length === 0 ? (
          <div style={{ color: T.textMid, fontSize: 13 }}>No orders yet. Click "Simulate" to inject a demo order.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: T.textMid }}>
                  {['Order', 'Platform', 'Customer', 'Items', 'Total', 'Status', 'Time', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const pm = PLATFORMS[o.platform] || {};
                  const sm = STATUS_META[o.status] || {};
                  return (
                    <tr key={o.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: '8px 10px', color: T.text, fontWeight: 700 }}>{o.order_number}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: pm.color + '22', color: pm.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {pm.logo} {pm.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: T.text }}>{o.customer_name}</td>
                      <td style={{ padding: '8px 10px', color: T.textMid }}>{(o.items || []).filter(i => i?.name).length} items</td>
                      <td style={{ padding: '8px 10px', color: T.text, fontWeight: 600 }}>{fmt(o.total_amount)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: sm.color + '22', color: sm.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{sm.label}</span>
                      </td>
                      <td style={{ padding: '8px 10px', color: T.textMid }}>{elapsed(o.created_at)}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <button style={{ ...btn(T.surface, T.text), padding: '4px 10px', fontSize: 12 }} onClick={() => setSelectedOrder(o)}>View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── TAB: Platforms ────────────────────────────────────────────────────────
  const renderPlatforms = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ color: T.textMid, fontSize: 13 }}>
        Connect your restaurant to delivery platforms. Toggle platforms on to start receiving orders.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {platforms.map(p => {
          const meta = PLATFORMS[p.platform] || {};
          const stat = stats.find(s => s.platform === p.platform);
          return (
            <div key={p.id} style={{ ...card, borderLeft: `4px solid ${p.is_active ? meta.color : T.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 32 }}>{meta.logo}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>{meta.label}</div>
                  <div style={{ fontSize: 12, color: T.textMid }}>{p.commission_pct}% commission</div>
                </div>
                {/* Toggle */}
                <div style={{ cursor: 'pointer', position: 'relative', width: 44, height: 24 }}
                  onClick={() => handlePlatformToggle(p.platform, !p.is_active)}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: 12, background: p.is_active ? meta.color : T.border, transition: 'background 0.2s' }} />
                  <div style={{ position: 'absolute', top: 3, left: p.is_active ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                </div>
              </div>

              {/* Stats */}
              {stat && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {[
                    { label: 'Orders (30d)', value: stat.total_orders || 0 },
                    { label: 'Revenue', value: `${Math.round((stat.gross_revenue || 0) / 1000)}k` },
                    { label: 'Avg Prep', value: stat.avg_prep_min ? `${stat.avg_prep_min}m` : '—' },
                  ].map(s => (
                    <div key={s.label} style={{ textAlign: 'center', background: T.surface, borderRadius: 8, padding: '8px 6px' }}>
                      <div style={{ fontWeight: 800, color: T.text, fontSize: 16 }}>{s.value}</div>
                      <div style={{ fontSize: 10, color: T.textMid }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...btn(T.surface, T.text), flex: 1, fontSize: 12 }} onClick={() => setPlatformModal(p)}>⚙ Settings</button>
                {p.is_active && (
                  <button style={{ ...btn(meta.color, '#fff'), fontSize: 12 }} disabled={simLoading}
                    onClick={() => handleSimulate(p.platform)}>
                    Test Order
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Webhook info */}
      <div style={{ ...card, background: T.surface }}>
        <div style={{ fontWeight: 700, color: T.text, marginBottom: 8 }}>Webhook Integration</div>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 8 }}>
          Configure this URL in your platform dashboard to receive live orders:
        </div>
        <code style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '8px 12px', display: 'block', fontSize: 12, color: T.accent }}>
          {window.location.protocol}//{window.location.hostname}:5000/api/delivery/webhook/foodpanda
        </code>
      </div>
    </div>
  );

  // ── TAB: Stats ────────────────────────────────────────────────────────────
  const renderStats = () => {
    const totalRevenue    = stats.reduce((s, r) => s + Number(r.gross_revenue || 0), 0);
    const totalCommission = stats.reduce((s, r) => s + Number(r.total_commission || 0), 0);
    const totalOrders     = stats.reduce((s, r) => s + Number(r.total_orders || 0), 0);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Top stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
          {[
            { label: 'Total Orders (30d)', value: totalOrders, color: T.accent },
            { label: 'Gross Revenue',  value: fmt(totalRevenue),    color: '#27AE60' },
            { label: 'Commission Paid', value: fmt(totalCommission), color: '#E74C3C' },
            { label: 'Net Revenue',    value: fmt(totalRevenue - totalCommission), color: T.text },
          ].map(s => (
            <div key={s.label} style={{ ...card, textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 11, color: T.textMid, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Per-platform breakdown */}
        {stats.length === 0 ? (
          <div style={{ ...card, color: T.textMid, fontSize: 13 }}>No delivery orders yet. Simulate some orders to see stats.</div>
        ) : (
          <div style={card}>
            <div style={{ fontWeight: 800, color: T.text, marginBottom: 14 }}>Platform Breakdown (Last 30 Days)</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: T.textMid }}>
                  {['Platform', 'Orders', 'Active', 'Delivered', 'Cancelled', 'Revenue', 'Commission', 'Net', 'Avg Prep'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map(s => {
                  const meta = PLATFORMS[s.platform] || {};
                  const net  = Number(s.gross_revenue || 0) - Number(s.total_commission || 0);
                  return (
                    <tr key={s.platform} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: meta.color + '22', color: meta.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {meta.logo} {meta.label}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: T.text, fontWeight: 700 }}>{s.total_orders || 0}</td>
                      <td style={{ padding: '8px 10px', color: '#3498DB' }}>{s.active || 0}</td>
                      <td style={{ padding: '8px 10px', color: '#27AE60' }}>{s.delivered || 0}</td>
                      <td style={{ padding: '8px 10px', color: '#E74C3C' }}>{s.cancelled || 0}</td>
                      <td style={{ padding: '8px 10px', color: T.text }}>{fmt(s.gross_revenue)}</td>
                      <td style={{ padding: '8px 10px', color: '#E74C3C' }}>{fmt(s.total_commission)}</td>
                      <td style={{ padding: '8px 10px', color: '#27AE60', fontWeight: 700 }}>{fmt(net)}</td>
                      <td style={{ padding: '8px 10px', color: T.textMid }}>{s.avg_prep_min ? `${s.avg_prep_min}m` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, fontFamily: "'Syne',sans-serif", color: T.text, maxWidth: 1300 }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.text }}>🛵 Online Delivery</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textMid }}>Manage Foodpanda, Uber Eats & more</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {pendingOrders.length > 0 && (
            <span style={{ background: '#E3006D', color: '#fff', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 800, animation: 'pulse 1.5s infinite' }}>
              {pendingOrders.length} Pending
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${T.border}` }}>
        {[['orders', '📋 Orders'], ['platforms', '🔗 Platforms'], ['stats', '📊 Analytics']].map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '10px 18px',
            fontSize: 13, fontWeight: 700, fontFamily: "'Syne',sans-serif",
            color: tab === t ? T.accent : T.textMid,
            borderBottom: tab === t ? `2px solid ${T.accent}` : '2px solid transparent',
            marginBottom: -1,
          }}>{l}</button>
        ))}
      </div>

      {tab === 'orders'    && renderOrders()}
      {tab === 'platforms' && renderPlatforms()}
      {tab === 'stats'     && renderStats()}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <OrderModal order={selectedOrder} T={T} btn={btn} inp={inp}
          onClose={() => setSelectedOrder(null)}
          onAccept={() => handleAccept(selectedOrder.id)}
          onReject={() => { setRejectModal(selectedOrder.id); setRejectReason('Restaurant busy'); setSelectedOrder(null); }} />
      )}

      {/* Reject Modal */}
      {rejectModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 28, width: 380 }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 800, color: T.text }}>Reject Order</h2>
            <div style={{ fontSize: 12, color: T.textMid, marginBottom: 8, fontWeight: 600 }}>Reason</div>
            <select style={{ ...inp, width: '100%', marginBottom: 16 }} value={rejectReason} onChange={e => setRejectReason(e.target.value)}>
              {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button style={btn(T.surface, T.text)} onClick={() => setRejectModal(null)}>Cancel</button>
              <button style={btn('#E74C3C', '#fff')} onClick={handleReject}>Reject Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Platform Settings Modal */}
      {platformModal && (
        <PlatformSettingsModal platform={platformModal} T={T} btn={btn} inp={inp}
          onClose={() => setPlatformModal(null)} onSave={handlePlatformSave} />
      )}
    </div>
  );
}

// ── Pending Order Card (with 5-min countdown) ─────────────────────────────────
function PendingOrderCard({ order, T, btn, card, onAccept, onReject, onView }) {
  const expiresAt = new Date(new Date(order.created_at).getTime() + 5 * 60 * 1000);
  const secs = useCountdown(expiresAt, null);
  const urgent = secs !== null && secs < 60;
  const pm = PLATFORMS[order.platform] || {};
  const items = (order.items || []).filter(i => i?.name);

  return (
    <div style={{ background: T.card, border: `2px solid ${urgent ? '#E74C3C' : '#E3006D'}`, borderRadius: 14, padding: 18, display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', animation: urgent ? 'pulse 1s infinite' : 'none' }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ background: pm.color + '22', color: pm.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{pm.logo} {pm.label}</span>
          <span style={{ color: T.textMid, fontSize: 12 }}>{order.order_number}</span>
          {secs !== null && secs > 0 && (
            <span style={{ marginLeft: 'auto', color: urgent ? '#E74C3C' : '#F39C12', fontWeight: 800, fontSize: 13 }}>
              ⏱ {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
            </span>
          )}
        </div>
        <div style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>{order.customer_name}</div>
        {order.delivery_address && (
          <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>
            📍 {order.delivery_address.street}, {order.delivery_address.area}
          </div>
        )}
        <div style={{ fontSize: 12, color: T.textMid, marginTop: 4 }}>
          {items.map(i => `${i.quantity}× ${i.name}`).join(' · ')}
        </div>
        <div style={{ fontWeight: 800, color: T.text, marginTop: 6 }}>{fmt(order.total_amount)}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button style={btn('#27AE60', '#fff')} onClick={onAccept}>✓ Accept</button>
        <button style={btn('#E74C3C', '#fff')} onClick={onReject}>✕ Reject</button>
        <button style={btn(T.surface, T.text)} onClick={onView}>Details</button>
      </div>
    </div>
  );
}

// ── Active Order Card ─────────────────────────────────────────────────────────
function ActiveOrderCard({ order, T, card, btn, onView, onStatusChange }) {
  const pm = PLATFORMS[order.platform] || {};
  const sm = STATUS_META[order.status] || {};
  const items = (order.items || []).filter(i => i?.name);
  const NEXT = { confirmed: 'preparing', preparing: 'ready', ready: 'served' };
  const NEXT_LABEL = { confirmed: '▶ Start Cooking', preparing: '✓ Mark Ready', ready: '🛵 Delivered' };

  return (
    <div style={{ ...card, borderLeft: `4px solid ${sm.color}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ background: pm.color + '22', color: pm.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{pm.logo} {pm.label}</span>
        <span style={{ background: sm.color + '22', color: sm.color, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>{sm.label}</span>
      </div>
      <div style={{ fontWeight: 800, color: T.text }}>{order.order_number}</div>
      <div style={{ color: T.textMid, fontSize: 13 }}>{order.customer_name}</div>
      {order.delivery_address && (
        <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>📍 {order.delivery_address.area}</div>
      )}
      <div style={{ fontSize: 12, color: T.textMid, margin: '6px 0' }}>{items.map(i => `${i.quantity}× ${i.name}`).join(', ')}</div>
      {order.estimated_delivery_at && (
        <div style={{ fontSize: 12, color: '#3498DB', marginBottom: 8 }}>ETA: {fmtTime(order.estimated_delivery_at)} · {fmtMin(order.estimated_delivery_at)}</div>
      )}
      <div style={{ fontWeight: 800, color: T.text, marginBottom: 10 }}>{fmt(order.total_amount)}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {NEXT[order.status] && (
          <button style={{ ...btn('#27AE60', '#fff'), flex: 1, fontSize: 12 }} onClick={() => onStatusChange(NEXT[order.status])}>
            {NEXT_LABEL[order.status]}
          </button>
        )}
        <button style={{ ...btn(T.surface, T.text), fontSize: 12 }} onClick={onView}>Details</button>
      </div>
    </div>
  );
}

// ── Order Detail Modal ────────────────────────────────────────────────────────
function OrderModal({ order, T, btn, inp, onClose, onAccept, onReject }) {
  const pm = PLATFORMS[order.platform] || {};
  const sm = STATUS_META[order.status] || {};
  const items = (order.items || []).filter(i => i?.name);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text }}>{order.order_number}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.textMid }}>×</button>
        </div>

        {/* Platform & status */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <span style={{ background: pm.color + '22', color: pm.color, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{pm.logo} {pm.label}</span>
          <span style={{ background: sm.color + '22', color: sm.color, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>{sm.label}</span>
        </div>

        {/* Customer */}
        <div style={{ background: T.surface, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: T.text, marginBottom: 6 }}>Customer</div>
          <div style={{ color: T.text, fontSize: 14, marginBottom: 2 }}>{order.customer_name}</div>
          <div style={{ color: T.textMid, fontSize: 13 }}>{order.customer_phone}</div>
          {order.delivery_address && (
            <div style={{ color: T.textMid, fontSize: 13, marginTop: 4 }}>
              📍 {order.delivery_address.street}, {order.delivery_address.area}, {order.delivery_address.city}
              {order.delivery_address.instructions && (
                <div style={{ marginTop: 4, fontStyle: 'italic' }}>"{order.delivery_address.instructions}"</div>
              )}
            </div>
          )}
        </div>

        {/* Items */}
        <div style={{ background: T.surface, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, color: T.text, marginBottom: 8 }}>Order Items</div>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: i < items.length - 1 ? `1px solid ${T.border}` : 'none' }}>
              <span style={{ color: T.text, fontSize: 13 }}>{item.quantity}× {item.name}</span>
              <span style={{ color: T.textMid, fontSize: 13 }}>{fmt(item.total_price)}</span>
            </div>
          ))}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: T.textMid, fontSize: 13 }}>
              <span>Subtotal</span><span>{fmt(order.subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: T.textMid, fontSize: 13 }}>
              <span>Tax</span><span>{fmt(order.tax_amount)}</span>
            </div>
            {order.platform_commission > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#E74C3C', fontSize: 13 }}>
                <span>Platform Commission</span><span>- {fmt(order.platform_commission)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', color: T.text, fontWeight: 800, fontSize: 15, marginTop: 6 }}>
              <span>Total</span><span>{fmt(order.total_amount)}</span>
            </div>
          </div>
        </div>

        {/* ETA */}
        {order.estimated_delivery_at && (
          <div style={{ color: T.textMid, fontSize: 12, marginBottom: 14 }}>
            ETA: {fmtTime(order.estimated_delivery_at)} · {fmtMin(order.estimated_delivery_at) || 'Due'}
          </div>
        )}

        {/* Actions */}
        {order.status === 'pending' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={{ ...btn('#27AE60', '#fff'), flex: 1 }} onClick={onAccept}>✓ Accept Order</button>
            <button style={{ ...btn('#E74C3C', '#fff'), flex: 1 }} onClick={onReject}>✕ Reject Order</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Platform Settings Modal ───────────────────────────────────────────────────
function PlatformSettingsModal({ platform, T, btn, inp, onClose, onSave }) {
  const meta = PLATFORMS[platform.platform] || {};
  const [f, setF] = useState({
    commission_pct: platform.commission_pct || 15,
    prep_time_min:  platform.prep_time_min  || 30,
    auto_accept:    platform.auto_accept    || false,
    api_key:        platform.api_key        || '',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text }}>{meta.logo} {meta.label} Settings</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.textMid }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 4 }}>COMMISSION %</div>
            <input type="number" style={inp} value={f.commission_pct} step="0.5"
              onChange={e => setF(p => ({ ...p, commission_pct: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 4 }}>DEFAULT PREP TIME (min)</div>
            <input type="number" style={inp} value={f.prep_time_min}
              onChange={e => setF(p => ({ ...p, prep_time_min: e.target.value }))} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, marginBottom: 4 }}>API KEY</div>
            <input type="text" style={inp} value={f.api_key} placeholder="Paste your API key"
              onChange={e => setF(p => ({ ...p, api_key: e.target.value }))} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="auto_accept" checked={f.auto_accept}
              onChange={e => setF(p => ({ ...p, auto_accept: e.target.checked }))} />
            <label htmlFor="auto_accept" style={{ color: T.text, fontSize: 13 }}>Auto-accept incoming orders</label>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
            <button style={btn(T.surface, T.text)} onClick={onClose}>Cancel</button>
            <button style={btn()} onClick={() => onSave(platform.platform, f)}>Save Settings</button>
          </div>
        </div>
      </div>
    </div>
  );
}
