import React, { useEffect, useState, useCallback } from 'react';
import { getSalesMappings, saveSalesMappings, getInventoryMappings, saveInventoryMappings } from '../../services/api';
import { Card, Btn, Spinner, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const PAYMENT_METHODS = [
  { key: 'cash',    label: 'Cash' },
  { key: 'card',    label: 'Card / POS' },
  { key: 'online',  label: 'Online' },
  { key: 'default', label: 'Default (all others)' },
];

// ─── Tree helpers (same logic as Ledger.js) ───────────────────────────────────
function buildTree(accounts) {
  const byId = {};
  accounts.forEach(a => { byId[a.id] = { ...a, children: [] }; });
  const roots = [];
  accounts.forEach(a => {
    if (a.parent_id && byId[a.parent_id]) byId[a.parent_id].children.push(byId[a.id]);
    else roots.push(byId[a.id]);
  });
  const sort = nodes => { nodes.sort((x, y) => (x.code||'').localeCompare(y.code||'')); nodes.forEach(n => sort(n.children)); return nodes; };
  return sort(roots);
}
function flattenTree(nodes, depth = 0) {
  const result = [];
  nodes.forEach(node => { result.push({ ...node, depth }); if (node.children?.length) result.push(...flattenTree(node.children, depth + 1)); });
  return result;
}

function AccountSelect({ value, onChange, accounts, types, placeholder = '— Not mapped —' }) {
  useT();
  // Only show postable (non-header) accounts, ordered by tree
  const postable = accounts.filter(a => !a.is_header);
  const flatSorted = flattenTree(buildTree(postable));
  const filtered = types ? flatSorted.filter(a => types.includes(a.type)) : flatSorted;

  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value || null)}
      style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
        padding: '7px 10px', color: value ? T.text : T.textDim, fontSize: 12,
        fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%',
      }}
    >
      <option value="">{placeholder}</option>
      {(types || ['revenue','cogs','expense','asset','liability','equity']).map(type => {
        const group = filtered.filter(a => a.type === type);
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

// ─── Sales Mappings Tab ───────────────────────────────────────────────────────
function SalesMappingsTab({ accounts }) {
  useT();
  const [data,    setData]    = useState(null);
  const [catMap,  setCatMap]  = useState({});   // category_id → revenue_account_id
  const [payMap,  setPayMap]  = useState({});   // payment_method → account_id
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getSalesMappings();
      setData(res.data);
      const cm = {};
      for (const m of res.data.mappings) {
        cm[m.category_id] = m.revenue_account_id;
      }
      const pm = {};
      for (const m of res.data.paymentMappings) {
        pm[m.payment_method] = m.account_id;
      }
      setCatMap(cm);
      setPayMap(pm);
    } catch { toast.error('Failed to load sales mappings'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const categoryMappings = (data?.categories || []).map(c => ({
        category_id: c.id, revenue_account_id: catMap[c.id] || null,
      }));
      const paymentMappings = PAYMENT_METHODS.map(pm => ({
        payment_method: pm.key, account_id: payMap[pm.key] || null,
      }));
      await saveSalesMappings({ categoryMappings, paymentMappings });
      toast.success('Sales GL mappings saved!');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  if (!data) return <Spinner />;

  return (
    <div>
      {/* Info banner */}
      <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 12, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: T.textMid }}>
        <strong style={{ color: T.text }}>How it works:</strong> When an order is marked as paid, RestaurantOS automatically creates a journal entry.
        Map each menu category to a revenue GL account, and each payment method to a debit (cash/bank) account.
      </div>

      {/* Category → Revenue Account */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Menu Category → Revenue Account</div>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 16 }}>
          When a sale is made from this category, it will credit the mapped revenue account.
        </div>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Category</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Revenue GL Account (Credit)</th>
              </tr>
            </thead>
            <tbody>
              {(data.categories || []).map((cat, i) => (
                <tr key={cat.id} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: T.text, fontSize: 13 }}>{cat.name}</td>
                  <td style={{ padding: '8px 16px' }}>
                    <AccountSelect
                      value={catMap[cat.id]}
                      onChange={v => setCatMap(p => ({ ...p, [cat.id]: v }))}
                      accounts={accounts}
                      types={['revenue']}
                    />
                  </td>
                </tr>
              ))}
              {(!data.categories || data.categories.length === 0) && (
                <tr><td colSpan={2} style={{ padding: '20px 16px', textAlign: 'center', color: T.textDim, fontSize: 13 }}>No menu categories found. Create categories in Menu settings.</td></tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Payment Method → Debit Account */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Payment Method → Debit Account</div>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 16 }}>
          When a sale is paid by this method, it will debit the mapped asset/cash account.
        </div>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Payment Method</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Debit GL Account (Cash / Bank)</th>
              </tr>
            </thead>
            <tbody>
              {PAYMENT_METHODS.map((pm, i) => (
                <tr key={pm.key} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 600, color: T.text, fontSize: 13 }}>{pm.label}</td>
                  <td style={{ padding: '8px 16px' }}>
                    <AccountSelect
                      value={payMap[pm.key]}
                      onChange={v => setPayMap(p => ({ ...p, [pm.key]: v }))}
                      accounts={accounts}
                      types={['asset']}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Btn onClick={save} disabled={saving} size="lg">
        {saving ? '⏳ Saving…' : '✓ Save Sales GL Mappings'}
      </Btn>
    </div>
  );
}

