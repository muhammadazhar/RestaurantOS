import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getDashboardStats, getOrders, getNotifications, getSetupStatus } from '../../services/api';
import { Card, StatCard, Badge, Spinner, T, useT } from '../shared/UI';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';

export default function Dashboard() {
  useT();
  const { user }             = useAuth();
  const navigate             = useNavigate();
  const [stats,  setStats]   = useState(null);
  const [orders, setOrders]  = useState([]);
  const [alerts, setAlerts]  = useState([]);
  const [setup,  setSetup]   = useState(null);
  const [loading, setLoading] = useState(true);
  const { on, off } = useSocket();

  const load = async () => {
    try {
      const [s, o, n, st] = await Promise.all([
        getDashboardStats(), getOrders({ status: 'preparing' }),
        getNotifications(), getSetupStatus(),
      ]);
      setStats(s.data); setOrders(o.data.slice(0, 5));
      setAlerts(n.data.slice(0, 5)); setSetup(st.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const handler = () => load();
    on('order_updated', handler);
    on('new_order', handler);
    return () => { off('order_updated', handler); off('new_order', handler); };
  }, []);

  if (loading) return <Spinner />;

  const tableMap = {};
  (stats?.tables || []).forEach(t => { tableMap[t.status] = parseInt(t.count); });
  const orderMap = {};
  (stats?.orders || []).forEach(o => { orderMap[o.status] = parseInt(o.count); });

  const statusColor = { preparing: T.accent, ready: T.green, pending: T.blue };
  const alertColor  = { critical: T.red, high: T.accent, info: T.blue };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0 }}>Dashboard Overview</h1>
        <p style={{ color: T.textMid, fontSize: 13, marginTop: 4 }}>
          {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Setup completion banner */}
      {setup && !setup.setup_complete && (
        <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}55`, borderRadius: 16, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 32 }}>🏗</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.text, marginBottom: 4 }}>Complete your restaurant setup</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                ['🪑', 'Tables',     setup.steps?.tables],
                ['📋', 'Categories', setup.steps?.menu_categories],
                ['🍽', 'Menu Items', setup.steps?.menu_items],
                ['👥', 'Staff',      setup.steps?.staff],
              ].map(([ic, label, done]) => (
                <span key={label} style={{ fontSize: 12, color: done ? T.green : T.textMid }}>
                  {done ? '✅' : '⬜'} {ic} {label}
                </span>
              ))}
            </div>
          </div>
          <button onClick={() => navigate('/setup')} style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif", flexShrink: 0 }}>
            Continue Setup →
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <StatCard label="Today's Revenue" value={`PKR ${Number(stats?.revenue?.total || 0).toLocaleString()}`} sub={`${stats?.revenue?.orderCount || 0} paid orders`} color={T.accent} icon="💰" />
        <StatCard label="Orders Today" value={Object.values(orderMap).reduce((a,b)=>a+b,0)} sub={`${orderMap.preparing||0} in kitchen`} color={T.blue} icon="📋" />
        <StatCard label="Tables Occupied" value={`${tableMap.occupied||0}/${Object.values(tableMap).reduce((a,b)=>a+b,0)}`} sub={`${tableMap.reserved||0} reserved`} color={T.green} icon="🪑" />
        <StatCard label="Unread Alerts" value={stats?.unreadAlerts || 0} sub="inventory & system" color={T.red} icon="🔔" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, color: T.text }}>🍳 Active Kitchen Orders</div>
          {orders.length === 0 && <div style={{ color: T.textDim, fontSize: 13 }}>No active orders</div>}
          {orders.map(o => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 10px', background: T.surface, borderRadius: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor[o.status] || T.textMid, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{o.order_number} · {o.table_label || 'Online'}</div>
                <div style={{ fontSize: 11, color: T.textMid }}>{o.server_name || 'N/A'}</div>
              </div>
              <Badge color={statusColor[o.status] || T.textMid} small>{o.status}</Badge>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, color: T.text }}>🔔 Recent Alerts</div>
          {alerts.length === 0 && <div style={{ color: T.textDim, fontSize: 13 }}>No alerts</div>}
          {alerts.map(a => (
            <div key={a.id} style={{ display: 'flex', gap: 10, marginBottom: 10, padding: '8px 10px', background: a.severity === 'critical' ? T.redDim : a.severity === 'high' ? T.accentGlow : T.blueDim, borderRadius: 8 }}>
              <span style={{ fontSize: 14 }}>{a.severity === 'critical' ? '🚨' : a.severity === 'high' ? '⚠️' : 'ℹ️'}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{a.title}</div>
                <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>
                  {new Date(a.created_at).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, color: T.text }}>🪑 Table Status</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {[['Occupied', tableMap.occupied||0, T.accent], ['Vacant', tableMap.vacant||0, T.green], ['Reserved', tableMap.reserved||0, T.blue], ['Cleaning', tableMap.cleaning||0, T.textMid]].map(([l,v,c]) => (
              <div key={l} style={{ background: T.surface, borderRadius: 12, padding: '14px 20px', flex: 1, minWidth: 80, textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: c, fontFamily: 'monospace' }}>{v}</div>
                <div style={{ fontSize: 11, color: T.textMid, marginTop: 4 }}>{l}</div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 16, color: T.text }}>📊 Order Breakdown</div>
          {[['Pending', orderMap.pending||0, T.blue], ['Preparing', orderMap.preparing||0, T.accent], ['Ready', orderMap.ready||0, T.green], ['Paid', orderMap.paid||0, T.textMid]].map(([l,v,c]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, color: T.textMid }}>{l}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 80, height: 6, background: T.border, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.min(100, v * 10)}%`, background: c, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: c, fontFamily: 'monospace', width: 24, textAlign: 'right' }}>{v}</span>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
