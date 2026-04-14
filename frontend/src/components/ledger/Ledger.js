import React, { useEffect, useState, useCallback } from 'react';
import { getGLAccounts, getJournalEntries, createJournalEntry, getTrialBalance, getBalanceSheet } from '../../services/api';
import { Card, Badge, Spinner, Btn, Modal, Input, Select, StatCard, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';
import API from '../../services/api';

// ─── Additional API calls ─────────────────────────────────────────────────────
const createGLAccount = (d)      => API.post('/gl/accounts', d);
const updateGLAccount = (id, d)  => API.put(`/gl/accounts/${id}`, d);
const deleteGLAccount = (id)     => API.delete(`/gl/accounts/${id}`);

const today  = () => new Date().toISOString().slice(0, 10);
const fmt    = (n) => `PKR ${Number(n || 0).toLocaleString()}`;
const fmtDT  = (d) => new Date(d).toLocaleDateString('en-PK', { day:'numeric', month:'short', year:'numeric' });

const TYPE_COLOR = { revenue: T.green, cogs: T.accent, expense: T.red, asset: T.blue, liability: T.textMid, equity: T.purple };

// ─── Tree helpers ─────────────────────────────────────────────────────────────
function buildTree(accounts) {
  const byId = {};
  accounts.forEach(a => { byId[a.id] = { ...a, children: [] }; });
  const roots = [];
  accounts.forEach(a => {
    if (a.parent_id && byId[a.parent_id]) {
      byId[a.parent_id].children.push(byId[a.id]);
    } else {
      roots.push(byId[a.id]);
    }
  });
  const sort = nodes => {
    nodes.sort((x, y) => (x.code || '').localeCompare(y.code || ''));
    nodes.forEach(n => sort(n.children));
    return nodes;
  };
  return sort(roots);
}

function flattenTree(nodes, depth = 0) {
  const result = [];
  nodes.forEach(node => {
    result.push({ ...node, depth });
    if (node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  });
  return result;
}

// ─── Entry templates ──────────────────────────────────────────────────────────
const findAccount = (accounts, ...codes) => {
  for (const code of codes) {
    const a = accounts.find(x => x.code === code);
    if (a && !a.is_header) return a;
  }
  return null;
};

const TEMPLATES = [
  {
    label: 'Daily Sales Revenue',
    icon:  '💰',
    description: 'Record end-of-day food & beverage sales',
    lines: (accounts) => {
      const cash    = findAccount(accounts, '1111', '1001');
      const foodRev = findAccount(accounts, '4100', '4001');
      const bevRev  = findAccount(accounts, '4200', '4002');
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
      const foodCost = findAccount(accounts, '5100', '5001');
      const cash     = findAccount(accounts, '1111', '1001');
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
      const wages = findAccount(accounts, '6100', '6001');
      const cash  = findAccount(accounts, '1111', '1001');
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
      const rent = findAccount(accounts, '6200', '6002');
      const bank = findAccount(accounts, '1112', '1002');
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
      const bank = findAccount(accounts, '1112', '1002');
      const cash = findAccount(accounts, '1111', '1001');
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
      const supp = findAccount(accounts, '6300', '6003');
      const cash = findAccount(accounts, '1111', '1001');
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

// ─── Account selector (postable / non-header accounts, hierarchically ordered) ─
function AccountSelector({ value, onChange, accounts, style }) {
  const postable = accounts.filter(a => !a.is_header);
  const flatSorted = flattenTree(buildTree(postable));
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      style={{
        background: T.surface, border: `1px solid ${value ? T.border : T.accent + '88'}`,
        borderRadius: 8, padding: '8px 10px', color: value ? T.text : T.textDim,
        fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%',
        ...style,
      }}
    >
      <option value="">— Select Account —</option>
      {['asset','liability','equity','revenue','cogs','expense'].map(type => {
        const group = flatSorted.filter(a => a.type === type);
        if (!group.length) return null;
        return (
          <optgroup key={type} label={type.toUpperCase()}>
            {group.map(a => (
              <option key={a.id} value={a.id}>
                {'\u00A0'.repeat(a.depth * 3)}[{a.code}] {a.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

// ─── New Journal Entry Modal ──────────────────────────────────────────────────
function NewEntryModal({ open, onClose, onSaved, accounts }) {
  const [step,        setStep]        = useState('template');
  const [template,    setTemplate]    = useState(null);
  const [description, setDescription] = useState('');
  const [reference,   setReference]   = useState('');
  const [entryDate,   setEntryDate]   = useState(today());
  const [lines,       setLines]       = useState([]);
  const [saving,      setSaving]      = useState(false);

  useEffect(() => {
    if (open) { setStep('template'); setTemplate(null); setLines([]); setDescription(''); setReference(''); setEntryDate(today()); }
  }, [open]);

  const postable = accounts.filter(a => !a.is_header);

  const selectTemplate = (tpl) => {
    setTemplate(tpl);
    setDescription(tpl.label);
    setLines(tpl.lines(postable).map((l, i) => ({ ...l, id: i })));
    setStep('form');
  };

  const setLine      = (id, field, value) => setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  const selectAcct   = (id, accountId)    => {
    const acc = postable.find(a => a.id === accountId);
    setLines(prev => prev.map(l => l.id === id
      ? { ...l, account_id: accountId, account_label: acc ? `[${acc.code}] ${acc.name}` : '' }
      : l
    ));
  };
  const addLine    = ()  => setLines(prev => [...prev, { id: Date.now(), account_id: '', account_label: '', debit: '', credit: '' }]);
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
        description, reference: reference || undefined, entry_date: entryDate,
        lines: validLines.map(l => ({ account_id: l.account_id, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 })),
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
                onMouseLeave={e => { e.currentTarget.style.border = `1px solid ${T.border}`; e.currentTarget.style.background = T.surface; }}
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
          <button onClick={() => setStep('template')} style={{ background: 'none', border: 'none', color: T.accent, fontSize: 12, cursor: 'pointer', fontFamily: "'Inter', sans-serif", marginBottom: 16, padding: 0 }}>
            ← Back to templates
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px', gap: '0 12px', marginBottom: 20 }}>
            <Input label="Description *" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Daily sales — 26 March" />
            <Input label="Reference #"   value={reference}   onChange={e => setReference(e.target.value)}   placeholder="INV-001" />
            <Input label="Entry Date"    type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
          </div>

          {template && template.hint !== 'Add any accounts and amounts manually' && (
            <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '8px 14px', marginBottom: 16, fontSize: 12, color: T.textMid }}>
              💡 {template.hint}
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 32px', gap: 8, padding: '6px 0', borderBottom: `1px solid ${T.border}` }}>
              {['Account', 'Debit (PKR)', 'Credit (PKR)', ''].map(h => (
                <div key={h} style={{ fontSize: 11, color: T.textDim, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>{h}</div>
              ))}
            </div>

            {lines.map((line) => (
              <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 32px', gap: 8, padding: '8px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
                <AccountSelector value={line.account_id} onChange={v => selectAcct(line.id, v)} accounts={accounts} />
                <input type="number" value={line.debit} min="0"
                  onChange={e => { setLine(line.id, 'debit', e.target.value); if (e.target.value) setLine(line.id, 'credit', ''); }}
                  placeholder="0"
                  style={{ background: line.debit ? 'rgba(231,76,60,0.08)' : T.surface, border: `1px solid ${line.debit ? T.red + '88' : T.border}`, borderRadius: 8, padding: '8px 10px', color: line.debit ? T.red : T.textDim, fontSize: 13, fontFamily: 'monospace', outline: 'none', width: '100%', textAlign: 'right' }} />
                <input type="number" value={line.credit} min="0"
                  onChange={e => { setLine(line.id, 'credit', e.target.value); if (e.target.value) setLine(line.id, 'debit', ''); }}
                  placeholder="0"
                  style={{ background: line.credit ? 'rgba(46,204,113,0.08)' : T.surface, border: `1px solid ${line.credit ? T.green + '88' : T.border}`, borderRadius: 8, padding: '8px 10px', color: line.credit ? T.green : T.textDim, fontSize: 13, fontFamily: 'monospace', outline: 'none', width: '100%', textAlign: 'right' }} />
                {lines.length > 2
                  ? <button onClick={() => removeLine(line.id)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, textAlign: 'center' }}>×</button>
                  : <div />
                }
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 32px', gap: 8, padding: '10px 0', borderTop: `2px solid ${T.borderLight}`, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                TOTALS
                {balanced
                  ? <span style={{ color: T.green, marginLeft: 10, fontSize: 11 }}>✓ Balanced</span>
                  : totalDebit > 0 || totalCredit > 0
                    ? <span style={{ color: T.red, marginLeft: 10, fontSize: 11 }}>✗ Diff: PKR {diff.toLocaleString()}</span>
                    : null}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.red, textAlign: 'right' }}>{totalDebit > 0 ? totalDebit.toLocaleString() : '—'}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.green, textAlign: 'right' }}>{totalCredit > 0 ? totalCredit.toLocaleString() : '—'}</div>
              <div />
            </div>
          </div>

          <button onClick={addLine} style={{ background: 'transparent', border: `1px dashed ${T.border}`, color: T.textMid, borderRadius: 8, padding: '7px 16px', fontSize: 12, cursor: 'pointer', fontFamily: "'Inter', sans-serif", marginBottom: 20 }}>
            + Add Line
          </button>

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

// ─── Add / Edit Account Modal ─────────────────────────────────────────────────
const ACCOUNT_TYPES = [['asset','Asset'],['liability','Liability'],['equity','Equity'],['revenue','Revenue'],['cogs','Cost of Goods Sold'],['expense','Expense']];

function AccountModal({ open, onClose, onSaved, accounts, editAccount }) {
  const isEdit = !!editAccount;
  const [form, setForm]     = useState({ code: '', name: '', type: 'expense', description: '', parent_id: '', is_header: false });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    if (open) {
      if (isEdit) {
        setForm({
          code: editAccount.code || '',
          name: editAccount.name || '',
          type: editAccount.type || 'expense',
          description: editAccount.description || '',
          parent_id: editAccount.parent_id || '',
          is_header: !!editAccount.is_header,
        });
      } else {
        setForm({ code: '', name: '', type: 'expense', description: '', parent_id: '', is_header: false });
      }
    }
  }, [open, isEdit, editAccount]);

  const handleSave = async () => {
    if (!form.code || !form.name) return toast.error('Code and name required');
    setSaving(true);
    try {
      if (isEdit) {
        await updateGLAccount(editAccount.id, {
          name: form.name,
          description: form.description || null,
          is_header: form.is_header,
          is_active: true,
        });
        toast.success('Account updated!');
      } else {
        await createGLAccount({
          code: form.code,
          name: form.name,
          type: form.type,
          description: form.description || null,
          parent_id: form.parent_id || null,
          is_header: form.is_header,
        });
        toast.success('Account created!');
      }
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  // Parent selector: accounts of same type, that are headers (or no type restriction if creating)
  const parentOptions = flattenTree(buildTree(accounts.filter(a => !isEdit || a.id !== editAccount?.id)));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit GL Account' : 'Add GL Account'} width={460}>
      <div style={{ display: 'grid', gridTemplateColumns: isEdit ? '1fr' : '120px 1fr', gap: '0 12px' }}>
        {!isEdit && <Input label="Account Code *" value={form.code} onChange={set('code')} placeholder="e.g. 6004" />}
        <Input label="Account Name *" value={form.name} onChange={set('name')} placeholder="e.g. Marketing Expenses" />
      </div>

      {!isEdit && (
        <Select label="Account Type *" value={form.type} onChange={set('type')}>
          {ACCOUNT_TYPES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      )}

      <Input label="Description" value={form.description} onChange={set('description')} placeholder="Optional — shown in CoA tree" />

      {/* Parent account selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 6, fontWeight: 600 }}>Parent Account</div>
        <select
          value={form.parent_id || ''}
          onChange={e => setForm(f => ({ ...f, parent_id: e.target.value || null }))}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: form.parent_id ? T.text : T.textDim, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%' }}
        >
          <option value="">— No parent (top level) —</option>
          {['asset','liability','equity','revenue','cogs','expense'].map(type => {
            const group = parentOptions.filter(a => a.type === type);
            if (!group.length) return null;
            return (
              <optgroup key={type} label={type.toUpperCase()}>
                {group.map(a => (
                  <option key={a.id} value={a.id}>
                    {'\u00A0'.repeat(a.depth * 3)}[{a.code}] {a.name}{a.is_header ? ' (header)' : ''}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </div>

      {/* Header account toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <input type="checkbox" id="is_header" checked={form.is_header} onChange={set('is_header')}
          style={{ width: 16, height: 16, accentColor: T.accent, cursor: 'pointer' }} />
        <label htmlFor="is_header" style={{ fontSize: 13, color: T.text, cursor: 'pointer' }}>
          Header account <span style={{ color: T.textDim, fontSize: 11 }}>(groups child accounts, no direct journal entries)</span>
        </label>
      </div>

      {!isEdit && (
        <div style={{ background: T.surface, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: T.textMid, marginBottom: 16 }}>
          💡 Code conventions: <b style={{ color: T.text }}>1xxx</b> Assets · <b style={{ color: T.text }}>2xxx</b> Liabilities · <b style={{ color: T.text }}>3xxx</b> Equity · <b style={{ color: T.text }}>4xxx</b> Revenue · <b style={{ color: T.text }}>5xxx</b> COGS · <b style={{ color: T.text }}>6xxx</b> Expenses
        </div>
      )}

      <Btn onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
        {saving ? '⏳ Saving…' : isEdit ? '✓ Update Account' : '✓ Create Account'}
      </Btn>
    </Modal>
  );
}

// ─── Trial Balance Tab ────────────────────────────────────────────────────────
function TrialBalanceTab() {
  useT();
  const today = () => new Date().toISOString().slice(0, 10);
  const monthStart = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
  const [from, setFrom] = useState(monthStart());
  const [to,   setTo]   = useState(today());
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

  useEffect(() => { load(); }, [load]);

  const TYPE_LABEL  = { revenue: 'Revenue', cogs: 'Cost of Goods Sold', expense: 'Expenses', asset: 'Assets', liability: 'Liabilities', equity: 'Equity' };
  const TYPE_COLOR2 = { revenue: T.green, cogs: T.accent, expense: T.red, asset: T.blue, liability: T.textMid, equity: '#9b59b6' };

  if (loading) return <Spinner />;
  if (!data)   return null;

  const groups = ['asset','liability','equity','revenue','cogs','expense'].reduce((acc, t) => {
    acc[t] = data.rows.filter(r => r.type === t);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: T.textMid }}>Period:</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
        <span style={{ color: T.textDim, fontSize: 12 }}>to</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
        <div style={{ marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: data.balanced ? T.green : T.red, fontWeight: 700 }}>
            {data.balanced ? '✓ Balanced' : '✗ Not Balanced'}
          </span>
        </div>
      </div>

      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: T.surface }}>
              {['Code', 'Account Name', 'Type', 'Total Debit', 'Total Credit', 'Net Balance'].map(h => (
                <th key={h} style={{ padding: '11px 16px', textAlign: ['Code','Account Name','Type'].includes(h) ? 'left' : 'right', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {['asset','liability','equity','revenue','cogs','expense'].map(type => {
              const rows = groups[type];
              if (!rows.length) return null;
              return (
                <React.Fragment key={type}>
                  <tr>
                    <td colSpan={6} style={{ padding: '8px 16px', background: T.surface, fontSize: 11, fontWeight: 700, color: TYPE_COLOR2[type], letterSpacing: 0.8, textTransform: 'uppercase', borderTop: `1px solid ${T.border}` }}>
                      {TYPE_LABEL[type]}
                    </td>
                  </tr>
                  {rows.map((r) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${T.border}` }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, color: T.textMid, width: 60 }}>{r.code}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: T.text, fontWeight: 500, paddingLeft: `${16 + (r.level - 1) * 14}px` }}>{r.name}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: TYPE_COLOR2[r.type], background: `${TYPE_COLOR2[r.type]}22`, padding: '2px 7px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{r.type}</span>
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
              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.red }}>PKR {Number(data.totalDebit).toLocaleString()}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.green }}>PKR {Number(data.totalCredit).toLocaleString()}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: data.balanced ? T.green : T.red }}>
                {data.balanced ? '✓ Balanced' : `Diff: PKR ${Math.abs(data.totalDebit - data.totalCredit).toLocaleString()}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </Card>
    </div>
  );
}

// ─── Balance Sheet Tab ────────────────────────────────────────────────────────
function BalanceSheetTab() {
  useT();
  const today = () => new Date().toISOString().slice(0, 10);
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

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (!data)   return null;

  const totalLiabEquity = Number(data.totalLiabilities) + Number(data.totalEquity) + Number(data.netIncome);
  const balanced = Math.abs(Number(data.totalAssets) - totalLiabEquity) < 1;

  const Section = ({ title, accounts, total, color }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: T.surface, borderRadius: '10px 10px 0 0', borderBottom: `2px solid ${color}44` }}>
        <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: 1, textTransform: 'uppercase' }}>{title}</span>
        <span style={{ fontFamily: 'monospace', fontWeight: 800, color }}>{fmt(total)}</span>
      </div>
      <Card style={{ padding: 0, borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {accounts.map((a, i) => (
              <tr key={a.id} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, color: T.textMid, width: 60 }}>{a.code}</td>
                <td style={{ padding: '10px 16px', fontSize: 13, color: T.text, paddingLeft: `${16 + ((a.level || 1) - 1) * 14}px` }}>{a.name}</td>
                <td style={{ padding: '10px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: Number(a.balance) >= 0 ? T.green : T.red }}>
                  {fmt(a.balance)}
                </td>
              </tr>
            ))}
            {accounts.length === 0 && (
              <tr><td colSpan={3} style={{ padding: '16px', textAlign: 'center', color: T.textDim, fontSize: 12 }}>No accounts</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 24 }}>
        <span style={{ fontSize: 12, color: T.textMid }}>As of:</span>
        <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
          style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <Section title="Assets" accounts={data.assets} total={data.totalAssets} color={T.blue} />
          <div style={{ background: Number(data.netIncome) >= 0 ? T.greenDim : T.redDim, border: `1px solid ${Number(data.netIncome) >= 0 ? T.green : T.red}44`, borderRadius: 10, padding: '12px 16px', marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 0.5, textTransform: 'uppercase' }}>Net Income</div>
                <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                  Revenue {fmt(data.revenue)} − COGS {fmt(data.cogs)} − Expenses {fmt(data.expenses)}
                </div>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 800, color: Number(data.netIncome) >= 0 ? T.green : T.red }}>
                {Number(data.netIncome) >= 0 ? '+' : ''}{fmt(data.netIncome)}
              </span>
            </div>
          </div>
        </div>
        <div>
          <Section title="Liabilities" accounts={data.liabilities} total={data.totalLiabilities} color={T.red} />
          <Section title="Equity"      accounts={data.equity}      total={data.totalEquity}       color={'#9b59b6'} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', background: balanced ? T.greenDim : T.redDim, borderRadius: 12, border: `1px solid ${balanced ? T.green : T.red}44`, marginTop: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Assets = Liabilities + Equity + Net Income</span>
        <span style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: balanced ? T.green : T.red }}>
          {fmt(data.totalAssets)} {balanced ? '=' : '≠'} {fmt(totalLiabEquity)}
        </span>
      </div>
    </div>
  );
}

// ─── Chart of Accounts Tree ───────────────────────────────────────────────────
function CoATree({ accounts, onEdit, onDelete }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (id) => setCollapsed(p => ({ ...p, [id]: !p[id] }));

  const TYPE_LABEL = { revenue: 'Revenue', cogs: 'Cost of Goods Sold', expense: 'Expenses', asset: 'Assets', liability: 'Liabilities', equity: 'Equity' };

  // Build per-type trees
  const types = ['asset','liability','equity','revenue','cogs','expense'];

  const renderNode = (node, depth = 0) => {
    const isCollapsed = collapsed[node.id];
    const hasChildren = node.children && node.children.length > 0;
    const indent = depth * 18;

    return (
      <React.Fragment key={node.id}>
        <tr style={{ borderTop: `1px solid ${T.border}`, background: node.is_header ? `${TYPE_COLOR[node.type]}08` : 'transparent' }}>
          {/* Code */}
          <td style={{ padding: '9px 16px', fontFamily: 'monospace', fontSize: 12, color: T.textMid, width: 70, userSelect: 'none' }}>
            {node.code}
          </td>
          {/* Name */}
          <td style={{ padding: '9px 8px 9px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', paddingLeft: indent }}>
              {hasChildren ? (
                <button onClick={() => toggle(node.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px 0 0', color: T.textDim, fontSize: 12, lineHeight: 1, flexShrink: 0 }}>
                  {isCollapsed ? '▶' : '▼'}
                </button>
              ) : (
                <span style={{ display: 'inline-block', width: 16, flexShrink: 0 }} />
              )}
              <span style={{ fontSize: node.is_header ? 13 : 12, fontWeight: node.is_header ? 700 : 500, color: node.is_header ? T.text : T.textMid }}>
                {node.name}
              </span>
              {node.is_header && (
                <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, background: `${TYPE_COLOR[node.type]}22`, color: TYPE_COLOR[node.type], padding: '1px 6px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>header</span>
              )}
              {node.description && (
                <span style={{ marginLeft: 8, fontSize: 10, color: T.textDim, fontStyle: 'italic' }}>{node.description}</span>
              )}
            </div>
          </td>
          {/* Debit */}
          <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: node.is_header ? T.textDim : (Number(node.total_debit) > 0 ? T.red : T.textDim) }}>
            {node.is_header ? '—' : (Number(node.total_debit) > 0 ? `Dr ${Number(node.total_debit).toLocaleString()}` : '—')}
          </td>
          {/* Credit */}
          <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: node.is_header ? T.textDim : (Number(node.total_credit) > 0 ? T.green : T.textDim) }}>
            {node.is_header ? '—' : (Number(node.total_credit) > 0 ? `Cr ${Number(node.total_credit).toLocaleString()}` : '—')}
          </td>
          {/* Balance */}
          <td style={{ padding: '9px 16px', textAlign: 'right', fontFamily: 'monospace', fontSize: node.is_header ? 13 : 12, fontWeight: node.is_header ? 800 : 600, width: 140, color: node.is_header ? T.textDim : (Number(node.balance) >= 0 ? T.green : T.red) }}>
            {node.is_header ? '—' : `${Number(node.balance) >= 0 ? '+' : ''}PKR ${Number(node.balance).toLocaleString()}`}
          </td>
          {/* Actions */}
          <td style={{ padding: '9px 16px', textAlign: 'right', width: 80 }}>
            <button onClick={() => onEdit(node)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 13, marginRight: 6 }} title="Edit">✎</button>
            <button onClick={() => onDelete(node)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 13 }} title="Delete">🗑</button>
          </td>
        </tr>
        {/* Children */}
        {!isCollapsed && hasChildren && node.children.map(child => renderNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div>
      {types.map(type => {
        const typeAccounts = accounts.filter(a => a.type === type);
        if (!typeAccounts.length) return null;
        const tree = buildTree(typeAccounts);
        const groupBalance = typeAccounts.filter(a => !a.is_header).reduce((s, a) => s + Number(a.balance), 0);
        return (
          <div key={type} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px', background: T.surface, borderRadius: '12px 12px 0 0', borderBottom: `2px solid ${TYPE_COLOR[type]}44` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: TYPE_COLOR[type] }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: TYPE_COLOR[type], letterSpacing: 1, textTransform: 'uppercase' }}>{TYPE_LABEL[type]}</span>
                <Badge color={TYPE_COLOR[type]} small>{typeAccounts.filter(a => !a.is_header).length}</Badge>
              </div>
              <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: groupBalance >= 0 ? T.green : T.red }}>
                {groupBalance >= 0 ? '+' : ''}PKR {groupBalance.toLocaleString()}
              </span>
            </div>
            <Card style={{ padding: 0, borderRadius: '0 0 12px 12px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {tree.map(root => renderNode(root, 0))}
                </tbody>
              </table>
            </Card>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Ledger Page ─────────────────────────────────────────────────────────
export default function Ledger() {
  useT();
  const [accounts,     setAccounts]     = useState([]);
  const [entries,      setEntries]      = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [tab,          setTab]          = useState('accounts');
  const [newEntry,     setNewEntry]     = useState(false);
  const [acctModal,    setAcctModal]    = useState(false);
  const [editAccount,  setEditAccount]  = useState(null);
  const [dateFrom,     setDateFrom]     = useState('');
  const [dateTo,       setDateTo]       = useState('');
  const [expanded,     setExpanded]     = useState(null);

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

  const postableAccounts = accounts.filter(a => !a.is_header);
  const revenue  = postableAccounts.filter(a => a.type === 'revenue').reduce((s, a) => s + Number(a.balance), 0);
  const cogs     = postableAccounts.filter(a => a.type === 'cogs').reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
  const expenses = postableAccounts.filter(a => a.type === 'expense').reduce((s, a) => s + Math.abs(Number(a.balance)), 0);
  const net      = revenue - cogs - expenses;

  const tabStyle = (t) => ({
    padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500,
    background: tab === t ? T.accent : 'transparent', color: tab === t ? '#000' : T.textMid,
    border: `1px solid ${tab === t ? T.accent : T.border}`, fontFamily: "'Inter', sans-serif",
  });

  const handleEdit   = (acct)  => { setEditAccount(acct); setAcctModal(true); };
  const handleDelete = async (acct) => {
    if (!window.confirm(`Delete account "${acct.name}"? If it has journal entries, it will be deactivated instead.`)) return;
    try {
      await deleteGLAccount(acct.id);
      toast.success('Account deleted');
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to delete'); }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="📊 General Ledger"
        subtitle="Chart of accounts, journal entries & financial overview"
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" onClick={() => { setEditAccount(null); setAcctModal(true); }}>+ Account</Btn>
            <Btn onClick={() => setNewEntry(true)}>+ Journal Entry</Btn>
          </div>
        }
      />

      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <StatCard label="Total Revenue"  value={fmt(revenue)}  color={T.green}                    icon="↑" />
        <StatCard label="COGS"           value={fmt(cogs)}     color={T.accent}                   icon="⚙" />
        <StatCard label="Total Expenses" value={fmt(expenses)} color={T.red}                      icon="↓" />
        <StatCard label="Net Profit"     value={fmt(net)}      color={net >= 0 ? T.green : T.red}  icon="=" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={tabStyle('accounts')}      onClick={() => setTab('accounts')}>Chart of Accounts</button>
        <button style={tabStyle('entries')}       onClick={() => setTab('entries')}>Journal Entries ({entries.length})</button>
        <button style={tabStyle('trial_balance')} onClick={() => setTab('trial_balance')}>Trial Balance</button>
        <button style={tabStyle('balance_sheet')} onClick={() => setTab('balance_sheet')}>Balance Sheet</button>

        {tab === 'entries' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
            <span style={{ color: T.textDim, fontSize: 12 }}>to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ background: 'none', border: 'none', color: T.textMid, cursor: 'pointer', fontSize: 18 }}>×</button>
            )}
          </div>
        )}
      </div>

      {/* ── Chart of Accounts ── */}
      {tab === 'accounts' && (
        <div>
          <CoATree accounts={accounts} onEdit={handleEdit} onDelete={handleDelete} />
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

                {expanded === entry.id && (
                  <div style={{ borderTop: `1px solid ${T.border}`, background: T.surface }}>
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

      {tab === 'trial_balance' && <TrialBalanceTab />}
      {tab === 'balance_sheet' && <BalanceSheetTab />}

      {/* Modals */}
      <NewEntryModal open={newEntry} onClose={() => setNewEntry(false)} onSaved={load} accounts={accounts} />
      <AccountModal
        open={acctModal}
        onClose={() => { setAcctModal(false); setEditAccount(null); }}
        onSaved={load}
        accounts={accounts}
        editAccount={editAccount}
      />
    </div>
  );
}
