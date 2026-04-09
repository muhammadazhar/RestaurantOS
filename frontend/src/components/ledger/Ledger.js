import React, { useEffect, useState, useCallback } from 'react';
import { getGLAccounts, getJournalEntries, createJournalEntry } from '../../services/api';
import { Card, Badge, Spinner, Btn, Modal, Input, Select, StatCard, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';
import API from '../../services/api';

// ─── Additional API calls ─────────────────────────────────────────────────────
const createGLAccount = (d) => API.post('/gl/accounts', d);

const today  = () => new Date().toISOString().slice(0, 10);
const fmt    = (n) => `PKR ${Number(n || 0).toLocaleString()}`;
const fmtDT  = (d) => new Date(d).toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' });

const TYPE_COLOR = { revenue: T.green, cogs: T.accent, expense: T.red, asset: T.blue, liability: T.textMid, equity: T.purple };

// ─── Entry templates ──────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    label: 'Daily Sales Revenue',
    icon:  '💰',
    description: 'Record end-of-day food & beverage sales',
    lines: (accounts) => {
      const cash    = accounts.find(a => a.code === '1001');
      const foodRev = accounts.find(a => a.code === '4001');
      const bevRev  = accounts.find(a => a.code === '4002');
      return [
        { account_id: cash?.id    || '', account_label: cash    ? `[${cash.code}] ${cash.name}`    : '', debit: '', credit: '' },
        { account_id: foodRev?.id || '', account_label: foodRev ? `[${foodRev.code}] ${foodRev.name}` : '', debit: '', credit: '' },
        { account_id: bevRev?.id  || '', account_label: bevRev  ? `[${bevRev.code}] ${bevRev.name}`  : '', debit: '', credit: '' },
      ];
    },
    hint: 'Dr: Cash on Hand  |  Cr: Food Revenue + Beverage Revenue',
  },
  {
    label: 'Food/Beverage Purchase',
    icon:  '🧾',
    description: 'Record stock purchase from supplier',
    lines: (accounts) => {
      const foodCost = accounts.find(a => a.code === '5001');
      const cash     = accounts.find(a => a.code === '1001');
      return [
        { account_id: foodCost?.id || '', account_label: foodCost ? `[${foodCost.code}] ${foodCost.name}` : '', debit: '', credit: '' },
        { account_id: cash?.id     || '', account_label: cash     ? `[${cash.code}] ${cash.name}`         : '', debit: '', credit: '' },
      ];
    },
    hint: 'Dr: Food Cost  |  Cr: Cash on Hand',
  },
  {
    label: 'Payroll / Staff Wages',
    icon:  '👥',
    description: 'Record salary & wage payments',
    lines: (accounts) => {
      const wages = accounts.find(a => a.code === '6001');
      const cash  = accounts.find(a => a.code === '1001');
      return [
        { account_id: wages?.id || '', account_label: wages ? `[${wages.code}] ${wages.name}` : '', debit: '', credit: '' },
        { account_id: cash?.id  || '', account_label: cash  ? `[${cash.code}] ${cash.name}`   : '', debit: '', credit: '' },
      ];
    },
    hint: 'Dr: Staff Wages  |  Cr: Cash / Bank',
  },
  {
    label: 'Rent & Utilities',
    icon:  '🏢',
    description: 'Record monthly rent or utility bills',
    lines: (accounts) => {
      const rent = accounts.find(a => a.code === '6002');
      const bank = accounts.find(a => a.code === '1002');
      return [
        { account_id: rent?.id || '', account_label: rent ? `[${rent.code}] ${rent.name}` : '', debit: '', credit: '' },
        { account_id: bank?.id || '', account_label: bank ? `[${bank.code}] ${bank.name}` : '', debit: '', credit: '' },
      ];
    },
    hint: 'Dr: Rent & Utilities  |  Cr: Bank Account',
  },
  {
    label: 'Cash to Bank Transfer',
    icon:  '🏦',
    description: 'Transfer cash from till to bank',
    lines: (accounts) => {
      const bank = accounts.find(a => a.code === '1002');
      const cash = accounts.find(a => a.code === '1001');
      return [
        { account_id: bank?.id || '', account_label: bank ? `[${bank.code}] ${bank.name}` : '', debit: '', credit: '' },
        { account_id: cash?.id || '', account_label: cash ? `[${cash.code}] ${cash.name}` : '', debit: '', credit: '' },
      ];
    },
    hint: 'Dr: Bank Account  |  Cr: Cash on Hand',
  },
  {
    label: 'General Expense',
    icon:  '📄',
    description: 'Record any miscellaneous expense',
    lines: (accounts) => {
      const supp = accounts.find(a => a.code === '6003');
      const cash = accounts.find(a => a.code === '1001');
      return [
        { account_id: supp?.id || '', account_label: supp ? `[${supp.code}] ${supp.name}` : '', debit: '', credit: '' },
        { account_id: cash?.id || '', account_label: cash ? `[${cash.code}] ${cash.name}` : '', debit: '', credit: '' },
      ];
    },
    hint: 'Dr: Expense Account  |  Cr: Cash / Bank',
  },
  {
    label: 'Blank Entry',
    icon:  '📝',
    description: 'Start from scratch with custom lines',
    lines: () => [
      { account_id: '', account_label: '', debit: '', credit: '' },
      { account_id: '', account_label: '', debit: '', credit: '' },
    ],
    hint: 'Add any accounts and amounts manually',
  },
];