// ─── Inventory Mappings Tab ───────────────────────────────────────────────────
function InventoryMappingsTab({ accounts }) {
  useT();
  const [data,   setData]   = useState(null);
  const [mapObj, setMapObj] = useState({});  // item_id → {asset_account_id, expense_account_id}
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getInventoryMappings();
      setData(res.data);
      const m = {};
      for (const r of res.data.mappings) {
        m[r.inventory_item_id] = { asset_account_id: r.asset_account_id, expense_account_id: r.expense_account_id };
      }
      setMapObj(m);
    } catch { toast.error('Failed to load inventory mappings'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (itemId, field, val) => setMapObj(p => ({
    ...p, [itemId]: { ...(p[itemId] || {}), [field]: val },
  }));

  const save = async () => {
    setSaving(true);
    try {
      const mappings = (data?.items || []).map(item => ({
        inventory_item_id: item.id,
        asset_account_id:   mapObj[item.id]?.asset_account_id   || null,
        expense_account_id: mapObj[item.id]?.expense_account_id || null,
      }));
      await saveInventoryMappings({ mappings });
      toast.success('Inventory GL mappings saved!');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  if (!data) return <Spinner />;

  // Group items by category
  const byCategory = {};
  for (const item of (data.items || [])) {
    const cat = item.category || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }

  return (
    <div>
      <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 12, padding: '12px 16px', marginBottom: 24, fontSize: 13, color: T.textMid }}>
        <strong style={{ color: T.text }}>How it works:</strong> When inventory stock is purchased, RestaurantOS debits the Inventory Asset account and credits Cash.
        When stock is used or wasted, it debits the COGS/Expense account and credits the Inventory Asset account.
      </div>

      {Object.entries(byCategory).map(([cat, items]) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', padding: '8px 16px', background: T.surface, borderRadius: '10px 10px 0 0', borderBottom: `1px solid ${T.border}` }}>
            {cat}
          </div>
          <Card style={{ padding: 0, borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Item</th>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>Inventory Asset Account (Dr on purchase, Cr on usage)</th>
                  <th style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.8, textTransform: 'uppercase', fontWeight: 600 }}>COGS / Expense Account (Dr on usage/waste)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} style={{ borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                    <td style={{ padding: '8px 16px', fontSize: 13, color: T.text, fontWeight: 500 }}>
                      {item.name}
                      <span style={{ fontSize: 10, color: T.textDim, marginLeft: 6 }}>{item.unit}</span>
                    </td>
                    <td style={{ padding: '6px 16px' }}>
                      <AccountSelect
                        value={mapObj[item.id]?.asset_account_id}
                        onChange={v => set(item.id, 'asset_account_id', v)}
                        accounts={accounts}
                        types={['asset']}
                        placeholder="— Not mapped —"
                      />
                    </td>
                    <td style={{ padding: '6px 16px' }}>
                      <AccountSelect
                        value={mapObj[item.id]?.expense_account_id}
                        onChange={v => set(item.id, 'expense_account_id', v)}
                        accounts={accounts}
                        types={['cogs', 'expense']}
                        placeholder="— Not mapped —"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      ))}

      {Object.keys(byCategory).length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 14 }}>No inventory items found. Add items in Inventory first.</div>
        </div>
      )}

      {Object.keys(byCategory).length > 0 && (
        <Btn onClick={save} disabled={saving} size="lg" style={{ marginTop: 8 }}>
          {saving ? '⏳ Saving…' : '✓ Save Inventory GL Mappings'}
        </Btn>
      )}
    </div>
  );
}

// ─── Main GLSetup Page ────────────────────────────────────────────────────────
export default function GLSetup() {
  useT();
  const [tab,      setTab]      = useState('sales');
  const [accounts, setAccounts] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    import('../../services/api').then(({ getGLAccounts }) => {
      getGLAccounts()
        .then(r => setAccounts(r.data))
        .catch(() => toast.error('Failed to load GL accounts'))
        .finally(() => setLoading(false));
    });
  }, []);

  const tabStyle = (t) => ({
    padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500,
    background: tab === t ? T.accent : 'transparent', color: tab === t ? '#000' : T.textMid,
    border: `1px solid ${tab === t ? T.accent : T.border}`, fontFamily: "'Inter', sans-serif", transition: 'all 0.2s',
  });

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="⚙️ GL Setup"
        subtitle="Link menu categories and inventory items to GL accounts for automatic journal entries"
      />

      {accounts.length === 0 && (
        <div style={{ background: `${T.red}22`, border: `1px solid ${T.red}44`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: T.red }}>
          ⚠️ No GL accounts found. Please create accounts in the <strong>General Ledger</strong> first before setting up mappings.
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <button style={tabStyle('sales')}     onClick={() => setTab('sales')}>Sales Mappings</button>
        <button style={tabStyle('inventory')} onClick={() => setTab('inventory')}>Inventory Mappings</button>
      </div>

      {tab === 'sales'     && <SalesMappingsTab     accounts={accounts} />}
      {tab === 'inventory' && <InventoryMappingsTab accounts={accounts} />}
    </div>
  );
}
