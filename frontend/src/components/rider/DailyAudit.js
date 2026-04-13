import React, { useEffect, useState, useCallback } from 'react';
import { getDailyAudit } from '../../services/api';
import { Card, PageHeader, Spinner, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

function fmtCur(v) { return 'PKR ' + parseFloat(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 }); }

function SummaryCard({ label, value, color, icon }) {
  useT();
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: color || T.accent, fontFamily: 'monospace' }}>{value}</div>
        </div>
        <div style={{ fontSize: 28, opacity: 0.3 }}>{icon}</div>
      </div>
    </Card>
  );
}

// Mini bar chart for hourly distribution
function HourlyChart({ data }) {
  useT();
  if (!data || !data.length) return null;
  const maxOrders = Math.max(...data.map(d => parseInt(d.orders)), 1);
  return (
    <Card style={{ marginTop: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 16 }}>Hourly Order Distribution</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
        {Array.from({ length: 24 }, (_, h) => {
          const entry = data.find(d => parseInt(d.hour) === h);
          const count = entry ? parseInt(entry.orders) : 0;
          const pct   = maxOrders > 0 ? (count / maxOrders) * 100 : 0;
          return (
            <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{ width: '100%', background: T.accentGlow, borderRadius: 4, height: `${pct}%`, minHeight: count > 0 ? 4 : 0, position: 'relative' }}
                title={`${h}:00 — ${count} orders`} />
              {h % 4 === 0 && <div style={{ fontSize: 9, color: T.textDim }}>{h}h</div>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function DailyAudit() {
  useT();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [date,    setDate]    = useState(new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDailyAudit({ date });
      setData(res.data);
    } catch { toast.error('Failed to load audit data'); }
    setLoading(false);
  }, [date]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  const s = data?.summary || {};
  const riders = data?.riders || [];

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Daily Delivery Audit"
        subtitle="Overview of all delivery orders and rider collections"
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, outline: 'none', fontFamily: "'Inter', sans-serif" }} />
            <button onClick={load} style={{ padding: '10px 16px', background: T.accentGlow, border: `1px solid ${T.accent}`, borderRadius: 10, color: T.accent, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Refresh</button>
          </div>
        }
      />

      {/* Summary Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginBottom: 24 }}>
        <SummaryCard label="Phone Orders"    value={s.phone_orders || 0}           icon="📞" />
        <SummaryCard label="Online Orders"   value={s.online_orders || 0}          icon="📱" />
        <SummaryCard label="Delivered"       value={s.delivered || 0}              icon="✅" color={T.green} />
        <SummaryCard label="In Transit"      value={s.in_transit || 0}             icon="🚴" color="#F39C12" />
        <SummaryCard label="Cancelled"       value={s.cancelled || 0}              icon="❌" color={T.red} />
        <SummaryCard label="Total Revenue"   value={fmtCur(s.total_revenue)}       icon="💰" />
        <SummaryCard label="Collected"       value={fmtCur(s.collected_revenue)}   icon="✔️" color={T.green} />
        <SummaryCard label="Balance"         value={fmtCur(s.balance_revenue)}     icon="⏳" color={parseFloat(s.balance_revenue) > 0 ? '#F39C12' : T.textMid} />
      </div>

      {/* Hourly Chart */}
      <HourlyChart data={data?.hourly} />

      {/* Per-Rider Breakdown */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 16 }}>Rider Breakdown</div>

        {riders.length === 0
          ? <Card><div style={{ textAlign: 'center', padding: '30px 0', color: T.textDim }}>No riders with deliveries on this date</div></Card>
          : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    {['Rider','Orders','Delivered','Expected','Collected','Balance','Cashier Status','Shortage','Extra'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riders.map(r => {
                    const balance = parseFloat(r.expected || 0) - parseFloat(r.collected || 0);
                    return (
                      <tr key={r.rider_id} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: T.text }}>{r.rider_name}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: T.text }}>{r.total_orders}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: T.green, fontWeight: 700 }}>{r.delivered}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: T.text }}>{fmtCur(r.expected)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: T.green }}>{fmtCur(r.collected)}</td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: balance > 0 ? '#F39C12' : T.textMid, fontWeight: balance > 0 ? 700 : 400 }}>{fmtCur(balance)}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: r.cashier_status === 'collected' ? '#27AE6022' : '#F39C1222', color: r.cashier_status === 'collected' ? '#27AE60' : '#F39C12' }}>
                            {r.cashier_status ? r.cashier_status.toUpperCase() : 'PENDING'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: T.red }}>
                          {parseFloat(r.shortage_amount) > 0 ? fmtCur(r.shortage_amount) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: 13, color: T.green }}>
                          {parseFloat(r.extra_amount) > 0 ? fmtCur(r.extra_amount) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {/* Totals Row */}
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${T.border}`, background: T.surface }}>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 800, color: T.text }}>TOTAL</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700 }}>{riders.reduce((s,r) => s + parseInt(r.total_orders||0), 0)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: T.green }}>{riders.reduce((s,r) => s + parseInt(r.delivered||0), 0)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700 }}>{fmtCur(riders.reduce((s,r) => s + parseFloat(r.expected||0), 0))}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: T.green }}>{fmtCur(riders.reduce((s,r) => s + parseFloat(r.collected||0), 0))}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#F39C12' }}>
                      {fmtCur(riders.reduce((s,r) => s + Math.max(0, parseFloat(r.expected||0) - parseFloat(r.collected||0)), 0))}
                    </td>
                    <td colSpan={3} />
                  </tr>
                </tfoot>
              </table>
            </Card>
          )
        }
      </div>
    </div>
  );
}