// ─── New Journal Entry Modal ──────────────────────────────────────────────────
function NewEntryModal({ open, onClose, onSaved, accounts }) {
  const [step,        setStep]        = useState('template'); // 'template' | 'form'
  const [template,    setTemplate]    = useState(null);
  const [description, setDescription] = useState('');
  const [reference,   setReference]   = useState('');
  const [entryDate,   setEntryDate]   = useState(today());
  const [lines,       setLines]       = useState([]);
  const [saving,      setSaving]      = useState(false);

  // Reset on open
  useEffect(() => {
    if (open) { setStep('template'); setTemplate(null); setLines([]); setDescription(''); setReference(''); setEntryDate(today()); }
  }, [open]);

  const selectTemplate = (tpl) => {
    setTemplate(tpl);
    setDescription(tpl.label);
    setLines(tpl.lines(accounts).map((l, i) => ({ ...l, id: i })));
    setStep('form');
  };

  const setLine = (id, field, value) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const selectAccount = (id, accountId) => {
    const acc = accounts.find(a => a.id === accountId);
    setLines(prev => prev.map(l => l.id === id
      ? { ...l, account_id: accountId, account_label: acc ? `[${acc.code}] ${acc.name}` : '' }
      : l
    ));
  };

  const addLine = () => setLines(prev => [...prev, { id: Date.now(), account_id: '', account_label: '', debit: '', credit: '' }]);
  const removeLine = (id) => setLines(prev => prev.filter(l => l.id !== id));

  const totalDebit  = lines.reduce((s, l) => s + (parseFloat(l.debit)  || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;
  const diff        = Math.abs(totalDebit - totalCredit);

  const handleSave = async () => {
    if (!description.trim()) return toast.error('Description required');
    if (!balanced)           return toast.error(`Entry is not balanced — difference: PKR ${diff.toLocaleString()}`);
    const validLines = lines.filter(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (validLines.length < 2) return toast.error('At least 2 lines with amounts required');

    setSaving(true);
    try {
      await createJournalEntry({
        description,
        reference:  reference || undefined,
        entry_date: entryDate,
        lines: validLines.map(l => ({
          account_id: l.account_id,
          debit:      parseFloat(l.debit)  || 0,
          credit:     parseFloat(l.credit) || 0,
        })),
      });
      toast.success('Journal entry posted!');
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to post entry'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Journal Entry" width={640}>
      {step === 'template' && (
        <div>
          <p style={{ fontSize: 13, color: T.textMid, marginBottom: 20 }}>
            Choose a template to pre-fill common entries, or start from scratch.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {TEMPLATES.map(tpl => (
              <div key={tpl.label} onClick={() => selectTemplate(tpl)} style={{
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
                padding: '14px 16px', cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.border = `1px solid ${T.accent}66`; e.currentTarget.style.background = T.accentGlow; }}
                onMouseLeave={e => { e.currentTarget.style.border = `1px solid ${T.border}`;   e.currentTarget.style.background = T.surface; }}
              >
                <div style={{ fontSize: 22, marginBottom: 6 }}>{tpl.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>{tpl.label}</div>
                <div style={{ fontSize: 11, color: T.textMid, marginBottom: 6 }}>{tpl.description}</div>
                <div style={{ fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>{tpl.hint}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 'form' && (
        <div>
          {/* Back */}
          <button onClick={() => setStep('template')} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', fontFamily: "'Syne', sans-serif", marginBottom: 16, padding: 0 }}>
            ← Back to templates
          </button>

          {/* Header fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px', gap: '0 12px', marginBottom: 20 }}>
            <Input label="Description *" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Daily sales — 26 March" />
            <Input label="Reference #"   value={reference}   onChange={e => setReference(e.target.value)}   placeholder="INV-001" />
            <Input label="Entry Date"    type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
          </div>

          {/* Template hint */}
          {template && template.hint !== 'Add any accounts and amounts manually' && (
            <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '8px 14px', marginBottom: 16, fontSize: 12, color: T.textMid }}>
              💡 {template.hint}
            </div>
          )}

          {/* Lines table */}
          <div style={{ marginBottom: 8 }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 32px', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
              {['Account', 'Debit (PKR)', 'Credit (PKR)', ''].map(h => (
                <div key={h} style={{ fontSize: 11, color: T.textDim, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>{h}</div>
              ))}
            </div>

            {/* Lines */}
            {lines.map((line, idx) => (
              <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 32px', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
                {/* Account selector */}
                <select value={line.account_id} onChange={e => selectAccount(line.id, e.target.value)}
                  style={{ background: T.surface, border: `1px solid ${line.account_id ? T.border : T.accent + '88'}`, borderRadius: 8, padding: '8px 10px', color: line.account_id ? T.text : T.textDim, fontSize: 12, fontFamily: "'Syne', sans-serif", outline: 'none', width: '100%' }}>
                  <option value="">— Select Account —</option>
                  {['revenue','cogs','expense','asset','liability','equity'].map(type => {
                    const group = accounts.filter(a => a.type === type);
                    if (!group.length) return null;
                    return (
                      <optgroup key={type} label={type.toUpperCase()}>
                        {group.map(a => <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>)}
                      </optgroup>
                    );
                  })}
                </select>

                {/* Debit */}
                <input type="number" value={line.debit} min="0"
                  onChange={e => { setLine(line.id, 'debit', e.target.value); if (e.target.value) setLine(line.id, 'credit', ''); }}
                  placeholder="0"
                  style={{ background: line.debit ? 'rgba(231,76,60,0.08)' : T.surface, border: `1px solid ${line.debit ? T.red + '88' : T.border}`, borderRadius: 8, padding: '8px 10px', color: line.debit ? T.red : T.textDim, fontSize: 13, fontFamily: 'monospace', outline: 'none', width: '100%', textAlign: 'right' }} />

                {/* Credit */}
                <input type="number" value={line.credit} min="0"
                  onChange={e => { setLine(line.id, 'credit', e.target.value); if (e.target.value) setLine(line.id, 'debit', ''); }}
                  placeholder="0"
                  style={{ background: line.credit ? 'rgba(46,204,113,0.08)' : T.surface, border: `1px solid ${line.credit ? T.green + '88' : T.border}`, borderRadius: 8, padding: '8px 10px', color: line.credit ? T.green : T.textDim, fontSize: 13, fontFamily: 'monospace', outline: 'none', width: '100%', textAlign: 'right' }} />

                {/* Remove */}
                {lines.length > 2 ? (
                  <button onClick={() => removeLine(line.id)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, textAlign: 'center' }}>×</button>
                ) : <div />}
              </div>
            ))}

            {/* Totals row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 32px', gap: 8, padding: '10px 0', borderTop: `2px solid ${T.borderLight}`, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                TOTALS
                {balanced
                  ? <span style={{ color: T.green, marginLeft: 10, fontSize: 11 }}>✓ Balanced</span>
                  : totalDebit > 0 || totalCredit > 0
                    ? <span style={{ color: T.red, marginLeft: 10, fontSize: 11 }}>✗ Diff: PKR {diff.toLocaleString()}</span>
                    : null
                }
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.red, textAlign: 'right' }}>
                {totalDebit > 0 ? totalDebit.toLocaleString() : '—'}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.green, textAlign: 'right' }}>
                {totalCredit > 0 ? totalCredit.toLocaleString() : '—'}
              </div>
              <div />
            </div>
          </div>

          {/* Add line */}
          <button onClick={addLine} style={{ background: 'transparent', border: `1px dashed ${T.border}`, color: T.textMid, borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer', fontFamily: "'Syne', sans-serif", marginBottom: 20 }}>
            + Add Line
          </button>

          {/* Submit */}
          <Btn onClick={handleSave} disabled={saving || !balanced} style={{ width: '100%', opacity: balanced ? 1 : 0.5 }}>
            {saving ? '⏳ Posting…' : `✓ Post Journal Entry${balanced ? ` — PKR ${totalDebit.toLocaleString()}` : ''}`}
          </Btn>
          {!balanced && totalDebit > 0 && (
            <p style={{ textAlign: 'center', fontSize: 12, color: T.red, marginTop: 8 }}>
              Entry must balance before posting. Adjust debits or credits.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

// ─── Add Account Modal ────────────────────────────────────────────────────────
function NewAccountModal({ open, onClose, onSaved }) {
  const [form, setForm]     = useState({ code: '', name: '', type: 'expense' });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.code || !form.name) return toast.error('Code and name required');
    setSaving(true);
    try {
      await createGLAccount(form);
      toast.success('Account created!');
      setForm({ code: '', name: '', type: 'expense' });
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add GL Account" width={420}>
      <Input label="Account Code *" value={form.code} onChange={set('code')} placeholder="e.g. 6004" />
      <Input label="Account Name *" value={form.name} onChange={set('name')} placeholder="e.g. Marketing Expenses" />
      <Select label="Account Type *" value={form.type} onChange={set('type')}>
        {[['revenue','Revenue'],['cogs','Cost of Goods Sold'],['expense','Expense'],['asset','Asset'],['liability','Liability'],['equity','Equity']].map(([v,l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </Select>
      <div style={{ background: T.surface, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: T.textMid, marginBottom: 16 }}>
        💡 Use a 4-digit code: <b style={{ color: T.text }}>1xxx</b> Assets · <b style={{ color: T.text }}>2xxx</b> Liabilities · <b style={{ color: T.text }}>3xxx</b> Equity · <b style={{ color: T.text }}>4xxx</b> Revenue · <b style={{ color: T.text }}>5xxx</b> COGS · <b style={{ color: T.text }}>6xxx</b> Expenses
      </div>
      <Btn onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
        {saving ? '⏳ Saving…' : '✓ Create Account'}
      </Btn>
    </Modal>
  );
}

// ─── Main Ledger Page ─────────────────────────────────────────────────────────
export default function Ledger() {
  useT();
  const [accounts,  setAccounts]  = useState([]);
  const [entries,   setEntries]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('accounts');
  const [newEntry,  setNewEntry]  = useState(false);
  const [newAcct,   setNewAcct]   = useState(false);
  const [dateFrom,  setDateFrom]  = useState('');
  const [dateTo,    setDateTo]    = useState('');
  const [expanded,  setExpanded]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (dateFrom) params.from = dateFrom;
      if (dateTo)   params.to   = dateTo;
      const [a, e] = await Promise.all([getGLAccounts(), getJournalEntries(params)]);
      setAccounts(a.data);
      setEntries(e.data);
    } catch { toast.error('Failed to load ledger'); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const revenue  = accounts.filter(a => a.type === 'revenue').reduce((s, a) => s + Number(a.balance), 0);
  const cogs     = accounts.filter(a => a.type === 'cogs').reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
  const expenses = accounts.filter(a => a.type === 'expense').reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
  const net      = revenue - cogs - expenses;

  const tabStyle = (t) => ({
    padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500,
    background: tab === t ? T.accent : 'transparent', color: tab === t ? '#000' : T.textMid,
    border: `1px solid ${tab === t ? T.accent : T.border}`, fontFamily: "'Syne', sans-serif",
  });

  if (loading) return <Spinner />;

  // Group accounts by type
  const accountGroups = ['revenue','cogs','expense','asset','liability','equity'].reduce((acc, type) => {
    acc[type] = accounts.filter(a => a.type === type);
    return acc;
  }, {});

  const TYPE_LABEL = { revenue: 'Revenue', cogs: 'Cost of Goods Sold', expense: 'Expenses', asset: 'Assets', liability: 'Liabilities', equity: 'Equity' };

  return (
    <div>
      <PageHeader
        title="📊 General Ledger"
        subtitle="Chart of accounts, journal entries & financial overview"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" onClick={() => setNewAcct(true)}>+ Account</Btn>
            <Btn onClick={() => setNewEntry(true)}>+ Journal Entry</Btn>
          </div>
        }
      />

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Revenue"  value={fmt(revenue)}  color={T.green}                   icon="↑" />
        <StatCard label="COGS"           value={fmt(cogs)}     color={T.accent}                  icon="⚙" />
        <StatCard label="Total Expenses" value={fmt(expenses)} color={T.red}                     icon="↓" />
        <StatCard label="Net Profit"     value={fmt(net)}      color={net >= 0 ? T.green : T.red} icon="=" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}>
        <button style={tabStyle('accounts')} onClick={() => setTab('accounts')}>Chart of Accounts</button>
        <button style={tabStyle('entries')}  onClick={() => setTab('entries')}>Journal Entries ({entries.length})</button>

        {/* Date filter for entries */}
        {tab === 'entries' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              placeholder="From"
              style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Syne', sans-serif", outline: 'none' }} />
            <span style={{ color: T.textDim, fontSize: 12 }}>to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Syne', sans-serif", outline: 'none' }} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ background: 'none', border: 'none', color: T.textMid, cursor: 'pointer', fontSize: 18 }}>×</button>
            )}
          </div>
        )}
      </div>

      {/* ── Chart of Accounts ── */}
      {tab === 'accounts' && (
        <div>
          {Object.entries(accountGroups).filter(([, accs]) => accs.length > 0).map(([type, accs]) => {
            const groupTotal = accs.reduce((s, a) => s + Number(a.balance), 0);
            return (
              <div key={type} style={{ marginBottom: 16 }}>
                {/* Group header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: T.surface, borderRadius: '12px 12px 0 0', borderBottom: `2px solid ${TYPE_COLOR[type]}44` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLOR[type] }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: TYPE_COLOR[type], letterSpacing: 1, textTransform: 'uppercase' }}>{TYPE_LABEL[type]}</span>
                    <Badge color={TYPE_COLOR[type]} small>{accs.length}</Badge>
                  </div>
                  <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: groupTotal >= 0 ? T.green : T.red }}>
                    {groupTotal >= 0 ? '+' : ''}PKR {groupTotal.toLocaleString()}
                  </span>
                </div>
                {/* Account rows */}
                <Card style={{ padding: 0, borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {accs.map((a, idx) => (
                        <tr key={a.id} style={{ borderTop: idx > 0 ? `1px solid ${T.border}` : 'none' }}>
                          <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontSize: 12, color: T.textMid, width: 60 }}>{a.code}</td>
                          <td style={{ padding: '11px 16px', fontWeight: 700, color: T.text }}>{a.name}</td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: T.red }}>
                            {Number(a.total_debit) > 0 ? `Dr ${Number(a.total_debit).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: T.green }}>
                            {Number(a.total_credit) > 0 ? `Cr ${Number(a.total_credit).toLocaleString()}` : '—'}
                          </td>
                          <td style={{ padding: '11px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 800, width: 140, color: Number(a.balance) >= 0 ? T.green : T.red }}>
                            {Number(a.balance) >= 0 ? '+' : ''}PKR {Number(a.balance).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            );
          })}

          {/* Net summary row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: net >= 0 ? T.greenDim : T.redDim, borderRadius: 12, border: `1px solid ${net >= 0 ? T.green : T.red}44`, marginTop: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: T.text }}>NET PROFIT / LOSS</span>
            <span style={{ fontFamily: 'monospace', fontSize: 20, fontWeight: 800, color: net >= 0 ? T.green : T.red }}>
              {net >= 0 ? '+' : ''}PKR {net.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* ── Journal Entries ── */}
      {tab === 'entries' && (
        <div>
          {entries.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: T.textDim }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📒</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.textMid, marginBottom: 8 }}>No journal entries yet</div>
              <div style={{ fontSize: 13, marginBottom: 20 }}>Post your first entry to start tracking your financials.</div>
              <Btn onClick={() => setNewEntry(true)}>+ Post First Entry</Btn>
            </div>
          ) : (
            entries.map(entry => (
              <Card key={entry.id} style={{ marginBottom: 10, padding: 0, overflow: 'hidden', cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}>
                {/* Entry header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: T.accentGlow, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📒</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: T.text, fontSize: 14 }}>{entry.description}</div>
                    <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>
                      {fmtDT(entry.entry_date)}
                      {entry.reference && ` · Ref: ${entry.reference}`}
                      {` · ${(entry.lines || []).length} lines`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 14, color: T.accent }}>
                      PKR {(entry.lines || []).reduce((s, l) => s + Number(l.debit), 0).toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>total debit</div>
                  </div>
                  <div style={{ color: T.textDim, fontSize: 16, transition: 'transform 0.2s', transform: expanded === entry.id ? 'rotate(90deg)' : 'none' }}>›</div>
                </div>

                {/* Expanded lines */}
                {expanded === entry.id && (
                  <div style={{ borderTop: `1px solid ${T.border}`, background: T.surface }}>
                    {/* Column headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 150px 150px', gap: 0, padding: '8px 18px', borderBottom: `1px solid ${T.border}` }}>
                      {['Code', 'Account', 'Debit', 'Credit'].map(h => (
                        <div key={h} style={{ fontSize: 10, color: T.textDim, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600, textAlign: h === 'Debit' || h === 'Credit' ? 'right' : 'left' }}>{h}</div>
                      ))}
                    </div>
                    {(entry.lines || []).map((line, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 150px 150px', gap: 0, padding: '10px 18px', borderBottom: i < entry.lines.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                        <div style={{ fontFamily: 'monospace', fontSize: 12, color: T.textDim }}>{line.account_code}</div>
                        <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{line.account_name}</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: Number(line.debit) > 0 ? 700 : 400, color: Number(line.debit) > 0 ? T.red : T.textDim, textAlign: 'right' }}>
                          {Number(line.debit) > 0 ? Number(line.debit).toLocaleString() : '—'}
                        </div>
                        <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: Number(line.credit) > 0 ? 700 : 400, color: Number(line.credit) > 0 ? T.green : T.textDim, textAlign: 'right' }}>
                          {Number(line.credit) > 0 ? Number(line.credit).toLocaleString() : '—'}
                        </div>
                      </div>
                    ))}
                    {/* Totals */}
                    <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 150px 150px', padding: '10px 18px', borderTop: `2px solid ${T.borderLight}`, background: T.card }}>
                      <div /><div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>TOTAL</div>
                      <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: T.red, textAlign: 'right' }}>
                        {(entry.lines || []).reduce((s,l) => s+Number(l.debit),0).toLocaleString()}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: T.green, textAlign: 'right' }}>
                        {(entry.lines || []).reduce((s,l) => s+Number(l.credit),0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Modals */}
      <NewEntryModal  open={newEntry} onClose={() => setNewEntry(false)} onSaved={load} accounts={accounts} />
      <NewAccountModal open={newAcct} onClose={() => setNewAcct(false)} onSaved={load} />
    </div>
  );
}
