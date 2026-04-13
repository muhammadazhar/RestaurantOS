import React, { useEffect, useState, useCallback } from 'react';
import { getRiderReport } from '../../services/api';
import { Card, PageHeader, Spinner, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

function fmtCur(v) { return 'PKR ' + parseFloat(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 0 }); }
function fmtNum(v) { return parseInt(v || 0).toLocaleString(); }
function fmtMin(v) { const m = Math.round(parseFloat(v || 0)); return m ? `${m} min` : '—'; }

function StatCard({ label, value, icon, color, sub }) {
  useT();
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: color || T.accent }}>{value}</div>
          {sub && <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ fontSize: 28, opacity: 0.25 }}>{icon}</div>
      </div>
    </Card>
  );
}

// Mini sparkline bar chart for daily trend
function DailyChart({ data }) {
  useT();
  if (!data || !data.length) return null;
  const maxRev = Math.max(...data.map(d => parseFloat(d.revenue)), 1);
  const maxDel = Math.max(...data.map(d => parseInt(d.deliveries)), 1);
  return (
    <Card style={{ marginTop: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>Daily Deliveries &amp; Revenue</div>
      <div style={{ fontSize: 11, color: T.textDim, marginBottom: 14 }}>Bar = revenue · Dot = deliveries</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90, overflowX: 'auto' }}>
        {data.map((d, i) => {
          const revPct = maxRev > 0 ? (parseFloat(d.revenue) / maxRev) * 100 : 0;
          const delPct = maxDel > 0 ? (parseInt(d.deliveries) / maxDel) * 100 : 0;
          return (
            <div key={i} style={{ flex: '0 0 auto', minWidth: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
              title={`${d.date}: ${d.deliveries} deliveries · ${fmtCur(d.revenue)}`}>
              {/* dot for delivery count */}
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: T.accent, opacity: 0.8,
                marginBottom: `${(1 - delPct / 100) * 60}px`,
              }} />
              {/* bar for revenue */}
              <div style={{ width: '80%', background: T.accentGlow, borderRadius: '3px 3px 0 0', height: `${revPct}%`, minHeight: parseFloat(d.revenue) > 0 ? 3 : 0 }} />
              <div style={{ fontSize: 9, color: T.textDim, marginTop: 4, textAlign: 'center' }}>
                {d.date?.slice(5)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RiderRow({ rider, isSelected, onClick }) {
  useT();
  const total   = parseInt(rider.total_assigned || 0);
  const deliv   = parseInt(rider.deliveries || 0);
  const cancel  = parseInt(rider.cancellations || 0);
  const rate    = total > 0 ? Math.round((deliv / total) * 100) : 0;

  return (
    <div onClick={onClick} style={{
      padding: '14px 18px', borderRadius: 12,
      background: isSelected ? T.accentGlow : T.surface,
      border: `1px solid ${isSelected ? T.accent : T.border}`,
      cursor: 'pointer', transition: 'all 0.15s',
      display: 'grid',
      gridTemplateColumns: '1fr auto auto auto auto auto',
      gap: 16, alignItems: 'center',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{rider.rider_name}</div>
        {rider.phone && <div style={{ fontSize: 11, color: T.textMid }}>{rider.phone}</div>}
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>{fmtNum(deliv)}</div>
        <div style={{ fontSize: 10, color: T.textDim, textTransform: 'uppercase' }}>Deliveries</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.green }}>{fmtCur(rider.total_sales)}</div>
        <div style={{ fontSize: 10, color: T.textDim, textTransform: 'uppercase' }}>Sales</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: rate >= 80 ? T.green : rate >= 50 ? '#F39C12' : T.red }}>{rate}%</div>
        <div style={{ fontSize: 10, color: T.textDim, textTransform: 'uppercase' }}>Success</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.textMid }}>{fmtMin(rider.avg_delivery_min)}</div>
        <div style={{ fontSize: 10, color: T.textDim, textTransform: 'uppercase' }}>Avg Time</div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: '#F39C12' }}>{fmtCur(rider.total_incentives)}</div>
        <div style={{ fontSize: 10, color: T.textDim, textTransform: 'uppercase' }}>Incentives</div>
      </div>
    </div>
  );
}

const today = new Date();
const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const todayStr = today.toISOString().slice(0, 10);

export default function RiderReports() {
  useT();
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [from,        setFrom]        = useState(firstOfMonth);
  const [to,          setTo]          = useState(todayStr);
  const [selectedId,  setSelectedId]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getRiderReport({ from, to, rider_id: selectedId || undefined });
      setData(res.data);
    } catch { toast.error('Failed to load rider reports'); }
    setLoading(false);
  }, [from, to, selectedId]);

  useEffect(() => { load(); }, [load]);

  const riders = data?.riders || [];
  const daily  = data?.daily  || [];

  // Aggregate totals
  const totDeliveries = riders.reduce((s, r) => s + parseInt(r.deliveries || 0), 0);
  const totSales      = riders.reduce((s, r) => s + parseFloat(r.total_sales || 0), 0);
  const totIncentives = riders.reduce((s, r) => s + parseFloat(r.total_incentives || 0), 0);
  const totAssigned   = riders.reduce((s, r) => s + parseInt(r.total_assigned || 0), 0);
  const successRate   = totAssigned > 0 ? Math.round((totDeliveries / totAssigned) * 100) : 0;
  const avgTime       = riders.length
    ? Math.round(riders.reduce((s, r) => s + parseFloat(r.avg_delivery_min || 0), 0) / riders.filter(r => parseFloat(r.avg_delivery_min) > 0).length || 0)
    : 0;

  const handleRiderClick = (id) => {
    setSelectedId(prev => prev === id ? null : id);
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Rider Reports"
        subtitle="Performance, sales & incentives by rider"
        action={
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: T.textMid }}>From</span>
              <input type="date" value={from} onChange={e => { setFrom(e.target.value); setSelectedId(null); }}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 12px', color: T.text, fontSize: 13, outline: 'none', fontFamily: "'Inter', sans-serif" }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: T.textMid }}>To</span>
              <input type="date" value={to} onChange={e => { setTo(e.target.value); setSelectedId(null); }}
                style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 12px', color: T.text, fontSize: 13, outline: 'none', fontFamily: "'Inter', sans-serif" }} />
            </div>
            {selectedId && (
              <button onClick={() => setSelectedId(null)} style={{
                padding: '9px 14px', background: T.accentGlow, border: `1px solid ${T.accent}`,
                borderRadius: 10, color: T.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>✕ Clear Filter</button>
            )}
          </div>
        }
      />

      {loading ? <Spinner /> : (
        <>
          {/* Summary KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 20 }}>
            <StatCard label="Total Deliveries" value={fmtNum(totDeliveries)} icon="📦" color={T.accent} />
            <StatCard label="Total Revenue"    value={fmtCur(totSales)}      icon="💰" color={T.green} />
            <StatCard label="Success Rate"     value={`${successRate}%`}      icon="✅" color={successRate >= 80 ? T.green : '#F39C12'}
              sub={`${totDeliveries} of ${totAssigned} completed`} />
            <StatCard label="Avg Delivery Time" value={fmtMin(avgTime)}       icon="⏱" color={T.textMid} />
            <StatCard label="Incentives Paid"  value={fmtCur(totIncentives)}  icon="🏆" color="#F39C12" />
          </div>

          {/* Daily trend chart */}
          {daily.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <DailyChart data={daily} />
            </div>
          )}

          {/* Rider table */}
          <Card>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Rider Performance</div>
              <div style={{ fontSize: 12, color: T.textDim }}>
                {selectedId ? 'Showing filtered trend above · click row again to deselect' : 'Click a rider to filter the daily trend'}
              </div>
            </div>
            {riders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: T.textDim }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>🏍</div>
                <div>No rider activity in this period</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {riders.map(r => (
                  <RiderRow
                    key={r.rider_id}
                    rider={r}
                    isSelected={selectedId === r.rider_id}
                    onClick={() => handleRiderClick(r.rider_id)}
                  />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
