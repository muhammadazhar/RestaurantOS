import React, { useEffect, useState, useCallback } from 'react';
import { getShiftSalesReport } from '../../services/api';
import { Card, StatCard, Spinner, PageHeader, useT } from '../shared/UI';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt    = (n, dec = 0) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const fmtPKR = (n) => `PKR ${fmt(n)}`;
const today      = () => new Date().toISOString().slice(0, 10);
const nDaysAgo   = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const yearStart  = () => `${new Date().getFullYear()}-01-01`;

const PERIOD_PRESETS = [
  { label: 'Today',        from: today(),       to: today() },
  { label: 'Yesterday',    from: nDaysAgo(1),   to: nDaysAgo(1) },
  { label: 'Last 7 Days',  from: nDaysAgo(6),   to: today() },
  { label: 'Last 30 Days', from: nDaysAgo(29),  to: today() },
  { label: 'This Month',   from: monthStart(),  to: today() },
  { label: 'This Year',    from: yearStart(),   to: today() },
];

const ORDER_TYPES = [
  { value: '',         label: 'All Types' },
  { value: 'dine_in',  label: 'Dine In' },
  { value: 'takeaway', label: 'Takeaway' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'online',   label: 'Online' },
];

const SORT_OPTS = [
  { value: 'date_desc',    label: 'Date (Newest)' },
  { value: 'date_asc',     label: 'Date (Oldest)' },
  { value: 'revenue_desc', label: 'Revenue (High→Low)' },
  { value: 'revenue_asc',  label: 'Revenue (Low→High)' },
  { value: 'orders_desc',  label: 'Orders (High→Low)' },
  { value: 'employee',     label: 'Employee (A→Z)' },
];

const STATUS_COLOR = {
  completed:  '#27AE60',
  in_process: '#F39C12',
  scheduled:  '#3498DB',
  absent:     '#E74C3C',
};

