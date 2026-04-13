import React, { useEffect, useState, useCallback } from 'react';
import { getSalesReport, getEmployeeReport, getMenuReport, getPerformanceReport } from '../../services/api';
import { Card, StatCard, Badge, Spinner, Btn, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const IMG_BASE = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';
const fmt      = (n, dec = 0) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtPKR   = (n) => `PKR ${fmt(n)}`;
const today    = () => new Date().toISOString().slice(0, 10);
const nDaysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const yearStart  = () => `${new Date().getFullYear()}-01-01`;

// ─── Print / Export utilities ─────────────────────────────────────────────────
function printHTML(title, bodyHtml) {
  const w = window.open('', '_blank', 'width=960,height=720');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:12px;padding:28px 32px;color:#111}
    h1{font-size:20px;font-weight:bold;margin-bottom:4px}
    h2{font-size:14px;font-weight:bold;margin:22px 0 10px;padding-bottom:5px;border-bottom:2px solid #ccc}
    .meta{font-size:11px;color:#666;margin-bottom:20px}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px}
    .kpi{border:1px solid #ddd;border-radius:6px;padding:12px 14px;background:#f9f9f9}
    .kpi-v{font-size:18px;font-weight:bold;margin-bottom:3px}
    .kpi-l{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px}
    table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:12px}
    th{background:#f0f0f0;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #ccc;white-space:nowrap}
    td{padding:7px 10px;border-bottom:1px solid #eee}
    tr:nth-child(even) td{background:#fafafa}
    .right{text-align:right} .center{text-align:center}
    @media print{body{padding:0 8px}.no-print{display:none}}
  </style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

function downloadExcel(filename, sections) {
  // sections = [{ title, headers, rows }]
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body>';
  sections.forEach(({ title, headers, rows }) => {
    html += `<table><tr><td colspan="${headers.length}"><b>${title}</b></td></tr>`;
    html += `<tr>${headers.map(h => `<th style="background:#d0d0d0;font-weight:bold">${h}</th>`).join('')}</tr>`;
    rows.forEach(r => { html += `<tr>${r.map(c => `<td>${c ?? ''}</td>`).join('')}</tr>`; });
    html += '</table><tr><td>&nbsp;</td></tr>';
  });
  html += '</body></html>';
  const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.xls`; a.click();
  URL.revokeObjectURL(url);
}

const PERIOD_PRESETS = [
  { label: 'Today',        from: today(),       to: today() },
  { label: 'Yesterday',    from: nDaysAgo(1),   to: nDaysAgo(1) },
  { label: 'Last 7 Days',  from: nDaysAgo(6),   to: today() },
  { label: 'Last 30 Days', from: nDaysAgo(29),  to: today() },
  { label: 'This Month',   from: monthStart(),  to: today() },
  { label: 'This Year',    from: yearStart(),   to: today() },
];

// ─── Mini bar chart (pure CSS) ────────────────────────────────────────────────
const BarChart = ({ data, valueKey, labelKey, color, height = 120, prefix = '' }) => {
  useT();
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height, paddingBottom: 20, position: 'relative' }}>
      {data.map((d, i) => {
        const pct = (Number(d[valueKey]) / max) * 100;
        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', position: 'relative' }}
            title={`${d[labelKey]}: ${prefix}${fmt(d[valueKey])}`}>
            <div style={{
              width: '100%', borderRadius: '3px 3px 0 0',
              background: color || T.accent, opacity: 0.85,
              height: `${Math.max(pct, 2)}%`, transition: 'height 0.4s',
              cursor: 'pointer', minHeight: 2,
            }} />
            <div style={{ position: 'absolute', bottom: 0, fontSize: 9, color: T.textDim, whiteSpace: 'nowrap', transform: 'rotate(-35deg)', transformOrigin: 'top left', marginTop: 2 }}>
              {String(d[labelKey] || '').slice(-5)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Horizontal bar ───────────────────────────────────────────────────────────
const HBar = ({ value, max, color }) => {
  useT();
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ flex: 1, height: 6, background: T.border, borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color || T.accent, borderRadius: 3, transition: 'width 0.5s' }} />
    </div>
  );
};

// ─── Date Range Picker ────────────────────────────────────────────────────────
const DateRangePicker = ({ from, to, onChange }) => {
  useT();
  const [active, setActive] = useState('Last 7 Days');
  const apply = (preset) => { setActive(preset.label); onChange(preset.from, preset.to); };

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {PERIOD_PRESETS.map(p => (
        <button key={p.label} onClick={() => apply(p)} style={{
          background: active === p.label ? T.accent : T.card,
          color:      active === p.label ? '#000' : T.textMid,
          border: `1px solid ${active === p.label ? T.accent : T.border}`,
          borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'Inter',sans-serif",
        }}>{p.label}</button>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 4 }}>
        <input type="date" value={from} onChange={e => { setActive('Custom'); onChange(e.target.value, to); }}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', color: T.text, fontSize: 12, fontFamily:"'Inter',sans-serif", outline: 'none' }} />
        <span style={{ color: T.textDim, fontSize: 12 }}>→</span>
        <input type="date" value={to} onChange={e => { setActive('Custom'); onChange(from, e.target.value); }}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', color: T.text, fontSize: 12, fontFamily:"'Inter',sans-serif", outline: 'none' }} />
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1: SALES REPORT
// ═══════════════════════════════════════════════════════════════════════════════
function SalesReport() {
  useT();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(nDaysAgo(6));
  const [to,      setTo]      = useState(today());

  const load = useCallback(() => {
    setLoading(true);
    getSalesReport({ from, to })
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load sales report'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  const s = data?.summary || {};
  const totalRevenue  = Number(s.total_revenue  || 0);
  const maxDayRevenue = Math.max(...(data?.byPeriod || []).map(d => Number(d.revenue)), 1);
  const maxHour       = Math.max(...(data?.byHour   || []).map(d => Number(d.revenue)), 1);

  // Build full 24-hour array
  const hourArray = Array.from({ length: 24 }, (_, h) => {
    const found = (data?.byHour || []).find(d => d.hour === h);
    return { hour: `${String(h).padStart(2,'0')}:00`, revenue: found ? Number(found.revenue) : 0, orders: found ? Number(found.orders) : 0 };
  });

  const handlePrint = () => {
    const byPeriodRows = (data?.byPeriod || []).map(d => [d.period, d.orders, `PKR ${Number(d.revenue).toLocaleString()}`]);
    const byTypeRows   = (data?.byType   || []).map(t => [t.order_type?.replace('_',' '), t.orders, `PKR ${Number(t.revenue).toLocaleString()}`]);
    const topRows      = (data?.topItems || []).slice(0,15).map((i,idx) => [idx+1, i.name, i.category_name||'—', fmt(i.qty_sold), `PKR ${fmt(i.total_revenue)}`]);
    const hourRows     = hourArray.filter(h=>h.orders>0).map(h => [h.hour, h.orders, `PKR ${fmt(h.revenue)}`]);
    printHTML(`Sales Report — ${from} to ${to}`, `
      <h1>Sales Report</h1>
      <div class="meta">Period: ${from} to ${to} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-PK')}</div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-v">PKR ${fmt(s.total_revenue)}</div><div class="kpi-l">Total Revenue</div></div>
        <div class="kpi"><div class="kpi-v">${fmt(s.paid_orders)}</div><div class="kpi-l">Paid Orders</div></div>
        <div class="kpi"><div class="kpi-v">PKR ${fmt(s.avg_order_value)}</div><div class="kpi-l">Avg Order Value</div></div>
        <div class="kpi"><div class="kpi-v">${fmt(s.total_guests)}</div><div class="kpi-l">Total Guests</div></div>
      </div>
      <h2>Revenue by Day</h2>
      <table><thead><tr><th>Date</th><th class="right">Orders</th><th class="right">Revenue</th></tr></thead><tbody>
        ${byPeriodRows.map(r=>`<tr><td>${r[0]}</td><td class="right">${r[1]}</td><td class="right">${r[2]}</td></tr>`).join('')}
      </tbody></table>
      <h2>Revenue by Order Type</h2>
      <table><thead><tr><th>Type</th><th class="right">Orders</th><th class="right">Revenue</th></tr></thead><tbody>
        ${byTypeRows.map(r=>`<tr><td>${r[0]}</td><td class="right">${r[1]}</td><td class="right">${r[2]}</td></tr>`).join('')}
      </tbody></table>
      <h2>Top Selling Items</h2>
      <table><thead><tr><th>#</th><th>Item</th><th>Category</th><th class="right">Qty Sold</th><th class="right">Revenue</th></tr></thead><tbody>
        ${topRows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="right">${r[3]}</td><td class="right">${r[4]}</td></tr>`).join('')}
      </tbody></table>
      <h2>Financial Summary</h2>
      <table><tbody>
        <tr><td>Subtotal</td><td class="right">PKR ${fmt(s.total_subtotal)}</td></tr>
        <tr><td>Discounts</td><td class="right">− PKR ${fmt(s.total_discount)}</td></tr>
        <tr><td>Tax (8%)</td><td class="right">PKR ${fmt(s.total_tax)}</td></tr>
        <tr><td><b>Net Revenue</b></td><td class="right"><b>PKR ${fmt(s.total_revenue)}</b></td></tr>
      </tbody></table>
    `);
  };

  const handleExport = () => {
    downloadExcel(`Sales_Report_${from}_${to}`, [
      { title: 'Summary', headers: ['Metric','Value'], rows: [
        ['Total Revenue', `PKR ${fmt(s.total_revenue)}`],
        ['Paid Orders', fmt(s.paid_orders)],
        ['Cancelled Orders', fmt(s.cancelled_orders)],
        ['Avg Order Value', `PKR ${fmt(s.avg_order_value)}`],
        ['Total Guests', fmt(s.total_guests)],
        ['Total Subtotal', `PKR ${fmt(s.total_subtotal)}`],
        ['Total Discounts', `PKR ${fmt(s.total_discount)}`],
        ['Total Tax', `PKR ${fmt(s.total_tax)}`],
      ]},
      { title: 'Revenue by Day', headers: ['Date','Orders','Revenue (PKR)'], rows: (data?.byPeriod||[]).map(d=>[d.period, d.orders, Number(d.revenue).toFixed(2)]) },
      { title: 'Revenue by Order Type', headers: ['Type','Orders','Revenue (PKR)'], rows: (data?.byType||[]).map(t=>[t.order_type, t.orders, Number(t.revenue).toFixed(2)]) },
      { title: 'Orders by Hour', headers: ['Hour','Orders','Revenue (PKR)'], rows: hourArray.map(h=>[h.hour, h.orders, h.revenue.toFixed(2)]) },
      { title: 'Top Selling Items', headers: ['Item','Category','Qty Sold','Revenue (PKR)'], rows: (data?.topItems||[]).map(i=>[i.name, i.category_name||'', Number(i.qty_sold), Number(i.total_revenue).toFixed(2)]) },
    ]);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}><DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>
        {data && <>
          <button onClick={handlePrint}  style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily:"'Inter',sans-serif", whiteSpace: 'nowrap' }}>🖨 Print PDF</button>
          <button onClick={handleExport} style={{ background: T.accent, border: 'none', color: '#000', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily:"'Inter',sans-serif", whiteSpace: 'nowrap' }}>📥 Excel</button>
        </>}
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'flex', gap: 14, margin: '20px 0', flexWrap: 'wrap' }}>
        <StatCard label="Total Revenue"    value={fmtPKR(s.total_revenue)}  color={T.green}  icon="💰" />
        <StatCard label="Paid Orders"      value={fmt(s.paid_orders)}        color={T.accent} icon="✅" sub={`${fmt(s.cancelled_orders)} cancelled`} />
        <StatCard label="Avg Order Value"  value={fmtPKR(s.avg_order_value)} color={T.blue}   icon="📊" />
        <StatCard label="Total Guests"     value={fmt(s.total_guests)}        color={T.purple} icon="👥" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Revenue by day */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 16 }}>📈 Revenue by Day</div>
          {(data?.byPeriod || []).length === 0
            ? <div style={{ color: T.textDim, textAlign: 'center', padding: 40 }}>No data for this period</div>
            : (
              <>
                <BarChart data={data.byPeriod} valueKey="revenue" labelKey="period" color={T.accent} height={140} prefix="PKR " />
                <div style={{ marginTop: 12, maxHeight: 160, overflowY: 'auto' }}>
                  {data.byPeriod.map((d, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
                      <span style={{ fontSize: 12, color: T.textMid }}>{d.period}</span>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: T.textDim }}>{d.orders} orders</span>
                        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: T.green }}>{fmtPKR(d.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
        </Card>

        {/* By order type */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 16 }}>🛍 By Order Type</div>
          {(data?.byType || []).length === 0
            ? <div style={{ color: T.textDim, fontSize: 13 }}>No data</div>
            : data.byType.map((t, i) => {
              const colors = [T.accent, T.blue, T.green, T.purple];
              const total  = data.byType.reduce((s, x) => s + Number(x.revenue), 0);
              const pct    = total > 0 ? Math.round(Number(t.revenue) / total * 100) : 0;
              const icons  = { dine_in:'🪑', takeaway:'🛍', online:'📲', delivery:'🛵' };
              return (
                <div key={t.order_type} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{icons[t.order_type] || '📋'} {t.order_type?.replace('_',' ')}</span>
                    <span style={{ fontSize: 12, fontFamily: 'monospace', color: colors[i % colors.length] }}>{pct}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <HBar value={Number(t.revenue)} max={total} color={colors[i % colors.length]} />
                    <span style={{ fontSize: 11, color: T.textDim, flexShrink: 0 }}>{fmt(t.orders)} orders</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{fmtPKR(t.revenue)}</div>
                </div>
              );
            })}

          {/* Tax / discount breakdown */}
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 16, paddingTop: 12 }}>
            {[
              ['Subtotal',  s.total_subtotal,  T.text],
              ['Discounts', `-${fmtPKR(s.total_discount)}`, T.green],
              ['Tax (8%)',  s.total_tax,       T.textMid],
              ['Net Revenue', s.total_revenue, T.accent],
            ].map(([l, v, c]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: T.textMid }}>{l}</span>
                <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: l === 'Net Revenue' ? 800 : 500, color: c }}>
                  {typeof v === 'string' ? v : fmtPKR(v)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Hourly heatmap */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 16 }}>⏰ Orders by Hour of Day</div>
          <BarChart data={hourArray.filter(h => h.hour >= '06:00')} valueKey="orders" labelKey="hour" color={T.blue} height={110} />
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 8, textAlign: 'center' }}>Peak hours shown. Mouse over a bar for details.</div>
        </Card>

        {/* Top items */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 16 }}>🔥 Top Selling Items</div>
          {(data?.topItems || []).slice(0, 8).map((item, i) => (
            <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderBottom: `1px solid ${T.border}` }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: i < 3 ? T.accentGlow : T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: T.accent, flexShrink: 0 }}>
                {i + 1}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                {item.category_name && <div style={{ fontSize: 10, color: T.textDim }}>{item.category_name}</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: T.accent }}>{fmtPKR(item.total_revenue)}</div>
                <div style={{ fontSize: 10, color: T.textDim }}>×{fmt(item.qty_sold)} sold</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2: MENU PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════
