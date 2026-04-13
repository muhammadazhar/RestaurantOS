import React, { useState, useCallback } from 'react';
import { getTrialBalance, getBalanceSheet } from '../../services/api';
import { Card, Btn, Spinner, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt      = (n) => Number(n || 0).toLocaleString('en-PK');
const fmtPKR   = (n) => `PKR ${fmt(n)}`;
const today    = () => new Date().toISOString().slice(0, 10);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

const TYPE_LABEL = { revenue: 'Revenue', cogs: 'Cost of Goods Sold', expense: 'Expenses', asset: 'Assets', liability: 'Liabilities', equity: 'Equity' };
const TYPE_ORDER = ['asset', 'liability', 'equity', 'revenue', 'cogs', 'expense'];

// ─── Print / Export utilities (same pattern as other reports) ─────────────────
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
    .section-header td{background:#e8e8e8;font-weight:bold;text-transform:uppercase;font-size:10px;letter-spacing:0.5px;color:#555}
    .totals-row td{font-weight:bold;border-top:2px solid #ccc;background:#f5f5f5}
    .balance-row td{font-weight:bold;font-size:13px;background:#f0f8f0;color:#1a7a1a}
    @media print{body{padding:0 8px}}
  </style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

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
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Trial Balance Report ─────────────────────────────────────────────────────
function TrialBalanceReport() {
  useT();
  const [from,    setFrom]    = useState(monthStart());
  const [to,      setTo]      = useState(today());
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTrialBalance({ from, to });
      setData(res.data);
    } catch { toast.error('Failed to load trial balance'); }
    finally { setLoading(false); }
  }, [from, to]);

  const groups = data ? TYPE_ORDER.reduce((acc, t) => {
    acc[t] = (data.rows || []).filter(r => r.type === t);
    return acc;
  }, {}) : {};

  const printPDF = () => {
    if (!data) return;
    const typeColors = { asset: '#2980b9', liability: '#7f8c8d', equity: '#8e44ad', revenue: '#27ae60', cogs: '#e67e22', expense: '#c0392b' };
    let rows = '';
    for (const type of TYPE_ORDER) {
      const accs = groups[type] || [];
      if (!accs.length) continue;
      rows += `<tr class="section-header"><td colspan="5">${TYPE_LABEL[type]}</td></tr>`;
      accs.forEach(r => {
        rows += `<tr>
          <td style="font-family:monospace;color:#666">${r.code}</td>
          <td>${r.name}</td>
          <td style="text-transform:uppercase;font-size:10px;color:${typeColors[r.type]}">${r.type}</td>
          <td class="right">${Number(r.total_debit) > 0 ? Number(r.total_debit).toLocaleString() : '—'}</td>
          <td class="right">${Number(r.total_credit) > 0 ? Number(r.total_credit).toLocaleString() : '—'}</td>
        </tr>`;
      });
    }
    const body = `
      <h1>Trial Balance</h1>
      <div class="meta">Period: ${from} to ${to} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString()}</div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-v">PKR ${fmt(data.totalDebit)}</div><div class="kpi-l">Total Debits</div></div>
        <div class="kpi"><div class="kpi-v">PKR ${fmt(data.totalCredit)}</div><div class="kpi-l">Total Credits</div></div>
        <div class="kpi"><div class="kpi-v">${data.balanced ? '✓ Balanced' : '✗ Not Balanced'}</div><div class="kpi-l">Balance Status</div></div>
        <div class="kpi"><div class="kpi-v">${(data.rows || []).length}</div><div class="kpi-l">Accounts</div></div>
      </div>
      <table>
        <thead><tr><th>Code</th><th>Account Name</th><th>Type</th><th class="right">Debit (PKR)</th><th class="right">Credit (PKR)</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="totals-row">
            <td colspan="3">TOTALS</td>
            <td class="right">PKR ${fmt(data.totalDebit)}</td>
            <td class="right">PKR ${fmt(data.totalCredit)}</td>
          </tr>
        </tbody>
      </table>`;
    printHTML('Trial Balance', body);
  };

  const exportExcel = () => {
    if (!data) return;
    const rows = [];
    for (const type of TYPE_ORDER) {
      const accs = groups[type] || [];
      if (!accs.length) continue;
      rows.push([`--- ${TYPE_LABEL[type]} ---`, '', '', '', '']);
      accs.forEach(r => rows.push([r.code, r.name, r.type, Number(r.total_debit) || 0, Number(r.total_credit) || 0]));
    }
    rows.push(['TOTALS', '', '', Number(data.totalDebit), Number(data.totalCredit)]);
    downloadExcel(`trial-balance-${from}-to-${to}.xls`, [{
      title: `Trial Balance — ${from} to ${to}`,
      headers: ['Code', 'Account Name', 'Type', 'Total Debit (PKR)', 'Total Credit (PKR)'],
      rows,
    }]);
  };

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: T.textMid }}>Period:</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
        <span style={{ color: T.textDim, fontSize: 12 }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
        <Btn onClick={load} variant="ghost" size="sm">Refresh</Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={printPDF}  disabled={!data}>🖨️ Print PDF</Btn>
          <Btn variant="ghost" size="sm" onClick={exportExcel} disabled={!data}>📊 Export Excel</Btn>
        </div>
      </div>

      {loading ? <Spinner /> : data ? (
        <>
          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Debits',   value: fmtPKR(data.totalDebit),   color: T.red },
              { label: 'Total Credits',  value: fmtPKR(data.totalCredit),  color: T.green },
              { label: 'Balance Status', value: data.balanced ? 'Balanced ✓' : 'Not Balanced ✗', color: data.balanced ? T.green : T.red },
            ].map(k => (
              <Card key={k.label} style={{ textAlign: 'center', padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: k.color, fontFamily: 'monospace' }}>{k.value}</div>
              </Card>
            ))}
          </div>

          {/* Table */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  {['Code', 'Account Name', 'Type', 'Total Debit', 'Total Credit', 'Net Balance'].map(h => (
                    <th key={h} style={{ padding: '11px 16px', textAlign: ['Total Debit','Total Credit','Net Balance'].includes(h) ? 'right' : 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TYPE_ORDER.map(type => {
                  const accs = groups[type] || [];
                  if (!accs.length) return null;
                  return (
                    <React.Fragment key={type}>
                      <tr>
                        <td colSpan={6} style={{ padding: '8px 16px', background: T.surface, fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', borderTop: `1px solid ${T.border}` }}>
                          {TYPE_LABEL[type]}
                        </td>
                      </tr>
                      {accs.map((r, i) => (
                        <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                          <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, color: T.textMid, width: 60 }}>{r.code}</td>
                          <td style={{ padding: '10px 16px', fontSize: 13, color: T.text }}>{r.name}</td>
                          <td style={{ padding: '10px 16px' }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: T.textMid, background: T.surface, padding: '2px 6px', borderRadius: 5, textTransform: 'uppercase' }}>{r.type}</span>
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: Number(r.total_debit) > 0 ? T.red : T.textDim }}>
                            {Number(r.total_debit) > 0 ? Number(r.total_debit).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: Number(r.total_credit) > 0 ? T.green : T.textDim }}>
                            {Number(r.total_credit) > 0 ? Number(r.total_credit).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: Number(r.net_balance) >= 0 ? T.green : T.red }}>
                            {Number(r.net_balance) >= 0 ? '+' : ''}PKR {Number(r.net_balance).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${T.borderLight}`, background: T.surface }}>
                  <td colSpan={3} style={{ padding: '12px 16px', fontSize: 13, fontWeight: 800, color: T.text }}>TOTALS</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.red }}>PKR {fmt(data.totalDebit)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.green }}>PKR {fmt(data.totalCredit)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: data.balanced ? T.green : T.red }}>
                    {data.balanced ? '✓ Balanced' : `Diff: PKR ${Math.abs(data.totalDebit - data.totalCredit).toLocaleString()}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </Card>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚖️</div>
          <div style={{ fontSize: 14 }}>Select a period and click Refresh to view the trial balance.</div>
        </div>
      )}
    </div>
  );
}

// ─── Balance Sheet Report ─────────────────────────────────────────────────────
function BalanceSheetReport() {
  useT();
  const [asOf,    setAsOf]    = useState(today());
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBalanceSheet({ as_of: asOf });
      setData(res.data);
    } catch { toast.error('Failed to load balance sheet'); }
    finally { setLoading(false); }
  }, [asOf]);

  const totalLiabEquity = data ? Number(data.totalLiabilities) + Number(data.totalEquity) + Number(data.netIncome) : 0;
  const balanced = data ? Math.abs(Number(data.totalAssets) - totalLiabEquity) < 1 : false;

  const printPDF = () => {
    if (!data) return;
    const assetRows = data.assets.map(a => `<tr><td style="font-family:monospace;color:#666;padding-left:20px">${a.code}</td><td>${a.name}</td><td class="right">PKR ${fmt(a.balance)}</td></tr>`).join('');
    const liabRows  = data.liabilities.map(a => `<tr><td style="font-family:monospace;color:#666;padding-left:20px">${a.code}</td><td>${a.name}</td><td class="right">PKR ${fmt(a.balance)}</td></tr>`).join('');
    const equityRows = data.equity.map(a => `<tr><td style="font-family:monospace;color:#666;padding-left:20px">${a.code}</td><td>${a.name}</td><td class="right">PKR ${fmt(a.balance)}</td></tr>`).join('');
    const body = `
      <h1>Balance Sheet</h1>
      <div class="meta">As of: ${asOf} &nbsp;|&nbsp; Generated: ${new Date().toLocaleDateString()}</div>
      <div class="kpis">
        <div class="kpi"><div class="kpi-v">PKR ${fmt(data.totalAssets)}</div><div class="kpi-l">Total Assets</div></div>
        <div class="kpi"><div class="kpi-v">PKR ${fmt(data.totalLiabilities)}</div><div class="kpi-l">Total Liabilities</div></div>
        <div class="kpi"><div class="kpi-v">PKR ${fmt(data.totalEquity)}</div><div class="kpi-l">Total Equity</div></div>
        <div class="kpi"><div class="kpi-v" style="color:${Number(data.netIncome)>=0?'#27ae60':'#c0392b'}">PKR ${fmt(data.netIncome)}</div><div class="kpi-l">Net Income</div></div>
      </div>
      <table>
        <thead><tr><th>Code</th><th>Account</th><th class="right">Balance (PKR)</th></tr></thead>
        <tbody>
          <tr class="section-header"><td colspan="3">ASSETS</td></tr>
          ${assetRows}
          <tr class="totals-row"><td colspan="2">Total Assets</td><td class="right">PKR ${fmt(data.totalAssets)}</td></tr>
          <tr class="section-header"><td colspan="3">LIABILITIES</td></tr>
          ${liabRows}
          <tr class="totals-row"><td colspan="2">Total Liabilities</td><td class="right">PKR ${fmt(data.totalLiabilities)}</td></tr>
          <tr class="section-header"><td colspan="3">EQUITY</td></tr>
          ${equityRows}
          <tr><td colspan="2" style="padding-left:20px">Net Income (Retained Earnings)</td><td class="right" style="color:${Number(data.netIncome)>=0?'#27ae60':'#c0392b'}">PKR ${fmt(data.netIncome)}</td></tr>
          <tr class="totals-row"><td colspan="2">Total Equity + Net Income</td><td class="right">PKR ${fmt(Number(data.totalEquity) + Number(data.netIncome))}</td></tr>
          <tr class="balance-row"><td colspan="2">TOTAL LIABILITIES + EQUITY</td><td class="right">PKR ${fmt(totalLiabEquity)}</td></tr>
        </tbody>
      </table>
      <p style="font-size:11px;color:${balanced?'#27ae60':'#c0392b'};margin-top:8px;font-weight:bold">
        Assets (PKR ${fmt(data.totalAssets)}) ${balanced ? '=' : '≠'} Liabilities + Equity (PKR ${fmt(totalLiabEquity)}) — ${balanced ? 'BALANCED' : 'NOT BALANCED'}
      </p>`;
    printHTML('Balance Sheet', body);
  };

  const exportExcel = () => {
    if (!data) return;
    const rows = [
      ['--- ASSETS ---', ''], ...data.assets.map(a => [a.code, a.name, Number(a.balance)]),
      ['Total Assets', '', Number(data.totalAssets)],
      [''],
      ['--- LIABILITIES ---', ''], ...data.liabilities.map(a => [a.code, a.name, Number(a.balance)]),
      ['Total Liabilities', '', Number(data.totalLiabilities)],
      [''],
      ['--- EQUITY ---', ''], ...data.equity.map(a => [a.code, a.name, Number(a.balance)]),
      ['Net Income (Retained Earnings)', '', Number(data.netIncome)],
      ['Total Equity + Net Income', '', Number(data.totalEquity) + Number(data.netIncome)],
      [''],
      ['TOTAL LIABILITIES + EQUITY', '', totalLiabEquity],
    ];
    downloadExcel(`balance-sheet-${asOf}.xls`, [{
      title: `Balance Sheet — As of ${asOf}`,
      headers: ['Code', 'Account', 'Balance (PKR)'],
      rows,
    }]);
  };

  const SectionTable = ({ title, accounts, total, accentColor }) => (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 16px', background: T.surface, borderRadius: '10px 10px 0 0', borderBottom: `2px solid ${accentColor}44` }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: 1, textTransform: 'uppercase' }}>{title}</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 800, color: accentColor, fontSize: 13 }}>{fmtPKR(total)}</span>
      </div>
      <Card style={{ padding: 0, borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {accounts.map((a, i) => (
              <tr key={a.id} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                <td style={{ padding: '9px 16px', fontFamily: 'monospace', fontSize: 11, color: T.textMid, width: 56 }}>{a.code}</td>
                <td style={{ padding: '9px 16px', fontSize: 13, color: T.text }}>{a.name}</td>
                <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: Number(a.balance) >= 0 ? T.green : T.red }}>
                  {fmtPKR(a.balance)}
                </td>
              </tr>
            ))}
            {!accounts.length && (
              <tr><td colSpan={3} style={{ padding: '14px 16px', textAlign: 'center', color: T.textDim, fontSize: 12 }}>No accounts</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: T.textMid }}>As of:</span>
        <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
        <Btn onClick={load} variant="ghost" size="sm">Refresh</Btn>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={printPDF}   disabled={!data}>🖨️ Print PDF</Btn>
          <Btn variant="ghost" size="sm" onClick={exportExcel} disabled={!data}>📊 Export Excel</Btn>
        </div>
      </div>

      {loading ? <Spinner /> : data ? (
        <>
          {/* KPI Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Assets',      value: fmtPKR(data.totalAssets),      color: T.blue },
              { label: 'Total Liabilities', value: fmtPKR(data.totalLiabilities), color: T.red },
              { label: 'Total Equity',      value: fmtPKR(data.totalEquity),      color: '#9b59b6' },
              { label: 'Net Income',        value: fmtPKR(data.netIncome),        color: Number(data.netIncome) >= 0 ? T.green : T.red },
            ].map(k => (
              <Card key={k.label} style={{ textAlign: 'center', padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: k.color, fontFamily: 'monospace' }}>{k.value}</div>
              </Card>
            ))}
          </div>

          {/* Two-column layout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <SectionTable title="Assets" accounts={data.assets} total={data.totalAssets} accentColor={T.blue} />
            </div>
            <div>
              <SectionTable title="Liabilities" accounts={data.liabilities} total={data.totalLiabilities} accentColor={T.red} />
              <SectionTable title="Equity" accounts={data.equity} total={data.totalEquity} accentColor={'#9b59b6'} />
              {/* Net Income row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: Number(data.netIncome) >= 0 ? T.greenDim : T.redDim, borderRadius: 10, border: `1px solid ${Number(data.netIncome) >= 0 ? T.green : T.red}44`, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Net Income (Retained Earnings)</div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                    Rev {fmtPKR(data.revenue)} − COGS {fmtPKR(data.cogs)} − Exp {fmtPKR(data.expenses)}
                  </div>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: Number(data.netIncome) >= 0 ? T.green : T.red }}>
                  {Number(data.netIncome) >= 0 ? '+' : ''}{fmtPKR(data.netIncome)}
                </span>
              </div>
            </div>
          </div>

          {/* Balance check */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: balanced ? T.greenDim : T.redDim, borderRadius: 12, border: `1px solid ${balanced ? T.green : T.red}44`, marginTop: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>
              Assets = Liabilities + Equity + Net Income
            </span>
            <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: balanced ? T.green : T.red }}>
              {fmtPKR(data.totalAssets)} {balanced ? '=' : '≠'} {fmtPKR(totalLiabEquity)} — {balanced ? 'BALANCED ✓' : 'NOT BALANCED ✗'}
            </span>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏦</div>
          <div style={{ fontSize: 14 }}>Select a date and click Refresh to view the balance sheet.</div>
        </div>
      )}
    </div>
  );
}

// ─── Main GLReports Page ──────────────────────────────────────────────────────
export default function GLReports() {
  useT();
  const [tab, setTab] = useState('trial_balance');

  const tabStyle = (t) => ({
    padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500,
    background: tab === t ? T.accent : 'transparent', color: tab === t ? '#000' : T.textMid,
    border: `1px solid ${tab === t ? T.accent : T.border}`, fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
  });

  return (
    <div>
      <PageHeader
        title="📋 GL Reports"
        subtitle="Trial Balance and Balance Sheet with PDF and Excel export"
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <button style={tabStyle('trial_balance')} onClick={() => setTab('trial_balance')}>Trial Balance</button>
        <button style={tabStyle('balance_sheet')} onClick={() => setTab('balance_sheet')}>Balance Sheet</button>
      </div>

      {tab === 'trial_balance' && <TrialBalanceReport />}
      {tab === 'balance_sheet' && <BalanceSheetReport />}
    </div>
  );
}