// ─── Print utility ────────────────────────────────────────────────────────────
function printHTML(title, bodyHtml) {
  const w = window.open('', '_blank', 'width=1100,height=820');
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;padding:28px 32px;color:#111}
    h1{font-size:20px;font-weight:bold;margin-bottom:4px}
    h2{font-size:13px;font-weight:bold;margin:20px 0 8px;padding-bottom:4px;border-bottom:2px solid #ccc}
    .meta{font-size:10px;color:#666;margin-bottom:18px}
    .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
    .kpi{border:1px solid #ddd;border-radius:6px;padding:10px 12px;background:#f9f9f9}
    .kpi-v{font-size:16px;font-weight:bold;margin-bottom:2px}
    .kpi-l{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.5px}
    table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:10px}
    th{background:#f0f0f0;padding:6px 8px;text-align:left;font-size:9px;text-transform:uppercase;
       letter-spacing:.5px;border-bottom:2px solid #ccc;white-space:nowrap}
    td{padding:5px 8px;border-bottom:1px solid #eee;vertical-align:top}
    tr:nth-child(even) td{background:#fafafa}
    .right{text-align:right} .center{text-align:center}
    .badge{display:inline-block;padding:1px 6px;border-radius:10px;font-size:9px;font-weight:bold}
    @media print{body{padding:0 8px}.no-print{display:none}}
  </style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ─── Excel utility ────────────────────────────────────────────────────────────
function downloadExcel(filename, sections) {
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

// ─── Select helper ────────────────────────────────────────────────────────────
function Sel({ value, onChange, children, style }) {
  const T = useT();
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      background: T.card, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: '6px 10px', color: T.text, fontSize: 12,
      fontFamily: "'Syne',sans-serif", outline: 'none', cursor: 'pointer', ...style,
    }}>
      {children}
    </select>
  );
}

// ─── Date Range Picker ────────────────────────────────────────────────────────
function DateRangePicker({ from, to, onChange }) {
  const T = useT();
  const [active, setActive] = useState('This Month');
  const apply = (p) => { setActive(p.label); onChange(p.from, p.to); };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {PERIOD_PRESETS.map(p => (
        <button key={p.label} onClick={() => apply(p)} style={{
          background: active === p.label ? T.accent : T.card,
          color:      active === p.label ? '#000' : T.textMid,
          border: `1px solid ${active === p.label ? T.accent : T.border}`,
          borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600,
          cursor: 'pointer', fontFamily: "'Syne',sans-serif",
        }}>{p.label}</button>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 4 }}>
        <input type="date" value={from} onChange={e => { setActive('Custom'); onChange(e.target.value, to); }}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', color: T.text, fontSize: 12, fontFamily: "'Syne',sans-serif", outline: 'none' }} />
        <span style={{ color: T.textDim, fontSize: 12 }}>→</span>
        <input type="date" value={to} onChange={e => { setActive('Custom'); onChange(from, e.target.value); }}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', color: T.text, fontSize: 12, fontFamily: "'Syne',sans-serif", outline: 'none' }} />
      </div>
    </div>
  );
}

// ─── Sort rows ────────────────────────────────────────────────────────────────
function sortShifts(shifts, sortBy) {
  const s = [...shifts];
  switch (sortBy) {
    case 'date_asc':     return s.sort((a, b) => String(a.shift_date).localeCompare(String(b.shift_date)));
    case 'date_desc':    return s.sort((a, b) => String(b.shift_date).localeCompare(String(a.shift_date)));
    case 'revenue_desc': return s.sort((a, b) => Number(b.revenue) - Number(a.revenue));
    case 'revenue_asc':  return s.sort((a, b) => Number(a.revenue) - Number(b.revenue));
    case 'orders_desc':  return s.sort((a, b) => Number(b.order_count) - Number(a.order_count));
    case 'employee':     return s.sort((a, b) => (a.employee_name || '').localeCompare(b.employee_name || ''));
    default:             return s;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ShiftSalesReport() {
  const T = useT();
  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [from,       setFrom]       = useState(monthStart());
  const [to,         setTo]         = useState(today());
  const [empFilter,  setEmpFilter]  = useState('');
  const [shiftFilter,setShiftFilter]= useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sortBy,     setSortBy]     = useState('date_desc');
  const [expanded,   setExpanded]   = useState({});

  const load = useCallback(() => {
    setLoading(true);
    const params = { from, to };
    if (empFilter)   params.employee_id = empFilter;
    if (shiftFilter) params.shift_name  = shiftFilter;
    if (typeFilter)  params.order_type  = typeFilter;
    getShiftSalesReport(params)
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load shift sales report'))
      .finally(() => setLoading(false));
  }, [from, to, empFilter, shiftFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  // ── Export handlers ──────────────────────────────────────────────────────────
  const handlePrint = () => {
    if (!data) return;
    const s = data.summary;
    const shifts = sortShifts(data.shifts || [], sortBy);
    const shiftRows = shifts.map(sh => `
      <tr>
        <td>${String(sh.shift_date || '').slice(0, 10)}</td>
        <td>${sh.employee_name || '—'}</td>
        <td>${sh.role_name || '—'}</td>
        <td>${sh.shift_name || '—'}</td>
        <td>${sh.start_time || ''} – ${sh.end_time || ''}</td>
        <td style="background:${STATUS_COLOR[sh.shift_status] || '#999'}22;color:${STATUS_COLOR[sh.shift_status] || '#999'};font-weight:bold" class="center">${sh.shift_status || '—'}</td>
        <td class="right">${fmt(sh.order_count)}</td>
        <td class="right">${fmt(sh.cancelled_count)}</td>
        <td class="right">${fmtPKR(sh.revenue)}</td>
        <td class="right">${fmtPKR(sh.avg_order_value)}</td>
        <td class="right">${fmt(sh.guest_count)}</td>
        <td class="right">${fmtPKR(sh.discount)}</td>
        <td class="right">${fmtPKR(sh.tax)}</td>
      </tr>`).join('');

    printHTML(`Shift Sales Report — ${from} to ${to}`, `
      <h1>Shift Sales Report</h1>
      <div class="meta">Period: ${from} to ${to}${empFilter ? ` &nbsp;·&nbsp; Employee filtered` : ''}${shiftFilter ? ` &nbsp;·&nbsp; Shift: ${shiftFilter}` : ''}${typeFilter ? ` &nbsp;·&nbsp; Type: ${typeFilter}` : ''} &nbsp;·&nbsp; Generated: ${new Date().toLocaleString('en-PK')}</div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-v">${fmt(s.total_shifts)}</div><div class="kpi-l">Total Shifts</div></div>
        <div class="kpi"><div class="kpi-v">${fmt(s.total_orders)}</div><div class="kpi-l">Total Orders</div></div>
        <div class="kpi"><div class="kpi-v">PKR ${fmt(s.total_revenue)}</div><div class="kpi-l">Total Revenue</div></div>
        <div class="kpi"><div class="kpi-v">PKR ${fmt(s.avg_revenue_per_shift)}</div><div class="kpi-l">Avg Revenue / Shift</div></div>
        <div class="kpi"><div class="kpi-v">${fmt(s.total_guests)}</div><div class="kpi-l">Total Guests</div></div>
      </div>
      <h2>Shift-wise Sales Detail</h2>
      <table>
        <thead><tr>
          <th>Date</th><th>Employee</th><th>Role</th><th>Shift</th><th>Time</th><th class="center">Status</th>
          <th class="right">Orders</th><th class="right">Cancelled</th>
          <th class="right">Revenue</th><th class="right">Avg Order</th>
          <th class="right">Guests</th><th class="right">Discount</th><th class="right">Tax</th>
        </tr></thead>
        <tbody>${shiftRows}</tbody>
      </table>
    `);
  };

  const handleExcel = () => {
    if (!data) return;
    const s = data.summary;
    const shifts = sortShifts(data.shifts || [], sortBy);
    downloadExcel(`Shift_Sales_Report_${from}_${to}`, [
      { title: 'Summary', headers: ['Metric', 'Value'], rows: [
        ['Total Shifts',          fmt(s.total_shifts)],
        ['Total Orders',          fmt(s.total_orders)],
        ['Total Revenue (PKR)',   Number(s.total_revenue).toFixed(2)],
        ['Avg Revenue / Shift',   Number(s.avg_revenue_per_shift).toFixed(2)],
        ['Avg Orders / Shift',    Number(s.avg_orders_per_shift).toFixed(1)],
        ['Total Guests',          fmt(s.total_guests)],
        ['Cancelled Orders',      fmt(s.cancelled)],
      ]},
      { title: 'Shift-wise Sales', headers: [
          'Date', 'Employee', 'Role', 'Shift Name', 'Start', 'End', 'Status',
          'Orders', 'Cancelled', 'Revenue (PKR)', 'Subtotal', 'Tax', 'Discount',
          'Avg Order (PKR)', 'Guests',
          'Dine-In Orders', 'Dine-In Revenue',
          'Takeaway Orders', 'Takeaway Revenue',
          'Delivery Orders', 'Delivery Revenue',
          'Online Orders', 'Online Revenue',
          'Cash Orders', 'Cash Revenue',
          'Card Orders', 'Card Revenue',
        ],
        rows: shifts.map(sh => [
          String(sh.shift_date || '').slice(0, 10),
          sh.employee_name || '',
          sh.role_name || '',
          sh.shift_name || '',
          sh.start_time || '',
          sh.end_time || '',
          sh.shift_status || '',
          Number(sh.order_count),
          Number(sh.cancelled_count),
          Number(sh.revenue).toFixed(2),
          Number(sh.subtotal).toFixed(2),
          Number(sh.tax).toFixed(2),
          Number(sh.discount).toFixed(2),
          Number(sh.avg_order_value).toFixed(2),
          Number(sh.guest_count),
          Number(sh.dine_in_orders),  Number(sh.dine_in_revenue).toFixed(2),
          Number(sh.takeaway_orders), Number(sh.takeaway_revenue).toFixed(2),
          Number(sh.delivery_orders), Number(sh.delivery_revenue).toFixed(2),
          Number(sh.online_orders),   Number(sh.online_revenue).toFixed(2),
          Number(sh.cash_orders),     Number(sh.cash_revenue).toFixed(2),
          Number(sh.card_orders),     Number(sh.card_revenue).toFixed(2),
        ]),
      },
    ]);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  const selStyle = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', color: T.text, fontSize: 12, fontFamily: "'Syne',sans-serif", outline: 'none', cursor: 'pointer' };

  const shifts = sortShifts(data?.shifts || [], sortBy);
  const s = data?.summary || {};

  return (
    <div>
      <PageHeader title="Shift Sales Report" sub="Sales performance broken down by employee shift" />

      {/* ── Filters ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Employee filter */}
          <Sel value={empFilter} onChange={setEmpFilter}>
            <option value="">All Employees</option>
            {(data?.employees || []).map(e => (
              <option key={e.id} value={e.id}>{e.full_name}{e.role_name ? ` (${e.role_name})` : ''}</option>
            ))}
          </Sel>

          {/* Shift name filter */}
          <Sel value={shiftFilter} onChange={setShiftFilter}>
            <option value="">All Shifts</option>
            {(data?.shiftNames || []).map(n => <option key={n} value={n}>{n}</option>)}
          </Sel>

          {/* Order type filter */}
          <Sel value={typeFilter} onChange={setTypeFilter}>
            {ORDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Sel>

          {/* Sort */}
          <Sel value={sortBy} onChange={setSortBy}>
            {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Sel>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {data && <>
              <button onClick={handlePrint} style={{ ...selStyle, whiteSpace: 'nowrap' }}>🖨 Print PDF</button>
              <button onClick={handleExcel} style={{ background: T.accent, border: 'none', color: '#000', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Syne',sans-serif", whiteSpace: 'nowrap' }}>📥 Excel</button>
            </>}
          </div>
        </div>
      </Card>

      {loading ? <Spinner /> : (
        <>
          {/* ── KPI Cards ── */}
          <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
            <StatCard label="Total Shifts"        value={fmt(s.total_shifts)}          color={T.accent} icon="📋" />
            <StatCard label="Total Orders"        value={fmt(s.total_orders)}          color={T.blue}   icon="🧾" sub={`${fmt(s.cancelled)} cancelled`} />
            <StatCard label="Total Revenue"       value={fmtPKR(s.total_revenue)}      color={T.green}  icon="💰" />
            <StatCard label="Avg Revenue / Shift" value={fmtPKR(s.avg_revenue_per_shift)} color={T.purple} icon="📊" />
            <StatCard label="Total Guests"        value={fmt(s.total_guests)}          color={T.accent} icon="👥" sub={`${fmt(s.avg_orders_per_shift, 1)} orders/shift avg`} />
          </div>

          {/* ── Shifts Table ── */}
          <Card>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text, marginBottom: 16 }}>
              📋 Shift-wise Sales Detail
              <span style={{ fontWeight: 400, fontSize: 12, color: T.textDim, marginLeft: 10 }}>
                {shifts.length} shift{shifts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {shifts.length === 0 ? (
              <div style={{ textAlign: 'center', color: T.textDim, padding: 40 }}>No shifts found for this period</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: T.surface }}>
                      {['Date', 'Employee', 'Role', 'Shift', 'Time', 'Status', 'Orders', 'Revenue', 'Avg Order', 'Guests', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 12px', textAlign: i >= 6 && i <= 8 ? 'right' : 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px', color: T.textDim, borderBottom: `2px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {shifts.map((sh, idx) => {
                      const isExp = expanded[sh.shift_id];
                      const hasOrders = Number(sh.order_count) > 0;
                      const typeRows = [
                        { label: '🪑 Dine In',   orders: sh.dine_in_orders,  revenue: sh.dine_in_revenue },
                        { label: '🛍 Takeaway',  orders: sh.takeaway_orders, revenue: sh.takeaway_revenue },
                        { label: '🛵 Delivery',  orders: sh.delivery_orders, revenue: sh.delivery_revenue },
                        { label: '📲 Online',    orders: sh.online_orders,   revenue: sh.online_revenue },
                      ].filter(t => Number(t.orders) > 0);
                      const payRows = [
                        { label: '💵 Cash', orders: sh.cash_orders, revenue: sh.cash_revenue },
                        { label: '💳 Card', orders: sh.card_orders, revenue: sh.card_revenue },
                        { label: '🔄 Other', orders: sh.other_pay_orders, revenue: sh.other_pay_revenue },
                      ].filter(t => Number(t.orders) > 0);

                      const statusColor = STATUS_COLOR[sh.shift_status] || T.textDim;
                      return (
                        <React.Fragment key={sh.shift_id || idx}>
                          <tr style={{ borderBottom: `1px solid ${T.border}`, background: idx % 2 === 0 ? T.surface : 'transparent' }}
                            onClick={() => hasOrders && toggleExpand(sh.shift_id)}
                            title={hasOrders ? 'Click to expand order type breakdown' : ''}
                          >
                            <td style={{ padding: '10px 12px', color: T.text, whiteSpace: 'nowrap' }}>
                              {String(sh.shift_date || '').slice(0, 10)}
                            </td>
                            <td style={{ padding: '10px 12px', color: T.text, fontWeight: 600 }}>
                              {sh.employee_name || <span style={{ color: T.textDim }}>—</span>}
                            </td>
                            <td style={{ padding: '10px 12px', color: T.textMid, fontSize: 11 }}>
                              {sh.role_name || '—'}
                            </td>
                            <td style={{ padding: '10px 12px', color: T.text }}>
                              {sh.shift_name || <span style={{ color: T.textDim }}>—</span>}
                            </td>
                            <td style={{ padding: '10px 12px', color: T.textMid, fontSize: 11, whiteSpace: 'nowrap' }}>
                              {sh.start_time || '—'}{sh.end_time ? ` – ${sh.end_time}` : ''}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ background: `${statusColor}22`, color: statusColor, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: 'capitalize' }}>
                                {sh.shift_status || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: T.text }}>
                              {fmt(sh.order_count)}
                              {Number(sh.cancelled_count) > 0 && (
                                <span style={{ fontSize: 10, color: '#E74C3C', marginLeft: 4 }}>+{sh.cancelled_count}✗</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: T.green, fontFamily: 'monospace' }}>
                              {fmtPKR(sh.revenue)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: T.textMid, fontFamily: 'monospace' }}>
                              {fmtPKR(sh.avg_order_value)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: T.textMid }}>
                              {fmt(sh.guest_count)}
                            </td>
                            <td style={{ padding: '10px 12px', textAlign: 'center', color: T.textDim, fontSize: 12, cursor: hasOrders ? 'pointer' : 'default' }}>
                              {hasOrders ? (isExp ? '▲' : '▼') : ''}
                            </td>
                          </tr>

                          {/* ── Expanded breakdown ── */}
                          {isExp && (
                            <tr style={{ background: T.bg || T.surface }}>
                              <td colSpan={11} style={{ padding: '12px 24px 16px' }}>
                                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                                  {typeRows.length > 0 && (
                                    <div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>By Order Type</div>
                                      {typeRows.map((t, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 5 }}>
                                          <span style={{ fontSize: 12, color: T.textMid }}>{t.label}</span>
                                          <span style={{ fontSize: 12, color: T.text }}>{fmt(t.orders)} orders &nbsp; <b style={{ fontFamily: 'monospace', color: T.green }}>{fmtPKR(t.revenue)}</b></span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {payRows.length > 0 && (
                                    <div>
                                      <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>By Payment</div>
                                      {payRows.map((t, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 5 }}>
                                          <span style={{ fontSize: 12, color: T.textMid }}>{t.label}</span>
                                          <span style={{ fontSize: 12, color: T.text }}>{fmt(t.orders)} orders &nbsp; <b style={{ fontFamily: 'monospace', color: T.green }}>{fmtPKR(t.revenue)}</b></span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.textDim, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.5px' }}>Financials</div>
                                    {[
                                      ['Subtotal',  sh.subtotal],
                                      ['Discount',  `-${fmtPKR(sh.discount)}`],
                                      ['Tax',       sh.tax],
                                      ['Net Revenue', sh.revenue],
                                    ].map(([l, v]) => (
                                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, marginBottom: 5 }}>
                                        <span style={{ fontSize: 12, color: T.textMid }}>{l}</span>
                                        <b style={{ fontSize: 12, fontFamily: 'monospace', color: T.green }}>
                                          {typeof v === 'string' ? v : fmtPKR(v)}
                                        </b>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>

                  {/* ── Totals footer ── */}
                  {shifts.length > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${T.border}`, background: T.surface, fontWeight: 700 }}>
                        <td colSpan={6} style={{ padding: '10px 12px', color: T.textMid, fontSize: 11 }}>
                          TOTAL ({shifts.length} shifts)
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: T.text }}>{fmt(s.total_orders)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: T.green, fontFamily: 'monospace' }}>{fmtPKR(s.total_revenue)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: T.textMid, fontFamily: 'monospace' }}>{fmtPKR(s.avg_revenue_per_shift)}</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: T.textMid }}>{fmt(s.total_guests)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