function MenuReport() {
  useT();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(nDaysAgo(29));
  const [to,      setTo]      = useState(today());
  const [sortBy,  setSortBy]  = useState('qty_sold');

  const load = useCallback(() => {
    setLoading(true);
    getMenuReport({ from, to })
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load menu report'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  const items  = [...(data?.items || [])].sort((a, b) => Number(b[sortBy]) - Number(a[sortBy]));
  const maxQty = Math.max(...items.map(i => Number(i.qty_sold)), 1);
  const maxRev = Math.max(...items.map(i => Number(i.total_revenue)), 1);

  // ABC analysis: top 20% = A (stars), next 30% = B (horses), bottom 50% = C (dogs)
  const withABC = items.map((item, i) => {
    const rank = i / items.length;
    return { ...item, abc: rank < 0.2 ? 'A' : rank < 0.5 ? 'B' : 'C' };
  });

  const ABC_COLOR = { A: T.green, B: T.accent, C: T.textDim };
  const ABC_LABEL = { A: '⭐ Star', B: '🐎 Workhorse', C: '💤 Low Seller' };

  const handlePrint = () => {
    const catRows  = (data?.byCategory||[]).map(c => [c.category, fmt(c.qty_sold), `PKR ${fmt(c.revenue)}`]);
    const itemRows = withABC.map((item,i) => {
      const margin = Number(item.total_revenue)>0 ? Math.round(Number(item.gross_profit)/Number(item.total_revenue)*100) : 0;
      return [i+1, item.name, item.category_name||'—', item.abc, fmt(item.qty_sold), `PKR ${fmt(item.total_revenue)}`, `PKR ${fmt(item.estimated_cost)}`, `PKR ${fmt(item.gross_profit)}`, `${margin}%`];
    });
    printHTML(`Menu Performance — ${from} to ${to}`, `
      <h1>Menu Performance Report</h1>
      <div class="meta">Period: ${from} to ${to} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-PK')}</div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-v">${items.length}</div><div class="kpi-l">Total Items</div></div>
        <div class="kpi"><div class="kpi-v">${fmt(items.reduce((s,i)=>s+Number(i.qty_sold),0))}</div><div class="kpi-l">Items Sold</div></div>
        <div class="kpi"><div class="kpi-v">PKR ${fmt(items.reduce((s,i)=>s+Number(i.total_revenue),0))}</div><div class="kpi-l">Menu Revenue</div></div>
        <div class="kpi"><div class="kpi-v">PKR ${fmt(items.reduce((s,i)=>s+Number(i.gross_profit),0))}</div><div class="kpi-l">Est. Profit</div></div>
      </div>
      <h2>Revenue by Category</h2>
      <table><thead><tr><th>Category</th><th class="right">Qty Sold</th><th class="right">Revenue</th></tr></thead><tbody>
        ${catRows.map(r=>`<tr><td>${r[0]}</td><td class="right">${r[1]}</td><td class="right">${r[2]}</td></tr>`).join('')}
      </tbody></table>
      <h2>All Menu Items</h2>
      <table><thead><tr><th>#</th><th>Item</th><th>Category</th><th class="center">ABC</th><th class="right">Qty</th><th class="right">Revenue</th><th class="right">Est. Cost</th><th class="right">Gross Profit</th><th class="right">Margin</th></tr></thead><tbody>
        ${itemRows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td class="center">${r[3]}</td><td class="right">${r[4]}</td><td class="right">${r[5]}</td><td class="right">${r[6]}</td><td class="right">${r[7]}</td><td class="right">${r[8]}</td></tr>`).join('')}
      </tbody></table>
    `);
  };

  const handleExport = () => {
    downloadExcel(`Menu_Report_${from}_${to}`, [
      { title: 'Category Summary', headers: ['Category','Qty Sold','Revenue (PKR)'], rows: (data?.byCategory||[]).map(c=>[c.category, Number(c.qty_sold), Number(c.revenue).toFixed(2)]) },
      { title: 'All Menu Items', headers: ['#','Item','Category','ABC','Qty Sold','Revenue (PKR)','Est. Cost (PKR)','Gross Profit (PKR)','Margin %'], rows: withABC.map((item,i) => {
        const margin = Number(item.total_revenue)>0 ? Math.round(Number(item.gross_profit)/Number(item.total_revenue)*100) : 0;
        return [i+1, item.name, item.category_name||'', item.abc, Number(item.qty_sold), Number(item.total_revenue).toFixed(2), Number(item.estimated_cost).toFixed(2), Number(item.gross_profit).toFixed(2), margin];
      })},
    ]);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}><DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>
        {data && <>
          <button onClick={handlePrint}  style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily:"'Inter',sans-serif", whiteSpace: 'nowrap' }}>🖨 Print PDF</button>
          <button onClick={handleExport} style={{ background: T.accent, border: 'none', color: '#000', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily:"'Inter',sans-serif", whiteSpace: 'nowrap' }}>📥 Excel</button>
        </>}
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 14, margin: '20px 0', flexWrap: 'wrap' }}>
        <StatCard label="Total Items"   value={items.length}                                                       color={T.accent} icon="🍽" />
        <StatCard label="Items Sold"    value={fmt(items.reduce((s, i) => s + Number(i.qty_sold), 0))}             color={T.blue}   icon="📦" />
        <StatCard label="Menu Revenue"  value={fmtPKR(items.reduce((s, i) => s + Number(i.total_revenue), 0))}     color={T.green}  icon="💰" />
        <StatCard label="Est. Profit"   value={fmtPKR(items.reduce((s, i) => s + Number(i.gross_profit), 0))}      color={T.purple} icon="📈" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* By category */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 16 }}>📋 Revenue by Category</div>
          {(data?.byCategory || []).filter(c => Number(c.revenue) > 0).map((cat, i) => {
            const totalRevenue = (data.byCategory).reduce((s, c) => s + Number(c.revenue), 0);
            const pct = totalRevenue > 0 ? Math.round(Number(cat.revenue) / totalRevenue * 100) : 0;
            const colors = [T.accent, T.blue, T.green, T.purple, T.red, T.textMid];
            return (
              <div key={cat.category} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{cat.category}</span>
                  <span style={{ fontSize: 11, color: T.textDim }}>{pct}% · {fmt(cat.qty_sold)} sold</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <HBar value={Number(cat.revenue)} max={totalRevenue} color={colors[i % colors.length]} />
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: colors[i % colors.length], flexShrink: 0 }}>{fmtPKR(cat.revenue)}</span>
                </div>
              </div>
            );
          })}
        </Card>

        {/* ABC Analysis */}
        <Card>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 4 }}>🎯 Menu Mix Analysis</div>
          <div style={{ fontSize: 11, color: T.textDim, marginBottom: 16 }}>ABC classification by sales volume</div>
          {['A','B','C'].map(cls => {
            const group = withABC.filter(i => i.abc === cls);
            return (
              <div key={cls} style={{ background: T.surface, borderRadius: 10, padding: '10px 14px', marginBottom: 10, borderLeft: `3px solid ${ABC_COLOR[cls]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: ABC_COLOR[cls] }}>{ABC_LABEL[cls]}</span>
                  <Badge color={ABC_COLOR[cls]} small>{group.length} items</Badge>
                </div>
                <div style={{ fontSize: 11, color: T.textMid }}>
                  {fmtPKR(group.reduce((s, i) => s + Number(i.total_revenue), 0))} revenue ·{' '}
                  {fmt(group.reduce((s, i) => s + Number(i.qty_sold), 0))} sold
                </div>
                <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {group.slice(0, 5).map(item => (
                    <span key={item.name} style={{ fontSize: 10, background: T.card, border: `1px solid ${T.border}`, borderRadius: 6, padding: '2px 8px', color: T.textMid }}>
                      {item.name}
                    </span>
                  ))}
                  {group.length > 5 && <span style={{ fontSize: 10, color: T.textDim }}>+{group.length - 5} more</span>}
                </div>
              </div>
            );
          })}
        </Card>
      </div>

      {/* Full items table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>All Menu Items</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['qty_sold','Units Sold'], ['total_revenue','Revenue'], ['gross_profit','Profit'], ['order_count','Orders']].map(([k, l]) => (
              <button key={k} onClick={() => setSortBy(k)} style={{
                background: sortBy === k ? T.accent : T.surface,
                color: sortBy === k ? '#000' : T.textMid,
                border: `1px solid ${sortBy === k ? T.accent : T.border}`,
                borderRadius: 7, padding: '4px 12px', fontSize: 11, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Inter',sans-serif",
              }}>{l}</button>
            ))}
          </div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface }}>
              {['#', 'Item', 'Category', 'ABC', 'Units Sold', 'Revenue', 'Est. Cost', 'Gross Profit', 'Margin'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withABC.map((item, i) => {
              const margin = Number(item.total_revenue) > 0
                ? Math.round((Number(item.gross_profit) / Number(item.total_revenue)) * 100)
                : 0;
              return (
                <tr key={item.id || item.name} style={{ borderTop: `1px solid ${T.border}` }}>
                  <td style={{ padding: '10px 14px', color: T.textDim, fontSize: 12 }}>{i + 1}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {item.image_url && (
                        <img src={item.image_url.startsWith('http') ? item.image_url : `${IMG_BASE}${item.image_url}`}
                          alt={item.name} onError={e => e.target.style.display = 'none'}
                          style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                      )}
                      <span style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{item.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>{item.category_name && <Badge color={T.blue} small>{item.category_name}</Badge>}</td>
                  <td style={{ padding: '10px 14px' }}><Badge color={ABC_COLOR[item.abc]} small>{item.abc}</Badge></td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: T.text }}>{fmt(item.qty_sold)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 700, color: T.accent }}>{fmtPKR(item.total_revenue)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: 12, color: T.textMid }}>{fmtPKR(item.estimated_cost)}</td>
                  <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontWeight: 600, color: Number(item.gross_profit) >= 0 ? T.green : T.red }}>
                    {fmtPKR(item.gross_profit)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <HBar value={margin} max={100} color={margin > 60 ? T.green : margin > 30 ? T.accent : T.red} />
                      <span style={{ fontSize: 11, fontFamily: 'monospace', color: T.textMid, minWidth: 32 }}>{margin}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3: EMPLOYEE PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════
function EmployeeReport() {
  useT();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(nDaysAgo(29));
  const [to,      setTo]      = useState(today());
  const [sortBy,  setSortBy]  = useState('total_revenue');

  const load = useCallback(() => {
    setLoading(true);
    getEmployeeReport({ from, to })
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load employee report'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;

  const employees = [...(data?.employees || [])]
    .sort((a, b) => Number(b[sortBy] || 0) - Number(a[sortBy] || 0));

  const maxRevenue     = Math.max(...employees.map(e => Number(e.total_revenue    || 0)), 1);
  const maxOrders      = Math.max(...employees.map(e => Number(e.paid_orders      || 0)), 1);
  const maxAttendance  = 100;

  const ROLE_COLOR = { Manager: T.purple, 'Head Server': T.accent, Server: T.blue, Chef: T.red, Cashier: T.green };

  // Performance score (composite: 40% revenue, 30% orders, 30% attendance)
  const withScore = employees.map(e => {

    const revenueScore    = maxRevenue > 0    ? (Number(e.total_revenue    || 0) / maxRevenue)    * 40 : 0;
    const ordersScore     = maxOrders  > 0    ? (Number(e.paid_orders      || 0) / maxOrders)     * 30 : 0;
    const attendanceScore = (Number(e.attendance_pct || 0) / 100) * 30;
    const score = Math.round(revenueScore + ordersScore + attendanceScore);
    return { ...e, score };
  }).sort((a, b) => b.score - a.score);

  const topPerformer = withScore[0];

  const handlePrint = () => {
    const empRows = withScore.map((e,i) => [
      i<3?['🥇','🥈','🥉'][i]:`#${i+1}`, e.full_name, e.role_name, e.score,
      `PKR ${fmt(e.total_revenue)}`, fmt(e.paid_orders), `PKR ${fmt(e.avg_order_value)}`,
      `${e.completed_shifts||0}/${e.total_shifts||0}`, `${Number(e.attendance_pct||0).toFixed(1)}%`, fmt(e.cancelled_orders),
    ]);
    const avgAtt = Math.round(employees.reduce((s,e)=>s+Number(e.attendance_pct||0),0)/(employees.length||1));
    printHTML(`Employee Performance — ${from} to ${to}`, `
      <h1>Employee Performance Report</h1>
      <div class="meta">Period: ${from} to ${to} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-PK')}</div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-v">${employees.length}</div><div class="kpi-l">Active Staff</div></div>
        <div class="kpi"><div class="kpi-v">PKR ${fmt(employees.reduce((s,e)=>s+Number(e.total_revenue||0),0))}</div><div class="kpi-l">Total Revenue</div></div>
        <div class="kpi"><div class="kpi-v">${fmt(employees.reduce((s,e)=>s+Number(e.paid_orders||0),0))}</div><div class="kpi-l">Orders Served</div></div>
        <div class="kpi"><div class="kpi-v">${avgAtt}%</div><div class="kpi-l">Avg Attendance</div></div>
      </div>
      <h2>Employee Performance</h2>
      <table><thead><tr><th>Rank</th><th>Name</th><th>Role</th><th class="right">Score</th><th class="right">Revenue</th><th class="right">Orders</th><th class="right">Avg Order</th><th class="center">Shifts</th><th class="right">Attendance</th><th class="right">Cancels</th></tr></thead><tbody>
        ${empRows.map(r=>`<tr><td>${r[0]}</td><td><b>${r[1]}</b></td><td>${r[2]}</td><td class="right">${r[3]}</td><td class="right">${r[4]}</td><td class="right">${r[5]}</td><td class="right">${r[6]}</td><td class="center">${r[7]}</td><td class="right">${r[8]}</td><td class="right">${r[9]}</td></tr>`).join('')}
      </tbody></table>
    `);
  };

  const handleExport = () => {
    downloadExcel(`Employee_Report_${from}_${to}`, [
      { title: 'Employee Performance', headers: ['Rank','Name','Role','Score','Revenue (PKR)','Orders','Avg Order (PKR)','Shifts Completed','Total Shifts','Attendance %','Cancellations'], rows: withScore.map((e,i) => [
        i+1, e.full_name, e.role_name, e.score,
        Number(e.total_revenue||0).toFixed(2), Number(e.paid_orders||0), Number(e.avg_order_value||0).toFixed(2),
        e.completed_shifts||0, e.total_shifts||0, Number(e.attendance_pct||0).toFixed(1), Number(e.cancelled_orders||0),
      ])},
    ]);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}><DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>
        {data && <>
          <button onClick={handlePrint}  style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily:"'Inter',sans-serif", whiteSpace: 'nowrap' }}>🖨 Print PDF</button>
          <button onClick={handleExport} style={{ background: T.accent, border: 'none', color: '#000', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily:"'Inter',sans-serif", whiteSpace: 'nowrap' }}>📥 Excel</button>
        </>}
      </div>

      {/* Summary */}
      <div style={{ display: 'flex', gap: 14, margin: '20px 0', flexWrap: 'wrap' }}>
        <StatCard label="Active Staff"    value={employees.length}                                                                         color={T.accent}  icon="👥" />
        <StatCard label="Total Revenue"   value={fmtPKR(employees.reduce((s, e) => s + Number(e.total_revenue || 0), 0))}                  color={T.green}   icon="💰" />
        <StatCard label="Orders Served"   value={fmt(employees.reduce((s, e) => s + Number(e.paid_orders || 0), 0))}                       color={T.blue}    icon="📋" />
        <StatCard label="Avg Attendance"  value={`${Math.round(employees.reduce((s, e) => s + Number(e.attendance_pct || 0), 0) / (employees.length || 1))}%`} color={T.purple} icon="📅" />
      </div>

      {/* Leaderboard */}
      {withScore.length > 0 && (
        <Card style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 16 }}>🏆 Performance Leaderboard</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8 }}>
            {withScore.slice(0, 5).map((emp, i) => (
              <div key={emp.id} style={{
                flex: '0 0 170px', background: i === 0 ? T.accentGlow : T.surface,
                border: `1px solid ${i === 0 ? T.accent + '66' : T.border}`,
                borderRadius: 14, padding: '16px 14px', textAlign: 'center',
                position: 'relative',
              }}>
                {i < 3 && (
                  <div style={{ position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)', fontSize: 18 }}>
                    {['🥇','🥈','🥉'][i]}
                  </div>
                )}
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: T.accentGlow, border: `2px solid ${ROLE_COLOR[emp.role_name] || T.accent}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: T.accent, margin: '8px auto 10px' }}>
                  {emp.full_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2 }}>{emp.full_name?.split(' ')[0]}</div>
                <div style={{ fontSize: 10, color: ROLE_COLOR[emp.role_name] || T.textMid, marginBottom: 8 }}>{emp.role_name}</div>
                {/* Score ring */}
                <div style={{ fontSize: 22, fontWeight: 800, color: i === 0 ? T.accent : T.text, fontFamily: 'monospace' }}>{emp.score}</div>
                <div style={{ fontSize: 10, color: T.textDim, marginBottom: 8 }}>score</div>
                <div style={{ fontSize: 11, color: T.textMid }}>{fmtPKR(emp.total_revenue)}</div>
                <div style={{ fontSize: 10, color: T.textDim }}>{fmt(emp.paid_orders)} orders</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Sort controls */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {[['score','Performance'],['total_revenue','Revenue'],['paid_orders','Orders'],['attendance_pct','Attendance'],['avg_order_value','Avg Order']].map(([k,l]) => (
          <button key={k} onClick={() => setSortBy(k)} style={{
            background: sortBy === k ? T.accent : T.card, color: sortBy === k ? '#000' : T.textMid,
            border: `1px solid ${sortBy === k ? T.accent : T.border}`,
            borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'Inter',sans-serif",
          }}>{l}</button>
        ))}
      </div>

      {/* Employee detail table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface }}>
              {['Rank','Employee','Role','Score','Revenue','Orders','Avg Order','Guests','Shifts','Attendance','Cancellations'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withScore.map((emp, i) => {
              const isTop = i === 0;
              const attPct = Number(emp.attendance_pct || 0);
              return (
                <tr key={emp.id} style={{ borderTop: `1px solid ${T.border}`, background: isTop ? T.accentGlow + '44' : 'transparent' }}>
                  <td style={{ padding: '12px', fontSize: 13, fontWeight: 800, color: i < 3 ? T.accent : T.textDim }}>
                    {i < 3 ? ['🥇','🥈','🥉'][i] : `#${i+1}`}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.accentGlow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: T.accent, flexShrink: 0 }}>
                        {emp.full_name?.split(' ').map(n => n[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{emp.full_name}</div>
                        <div style={{ fontSize: 10, color: T.textDim }}>{emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <Badge color={ROLE_COLOR[emp.role_name] || T.textMid} small>{emp.role_name}</Badge>
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <HBar value={emp.score} max={100} color={emp.score > 70 ? T.green : emp.score > 40 ? T.accent : T.red} />
                      <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: T.text, minWidth: 28 }}>{emp.score}</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: T.accent }}>{fmtPKR(emp.total_revenue)}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 13, color: T.text }}>{fmt(emp.paid_orders)}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 12, color: T.textMid }}>{fmtPKR(emp.avg_order_value)}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 12, color: T.textMid }}>{fmt(emp.total_guests)}</td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 12, color: T.textMid }}>{emp.completed_shifts || 0}/{emp.total_shifts || 0}</td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <HBar value={attPct} max={100} color={attPct >= 90 ? T.green : attPct >= 70 ? T.accent : T.red} />
                      <span style={{ fontFamily: 'monospace', fontSize: 12, color: attPct >= 90 ? T.green : attPct >= 70 ? T.accent : T.red, minWidth: 36 }}>{attPct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '12px', fontFamily: 'monospace', fontSize: 12, color: Number(emp.cancelled_orders) > 0 ? T.red : T.textDim }}>
                    {fmt(emp.cancelled_orders)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {employees.length === 0 && (
          <div style={{ padding: 60, textAlign: 'center', color: T.textDim }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div>No employee data for this period</div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 4: PERFORMANCE MATRIX
// ═══════════════════════════════════════════════════════════════════════════════
function PerformanceMatrix() {
  useT();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [from,    setFrom]    = useState(nDaysAgo(6));
  const [to,      setTo]      = useState(today());

  const load = useCallback(() => {
    setLoading(true);
    getPerformanceReport({ from, to })
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load performance data'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const fmtMin = (v) => {
    if (v === null || v === undefined) return '—';
    const m = Math.round(v);
    return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
  };

  const STAGES = [
    { key: 'avg_pending_min',  label: 'Order → Kitchen',   icon: '📲', desc: 'Time from order placed to kitchen start',      color: T.blue   },
    { key: 'avg_cooking_min',  label: 'Cooking Time',      icon: '👨‍🍳', desc: 'Time from kitchen start to food ready',         color: T.accent },
    { key: 'avg_delivery_min', label: 'Ready → Served',    icon: '🍽', desc: 'Time from food ready to table delivery',        color: T.green  },
    { key: 'avg_billing_min',  label: 'Served → Paid',     icon: '💳', desc: 'Time from served to payment collected',         color: T.purple },
    { key: 'avg_total_min',    label: 'Total Turnaround',  icon: '⏱', desc: 'End-to-end time from order to served/paid',     color: T.red    },
  ];

  const maxVal = data ? Math.max(...STAGES.map(s => data[s.key] || 0), 1) : 1;

  const handlePrint = () => {
    if (!data) return;
    const stageRows = STAGES.map(s => [s.icon+' '+s.label, s.desc, fmtMin(data[s.key])]);
    const trendRows = (data.daily_trend||[]).map(r => [r.date, r.orders, fmtMin(r.avg_total_min)]);
    printHTML(`Performance Matrix — ${from} to ${to}`, `
      <h1>Performance Matrix Report</h1>
      <div class="meta">Period: ${from} to ${to} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-PK')}</div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-v">${data.total_completed}</div><div class="kpi-l">Completed Orders</div></div>
        ${STAGES.map(s=>`<div class="kpi"><div class="kpi-v">${fmtMin(data[s.key])}</div><div class="kpi-l">${s.label}</div></div>`).join('')}
      </div>
      <h2>Process Stage Breakdown</h2>
      <table><thead><tr><th>Stage</th><th>Description</th><th class="right">Avg Time</th></tr></thead><tbody>
        ${stageRows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td class="right"><b>${r[2]}</b></td></tr>`).join('')}
      </tbody></table>
      ${trendRows.length ? `
      <h2>Daily Performance Trend</h2>
      <table><thead><tr><th>Date</th><th class="right">Orders</th><th class="right">Avg Turnaround</th></tr></thead><tbody>
        ${trendRows.map(r=>`<tr><td>${r[0]}</td><td class="right">${r[1]}</td><td class="right">${r[2]}</td></tr>`).join('')}
      </tbody></table>` : ''}
    `);
  };

  const handleExport = () => {
    if (!data) return;
    downloadExcel(`Performance_Matrix_${from}_${to}`, [
      { title: 'Stage Metrics', headers: ['Stage','Description','Avg Time (min)'], rows: STAGES.map(s => [s.label, s.desc, data[s.key] != null ? Number(data[s.key]).toFixed(1) : '']) },
      { title: 'Daily Trend', headers: ['Date','Orders','Avg Turnaround (min)'], rows: (data.daily_trend||[]).map(r=>[r.date, r.orders, r.avg_total_min!=null?Number(r.avg_total_min).toFixed(1):'']) },
    ]);
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ flex: 1 }}><DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} /></div>
        {data && <>
          <button onClick={handlePrint}  style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily:"'Inter',sans-serif", whiteSpace: 'nowrap' }}>🖨 Print PDF</button>
          <button onClick={handleExport} style={{ background: T.accent, border: 'none', color: '#000', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily:"'Inter',sans-serif", whiteSpace: 'nowrap' }}>📥 Excel</button>
        </>}
      </div>

      {loading ? <Spinner /> : !data ? null : (
        <>
          {/* Summary stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12, marginBottom: 28 }}>
            <Card style={{ textAlign: 'center', padding: '16px 12px' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: T.accent, fontFamily: 'monospace' }}>{data.total_completed}</div>
              <div style={{ fontSize: 11, color: T.textMid, marginTop: 4 }}>Completed Orders</div>
            </Card>
            {STAGES.map(s => (
              <Card key={s.key} style={{ textAlign: 'center', padding: '16px 12px' }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{fmtMin(data[s.key])}</div>
                <div style={{ fontSize: 11, color: T.textMid, marginTop: 4 }}>{s.label}</div>
              </Card>
            ))}
          </div>

          {/* Stage breakdown bars */}
          <Card style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 20 }}>⏱ Process Stage Breakdown</div>
            {STAGES.map(s => (
              <div key={s.key} style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 16, marginRight: 8 }}>{s.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{s.label}</span>
                    <span style={{ fontSize: 11, color: T.textDim, marginLeft: 10 }}>{s.desc}</span>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 800, color: s.color, fontFamily: 'monospace' }}>{fmtMin(data[s.key])}</span>
                </div>
                <div style={{ height: 8, background: T.border, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4, transition: 'width 0.6s',
                    background: s.color,
                    width: data[s.key] ? `${Math.min(100, (data[s.key] / maxVal) * 100)}%` : '0%',
                  }} />
                </div>
              </div>
            ))}
          </Card>

          {/* Daily trend table */}
          {data.daily_trend?.length > 0 && (
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 16 }}>📅 Daily Performance Trend</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                      {['Date','Orders','Avg Turnaround'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: T.textMid, fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily_trend.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: '10px 12px', color: T.text, fontWeight: 600 }}>{row.date}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: T.accent, fontWeight: 700 }}>{row.orders}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, color: T.text }}>{fmtMin(row.avg_total_min)}</span>
                            <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 3, minWidth: 60 }}>
                              <div style={{ height: '100%', borderRadius: 3, background: T.blue, width: `${Math.min(100, ((row.avg_total_min || 0) / 120) * 100)}%` }} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {data.total_completed === 0 && (
            <div style={{ textAlign: 'center', padding: 60, color: T.textDim }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>⏱</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.textMid }}>No completed orders in this period</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Data appears once orders are marked served or paid</div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN REPORTS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function Reports() {
  useT();
  const [tab, setTab] = useState('sales');

  const tabStyle = (t) => ({
    padding: '9px 20px', borderRadius: 8, cursor: 'pointer',
    fontSize: 13, fontWeight: tab === t ? 700 : 500,
    background: tab === t ? T.accent : 'transparent',
    color:      tab === t ? '#000' : T.textMid,
    border: `1px solid ${tab === t ? T.accent : T.border}`,
    fontFamily: "'Inter',sans-serif",
  });

  return (
    <div>
      <PageHeader
        title="📊 Reports & Analytics"
        subtitle="Sales performance, menu insights and employee analytics"
      />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button style={tabStyle('sales')}       onClick={() => setTab('sales')}>💰 Sales Report</button>
        <button style={tabStyle('menu')}        onClick={() => setTab('menu')}>🍽 Menu Performance</button>
        <button style={tabStyle('employee')}    onClick={() => setTab('employee')}>👥 Employee Performance</button>
        <button style={tabStyle('performance')} onClick={() => setTab('performance')}>⏱ Performance Matrix</button>
      </div>

      {tab === 'sales'       && <SalesReport />}
      {tab === 'menu'        && <MenuReport />}
      {tab === 'employee'    && <EmployeeReport />}
      {tab === 'performance' && <PerformanceMatrix />}
    </div>
  );
}
