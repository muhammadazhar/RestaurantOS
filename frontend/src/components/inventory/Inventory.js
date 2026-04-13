import React, { useEffect, useState, useCallback } from 'react';
import {
  getInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem,
  updateStock, getTransactions, getInventoryReport,
} from '../../services/api';
import { Card, Badge, Spinner, Btn, Modal, Input, Select, PageHeader, StatCard, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = ['General','Protein','Seafood','Produce','Dairy','Dry Goods','Condiments','Beverages','Packaging','Cleaning'];
const UNITS       = ['kg','g','L','ml','pcs','box','bag','bottle','can','dozen'];
const TXN_TYPES   = [
  { value:'purchase',       label:'Purchase / Receive',  icon:'📦', color:'green',  delta:'+' },
  { value:'usage',          label:'Kitchen Usage',       icon:'🍳', color:'accent', delta:'-' },
  { value:'waste',          label:'Waste / Spoilage',    icon:'🗑', color:'red',    delta:'-' },
  { value:'adjustment',     label:'Stock Adjustment',    icon:'⚖️', color:'blue',   delta:'=' },
  { value:'adjustment_in',  label:'Adjustment (+)',      icon:'➕', color:'green',  delta:'+' },
  { value:'adjustment_out', label:'Adjustment (−)',      icon:'➖', color:'red',    delta:'-' },
];
const TXN_COLOR = { purchase:'green', usage:'accent', waste:'red', adjustment:'blue', adjustment_in:'green', adjustment_out:'red' };

const today = () => new Date().toISOString().slice(0,10);
const fmt   = (n, dec=2) => Number(n||0).toLocaleString('en-PK', { minimumFractionDigits:0, maximumFractionDigits:dec });
const fmtDT = (d) => new Date(d).toLocaleString('en-PK', { dateStyle:'short', timeStyle:'short' });

// ─── Alert helpers ────────────────────────────────────────────────────────────
const alertLevel = (item) => {
  if (Number(item.stock_quantity) <= Number(item.min_quantity) * 0.5) return 'critical';
  if (Number(item.stock_quantity) <= Number(item.min_quantity))       return 'low';
  return 'ok';
};
const AL_COLOR = (level) => ({ ok: T.green, low: T.accent, critical: T.red })[level] || T.textMid;

// ─── Stock bar ────────────────────────────────────────────────────────────────
const StockBar = ({ item }) => {
  const pct   = Math.min(100, (Number(item.stock_quantity) / Math.max(Number(item.max_quantity), 1)) * 100);
  const level = alertLevel(item);
  const color = AL_COLOR(level);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <span style={{ fontWeight:800, color, fontFamily:'monospace', minWidth:44 }}>{fmt(item.stock_quantity,3)}</span>
      <div style={{ flex:1, height:6, background:T.border, borderRadius:3, overflow:'hidden', minWidth:60 }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:3, transition:'width 0.4s' }} />
      </div>
    </div>
  );
};

// ─── Add / Edit Item Modal ────────────────────────────────────────────────────
const BLANK = { name:'', unit:'kg', stock_quantity:'0', min_quantity:'0', max_quantity:'100', cost_per_unit:'0', supplier:'', category:'General', barcode:'' };

function ItemModal({ open, onClose, onSaved, editItem }) {
  useT();
  const [form,   setForm]   = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editItem;

  useEffect(() => {
    if (open) setForm(editItem ? { ...BLANK, ...editItem } : { ...BLANK });
  }, [open, editItem]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Item name required');
    if (!form.unit)        return toast.error('Unit required');
    setSaving(true);
    try {
      if (isEdit) {
        await updateInventoryItem(editItem.id, form);
        toast.success('Item updated!');
      } else {
        await createInventoryItem(form);
        toast.success('Item added!');
      }
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit: ${editItem?.name}` : 'Add Inventory Item'} width={540}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
        <div style={{ gridColumn:'1/-1' }}>
          <Input label="Item Name *" value={form.name} onChange={set('name')} placeholder="e.g. Atlantic Salmon" />
        </div>
        <Select label="Unit *" value={form.unit} onChange={set('unit')}>
          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
        </Select>
        <Select label="Category" value={form.category} onChange={set('category')}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
        <Input label={`Opening Stock (${form.unit})`} type="number" value={form.stock_quantity} onChange={set('stock_quantity')} placeholder="0" />
        <Input label="Cost per Unit (PKR)"            type="number" value={form.cost_per_unit}   onChange={set('cost_per_unit')}   placeholder="0" />
        <Input label={`Min Level (${form.unit})`}     type="number" value={form.min_quantity}    onChange={set('min_quantity')}    placeholder="0" />
        <Input label={`Max Level (${form.unit})`}     type="number" value={form.max_quantity}    onChange={set('max_quantity')}    placeholder="100" />
        <div style={{ gridColumn:'1/-1' }}>
          <Input label="Supplier Name" value={form.supplier} onChange={set('supplier')} placeholder="e.g. Premier Meats Karachi" />
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <Input label="Barcode (optional)" value={form.barcode} onChange={set('barcode')} placeholder="Scan or enter barcode" />
        </div>
      </div>

      {/* Min/Max visual preview */}
      {(form.min_quantity || form.max_quantity) && (
        <div style={{ background:T.surface, borderRadius:10, padding:'10px 14px', marginBottom:12, fontSize:12, color:T.textMid }}>
          💡 Alert will trigger when stock falls below <b style={{ color:T.accent }}>{form.min_quantity} {form.unit}</b>.
          Max capacity is <b style={{ color:T.text }}>{form.max_quantity} {form.unit}</b>.
        </div>
      )}

      <Btn onClick={handleSave} disabled={saving} style={{ width:'100%', marginTop:4 }}>
        {saving ? '⏳ Saving…' : isEdit ? '✓ Save Changes' : '✓ Add Item'}
      </Btn>
    </Modal>
  );
}

// ─── Stock Entry Modal ────────────────────────────────────────────────────────
function StockEntryModal({ open, onClose, onSaved, item, items }) {
  useT();
  const [selectedItem, setSelectedItem] = useState(null);
  const [form,   setForm]   = useState({ type:'purchase', quantity:'', cost_per_unit:'', notes:'', reference:'' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedItem(item || null);
      setForm({ type:'purchase', quantity:'', cost_per_unit: item?.cost_per_unit || '', notes:'', reference:'' });
    }
  }, [open, item]);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const currentItem = selectedItem || (form._item_id && items.find(i => i.id === form._item_id));

  const handleSave = async () => {
    const target = selectedItem || currentItem;
    if (!target)          return toast.error('Select an item');
    if (!form.quantity)   return toast.error('Quantity required');
    setSaving(true);
    try {
      await updateStock(target.id, {
        type:         form.type,
        quantity:     parseFloat(form.quantity),
        cost_per_unit: form.cost_per_unit ? parseFloat(form.cost_per_unit) : undefined,
        notes:        form.notes || undefined,
        reference:    form.reference || undefined,
      });
      const txn = TXN_TYPES.find(t => t.value === form.type);
      toast.success(`${txn?.icon} ${txn?.label} recorded for ${target.name}`);
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const txn    = TXN_TYPES.find(t => t.value === form.type);
  const newQty = selectedItem && form.quantity ? (() => {
    const q = parseFloat(form.quantity) || 0;
    const c = parseFloat(selectedItem.stock_quantity) || 0;
    if (form.type === 'purchase' || form.type === 'adjustment_in')  return c + q;
    if (form.type === 'usage'    || form.type === 'waste' || form.type === 'adjustment_out') return Math.max(0, c - q);
    if (form.type === 'adjustment') return q;
    return c + q;
  })() : null;

  return (
    <Modal open={open} onClose={onClose} title="Stock Entry" width={520}>
      {/* Item selector (when no pre-selected item) */}
      {!item && (
        <Select label="Item *" value={selectedItem?.id || ''} onChange={e => setSelectedItem(items.find(i => i.id === e.target.value) || null)}>
          <option value="">— Select Item —</option>
          {CATEGORIES.filter(c => items.some(i => i.category === c)).map(cat => (
            <optgroup key={cat} label={cat}>
              {items.filter(i => i.category === cat).map(i => (
                <option key={i.id} value={i.id}>{i.name} ({i.stock_quantity} {i.unit})</option>
              ))}
            </optgroup>
          ))}
        </Select>
      )}

      {/* Current stock info */}
      {selectedItem && (
        <div style={{ background:T.surface, borderRadius:12, padding:'12px 16px', marginBottom:16, display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <div>
            <div style={{ fontSize:10, color:T.textDim, textTransform:'uppercase', letterSpacing:0.8 }}>Current</div>
            <div style={{ fontSize:18, fontWeight:800, color:T.text, fontFamily:'monospace' }}>{fmt(selectedItem.stock_quantity,3)} {selectedItem.unit}</div>
          </div>
          <div>
            <div style={{ fontSize:10, color:T.textDim, textTransform:'uppercase', letterSpacing:0.8 }}>Min Level</div>
            <div style={{ fontSize:14, fontWeight:700, color:T.accent, fontFamily:'monospace' }}>{selectedItem.min_quantity} {selectedItem.unit}</div>
          </div>
          {newQty !== null && (
            <div>
              <div style={{ fontSize:10, color:T.textDim, textTransform:'uppercase', letterSpacing:0.8 }}>After Entry</div>
              <div style={{ fontSize:18, fontWeight:800, fontFamily:'monospace', color: newQty <= Number(selectedItem.min_quantity) ? T.red : T.green }}>
                {fmt(newQty,3)} {selectedItem.unit}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transaction type selector */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12, color:T.textMid, fontWeight:600, marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 }}>Transaction Type</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
          {TXN_TYPES.map(t => (
            <div key={t.value} onClick={() => setForm(f => ({ ...f, type:t.value }))} style={{
              display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderRadius:10, cursor:'pointer',
              background: form.type === t.value ? T[t.color + 'Dim'] || T.accentGlow : T.surface,
              border: `1px solid ${form.type === t.value ? T[t.color] + '66' : T.border}`,
              transition:'all 0.15s',
            }}>
              <span style={{ fontSize:18 }}>{t.icon}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:form.type===t.value?700:500, color:form.type===t.value ? T[t.color] : T.text }}>{t.label}</div>
                <div style={{ fontSize:10, color:T.textDim }}>{t.delta} stock</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 14px' }}>
        <Input
          label={`Quantity (${selectedItem?.unit || 'units'}) *`}
          type="number" min="0" value={form.quantity} onChange={set('quantity')} placeholder="0"
        />
        {(form.type === 'purchase' || form.type === 'adjustment_in') && (
          <Input
            label="Cost per Unit (PKR)"
            type="number" min="0" value={form.cost_per_unit} onChange={set('cost_per_unit')} placeholder="0"
          />
        )}
      </div>

      <Input label="Reference # (invoice, PO, etc.)" value={form.reference} onChange={set('reference')} placeholder="INV-2024-001" />
      <Input label="Notes" value={form.notes} onChange={set('notes')} placeholder="Supplier name, reason for waste, etc." />

      {/* Cost preview */}
      {form.quantity && form.cost_per_unit && (form.type === 'purchase' || form.type === 'adjustment_in') && (
        <div style={{ background:T.accentGlow, border:`1px solid ${T.accent}44`, borderRadius:10, padding:'8px 14px', marginBottom:14, fontSize:13, color:T.text }}>
          💰 Total cost: <b>PKR {fmt(parseFloat(form.quantity) * parseFloat(form.cost_per_unit))}</b>
        </div>
      )}

      <Btn onClick={handleSave} disabled={saving || !selectedItem} style={{ width:'100%', marginTop:4 }}>
        {saving ? '⏳ Saving…' : `${txn?.icon} Record ${txn?.label}`}
      </Btn>
    </Modal>
  );
}

// ─── Items Tab ────────────────────────────────────────────────────────────────
function ItemsTab({ items, onEdit, onDelete, onStockEntry, onRefresh }) {
  useT();
  const [catFilter, setCatFilter] = useState('all');
  const [search,    setSearch]    = useState('');
  const [sortBy,    setSortBy]    = useState('name');

  const usedCats = ['all', ...CATEGORIES.filter(c => items.some(i => i.category === c))];

  const filtered = items
    .filter(i => (catFilter === 'all' || i.category === catFilter) && (!search || i.name.toLowerCase().includes(search.toLowerCase())))
    .sort((a,b) => {
      if (sortBy === 'name')    return a.name.localeCompare(b.name);
      if (sortBy === 'stock')   return Number(a.stock_quantity) - Number(b.stock_quantity);
      if (sortBy === 'alert')   return ['critical','low','ok'].indexOf(alertLevel(a)) - ['critical','low','ok'].indexOf(alertLevel(b));
      if (sortBy === 'value')   return Number(b.stock_quantity)*Number(b.cost_per_unit) - Number(a.stock_quantity)*Number(a.cost_per_unit);
      return 0;
    });

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
        {/* Category pills */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {usedCats.map(c => (
            <button key={c} onClick={() => setCatFilter(c)} style={{
              background: catFilter===c ? T.accent : 'transparent', color: catFilter===c ? '#000' : T.textMid,
              border: `1px solid ${catFilter===c ? T.accent : T.border}`,
              borderRadius:20, padding:'5px 14px', fontSize:12, fontWeight:600,
              cursor:'pointer', fontFamily:"'Inter',sans-serif",
            }}>{c==='all'?'All':c}</button>
          ))}
        </div>
        {/* Search */}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search items…"
          style={{ marginLeft:'auto', background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:'7px 12px', color:T.text, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none', width:180 }} />
        {/* Sort */}
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:'7px 12px', color:T.text, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none' }}>
          <option value="name">Sort: Name</option>
          <option value="stock">Sort: Stock Level</option>
          <option value="alert">Sort: Alert Status</option>
          <option value="value">Sort: Stock Value</option>
        </select>
      </div>

      {/* Table */}
      <Card style={{ padding:0, overflow:'hidden' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr style={{ background:T.surface }}>
              {['Item','Category','Stock Level','Min','Max','Cost/Unit','Stock Value','Status','Actions'].map(h=>(
                <th key={h} style={{ padding:'11px 14px', textAlign:'left', fontSize:10, color:T.textMid, letterSpacing:0.8, textTransform:'uppercase', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0 && (
              <tr><td colSpan={9} style={{ padding:48, textAlign:'center', color:T.textDim }}>No items match your filters</td></tr>
            )}
            {filtered.map(item => {
              const level = alertLevel(item);
              const value = Number(item.stock_quantity) * Number(item.cost_per_unit);
              return (
                <tr key={item.id} style={{ borderTop:`1px solid ${T.border}` }}>
                  <td style={{ padding:'11px 14px' }}>
                    <div style={{ fontWeight:700, color:T.text, fontSize:13 }}>{item.name}</div>
                    {item.supplier && <div style={{ fontSize:10, color:T.textDim, marginTop:1 }}>📦 {item.supplier}</div>}
                    {item.barcode  && <div style={{ fontSize:10, color:T.textDim, fontFamily:'monospace' }}>🔖 {item.barcode}</div>}
                  </td>
                  <td style={{ padding:'11px 14px' }}><Badge color={T.blue} small>{item.category}</Badge></td>
                  <td style={{ padding:'11px 14px', minWidth:160 }}><StockBar item={item} /></td>
                  <td style={{ padding:'11px 14px', fontFamily:'monospace', fontSize:12, color:T.textMid }}>{item.min_quantity} {item.unit}</td>
                  <td style={{ padding:'11px 14px', fontFamily:'monospace', fontSize:12, color:T.textMid }}>{item.max_quantity} {item.unit}</td>
                  <td style={{ padding:'11px 14px', fontFamily:'monospace', fontSize:12, color:T.textMid }}>PKR {fmt(item.cost_per_unit)}</td>
                  <td style={{ padding:'11px 14px', fontFamily:'monospace', fontSize:12, fontWeight:600, color:T.accent }}>PKR {fmt(value)}</td>
                  <td style={{ padding:'11px 14px' }}><Badge color={AL_COLOR(level)} small>{level}</Badge></td>
                  <td style={{ padding:'11px 14px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      <button onClick={()=>onStockEntry(item)} style={{ background:T.accentGlow, border:`1px solid ${T.accent}44`, color:T.accent, borderRadius:7, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif", whiteSpace:'nowrap' }}>
                        + Entry
                      </button>
                      <button onClick={()=>onEdit(item)} style={{ background:T.surface, border:`1px solid ${T.border}`, color:T.textMid, borderRadius:7, padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Edit</button>
                      <button onClick={()=>onDelete(item)} style={{ background:T.redDim, border:`1px solid ${T.red}44`, color:T.red, borderRadius:7, padding:'4px 10px', fontSize:11, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>Del</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr style={{ borderTop:`2px solid ${T.borderLight}`, background:T.surface }}>
                <td colSpan={5} style={{ padding:'11px 14px', fontSize:13, fontWeight:700, color:T.text }}>
                  {filtered.length} items
                </td>
                <td style={{ padding:'11px 14px' }} />
                <td style={{ padding:'11px 14px', fontFamily:'monospace', fontSize:13, fontWeight:800, color:T.accent }}>
                  PKR {fmt(filtered.reduce((s,i)=>s+Number(i.stock_quantity)*Number(i.cost_per_unit),0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </Card>
    </div>
  );
}

// ─── Transactions Tab ─────────────────────────────────────────────────────────
function TransactionsTab({ items }) {
  useT();
  const [txns,    setTxns]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeF,   setTypeF]   = useState('all');
  const [itemF,   setItemF]   = useState('all');
  const [dateFrom,setDateFrom]= useState('');
  const [dateTo,  setDateTo]  = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const params = { limit: 200 };
    if (typeF !== 'all') params.type    = typeF;
    if (itemF !== 'all') params.item_id = itemF;
    if (dateFrom)        params.from    = dateFrom;
    if (dateTo)          params.to      = dateTo;
    getTransactions(params)
      .then(r => setTxns(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [typeF, itemF, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const TXN_COLOR_MAP = { purchase:T.green, usage:T.accent, waste:T.red, adjustment:T.blue, adjustment_in:T.green, adjustment_out:T.red };

  return (
    <div>
      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'flex-end' }}>
        <select value={typeF} onChange={e=>setTypeF(e.target.value)}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 12px', color:T.text, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none' }}>
          <option value="all">All Types</option>
          {TXN_TYPES.map(t=><option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
        </select>
        <select value={itemF} onChange={e=>setItemF(e.target.value)}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 12px', color:T.text, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none' }}>
          <option value="all">All Items</option>
          {items.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 12px', color:T.text, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none' }} />
        <span style={{ color:T.textDim, fontSize:12 }}>to</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:8, padding:'8px 12px', color:T.text, fontSize:12, fontFamily:"'Inter',sans-serif", outline:'none' }} />
        {(typeF!=='all'||itemF!=='all'||dateFrom||dateTo) && (
          <button onClick={()=>{setTypeF('all');setItemF('all');setDateFrom('');setDateTo('');}}
            style={{ background:'none', border:'none', color:T.textMid, cursor:'pointer', fontSize:18 }}>×</button>
        )}
        <span style={{ marginLeft:'auto', fontSize:12, color:T.textMid }}>{txns.length} transactions</span>
      </div>

      {loading ? <Spinner /> : txns.length===0 ? (
        <div style={{ textAlign:'center', padding:60, color:T.textDim }}>
          <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
          <div>No transactions found</div>
        </div>
      ) : (
        <Card style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:T.surface }}>
                {['Date','Item','Type','Quantity','Cost/Unit','Total','Reference','By','Notes'].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:10, color:T.textMid, letterSpacing:0.8, textTransform:'uppercase', fontWeight:600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txns.map(t => {
                const txnDef   = TXN_TYPES.find(x=>x.value===t.type);
                const colorKey = TXN_COLOR_MAP[t.type] || T.textMid;
                return (
                  <tr key={t.id} style={{ borderTop:`1px solid ${T.border}` }}>
                    <td style={{ padding:'10px 14px', fontSize:11, color:T.textMid, whiteSpace:'nowrap' }}>{fmtDT(t.created_at)}</td>
                    <td style={{ padding:'10px 14px', fontWeight:700, fontSize:13, color:T.text }}>{t.item_name}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span>{txnDef?.icon}</span>
                        <Badge color={colorKey} small>{t.type.replace('_',' ')}</Badge>
                      </div>
                    </td>
                    <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:13, fontWeight:700, color:colorKey }}>
                      {txnDef?.delta} {fmt(t.quantity,3)} {t.unit}
                    </td>
                    <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, color:T.textMid }}>
                      {t.cost_per_unit ? `PKR ${fmt(t.cost_per_unit)}` : '—'}
                    </td>
                    <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, fontWeight:600, color:T.text }}>
                      {t.total_cost ? `PKR ${fmt(t.total_cost)}` : '—'}
                    </td>
                    <td style={{ padding:'10px 14px', fontSize:11, color:T.textMid, fontFamily:'monospace' }}>{t.reference||'—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:11, color:T.textMid }}>{t.employee_name||'—'}</td>
                    <td style={{ padding:'10px 14px', fontSize:11, color:T.textDim, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.notes||'—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ─── Alerts Tab ───────────────────────────────────────────────────────────────
function AlertsTab({ items, onStockEntry }) {
  useT();
  const critical = items.filter(i=>alertLevel(i)==='critical');
  const low      = items.filter(i=>alertLevel(i)==='low');

  const AlertCard = ({ item, level }) => (
    <div style={{
      display:'flex', alignItems:'center', gap:14, padding:'14px 18px',
      background: level==='critical' ? 'rgba(231,76,60,0.08)' : 'rgba(245,166,35,0.08)',
      border: `1px solid ${level==='critical' ? T.red : T.accent}44`,
      borderLeft: `4px solid ${level==='critical' ? T.red : T.accent}`,
      borderRadius:12, marginBottom:8,
    }}>
      <div style={{ fontSize:28 }}>{level==='critical'?'🚨':'⚠️'}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:14, color:T.text }}>{item.name}</div>
        <div style={{ fontSize:12, color:T.textMid, marginTop:2 }}>
          <span style={{ color:level==='critical'?T.red:T.accent, fontWeight:700, fontFamily:'monospace' }}>{fmt(item.stock_quantity,3)} {item.unit}</span>
          {' remaining · min: '}
          <span style={{ fontFamily:'monospace' }}>{item.min_quantity} {item.unit}</span>
          {item.supplier && ` · Supplier: ${item.supplier}`}
        </div>
        <StockBar item={item} />
      </div>
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <div style={{ fontSize:11, color:T.textDim, marginBottom:6 }}>Need to reorder:</div>
        <div style={{ fontFamily:'monospace', fontWeight:800, fontSize:15, color:level==='critical'?T.red:T.accent }}>
          {fmt(Number(item.max_quantity)-Number(item.stock_quantity),0)} {item.unit}
        </div>
        <button onClick={()=>onStockEntry(item)} style={{ marginTop:8, background:T.accent, color:'#000', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'Inter',sans-serif" }}>
          + Receive Stock
        </button>
      </div>
    </div>
  );

  if (critical.length===0 && low.length===0) {
    return (
      <div style={{ textAlign:'center', padding:80, color:T.textDim }}>
        <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
        <div style={{ fontSize:18, fontWeight:700, color:T.green, marginBottom:8 }}>All stock levels are healthy!</div>
        <div style={{ fontSize:13 }}>No items are below their minimum threshold.</div>
      </div>
    );
  }

  return (
    <div>
      {critical.length>0 && (
        <>
          <div style={{ fontSize:11, fontWeight:700, color:T.red, letterSpacing:1.2, textTransform:'uppercase', marginBottom:12 }}>
            🚨 Critical ({critical.length}) — Immediate action required
          </div>
          {critical.map(i=><AlertCard key={i.id} item={i} level="critical" />)}
        </>
      )}
      {low.length>0 && (
        <>
          <div style={{ fontSize:11, fontWeight:700, color:T.accent, letterSpacing:1.2, textTransform:'uppercase', margin:'20px 0 12px' }}>
            ⚠️ Low Stock ({low.length}) — Order soon
          </div>
          {low.map(i=><AlertCard key={i.id} item={i} level="low" />)}
        </>
      )}
    </div>
  );
}

// ─── Report Tab ───────────────────────────────────────────────────────────────
function ReportTab() {
  useT();
  const [report,  setReport]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInventoryReport()
      .then(r => setReport(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner />;
  if (!report) return <div style={{ color:T.textDim, padding:60, textAlign:'center' }}>No report data</div>;

  const { summary, byCategory, topUsage } = report;
  const totalValue = Number(summary.total_stock_value || 0);

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display:'flex', gap:14, marginBottom:24, flexWrap:'wrap' }}>
        <StatCard label="Total Items"   value={summary.total_items}    color={T.accent}  icon="📦" />
        <StatCard label="Stock Value"   value={`PKR ${fmt(totalValue)}`} color={T.green}  icon="💰" />
        <StatCard label="Critical"      value={summary.critical_items || 0} color={T.red}   icon="🚨" />
        <StatCard label="Low Stock"     value={summary.low_items || 0}      color={T.accent} icon="⚠️" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* By Category */}
        <Card>
          <div style={{ fontSize:14, fontWeight:800, color:T.text, marginBottom:16 }}>📊 Stock Value by Category</div>
          {byCategory.map(cat => {
            const pct = totalValue > 0 ? Math.round((Number(cat.category_value||0)/totalValue)*100) : 0;
            return (
              <div key={cat.category} style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <span style={{ fontSize:13, color:T.text, fontWeight:600 }}>{cat.category}</span>
                  <span style={{ fontSize:12, fontFamily:'monospace', color:T.accent }}>PKR {fmt(cat.category_value||0)} <span style={{ color:T.textDim }}>({pct}%)</span></span>
                </div>
                <div style={{ height:6, background:T.border, borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct}%`, background:T.accent, borderRadius:3 }} />
                </div>
                <div style={{ fontSize:11, color:T.textDim, marginTop:3 }}>{cat.item_count} items</div>
              </div>
            );
          })}
        </Card>

        {/* Top usage */}
        <Card>
          <div style={{ fontSize:14, fontWeight:800, color:T.text, marginBottom:16 }}>🔥 Top Used Items (Last 30 Days)</div>
          {topUsage.length===0 && <div style={{ color:T.textDim, fontSize:13 }}>No usage data yet</div>}
          {topUsage.map((item, i) => (
            <div key={item.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'8px 0', borderBottom:`1px solid ${T.border}` }}>
              <div style={{ width:24, height:24, borderRadius:'50%', background:i<3?T.accentGlow:T.surface, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:T.accent, flexShrink:0 }}>
                {i+1}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{item.name}</div>
                <div style={{ fontSize:11, color:T.textMid }}>{item.category}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:'monospace', fontSize:13, fontWeight:700, color:T.red }}>
                  −{fmt(item.used_qty||0,1)} {item.unit}
                </div>
                {item.purchase_cost && (
                  <div style={{ fontSize:11, color:T.textMid }}>Purchased: PKR {fmt(item.purchase_cost)}</div>
                )}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ─── Main Inventory Page ──────────────────────────────────────────────────────
export default function InventoryPage() {
  useT();
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState('items');
  const [itemModal,   setItemModal]   = useState(false);
  const [editItem,    setEditItem]    = useState(null);
  const [stockModal,  setStockModal]  = useState(false);
  const [stockTarget, setStockTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    getInventory()
      .then(r => setItems(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      await deleteInventoryItem(item.id);
      toast.success('Item deleted');
      load();
    } catch { toast.error('Delete failed'); }
  };

  const openStockEntry = (item = null) => { setStockTarget(item); setStockModal(true); };

  const critical = items.filter(i=>alertLevel(i)==='critical').length;
  const low      = items.filter(i=>alertLevel(i)==='low').length;

  const tabStyle = (t) => ({
    padding:'8px 18px', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight: tab===t ? 700 : 500,
    background: tab===t ? T.accent : 'transparent', color: tab===t ? '#000' : T.textMid,
    border: `1px solid ${tab===t ? T.accent : T.border}`, fontFamily:"'Inter',sans-serif",
    position:'relative',
  });

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="📦 Inventory Management"
        subtitle={`${items.length} items · PKR ${fmt(items.reduce((s,i)=>s+Number(i.stock_quantity)*Number(i.cost_per_unit),0))} total value`}
        action={
          <div style={{ display:'flex', gap:10 }}>
            <Btn variant="ghost" onClick={() => openStockEntry()}>+ Stock Entry</Btn>
            <Btn onClick={() => { setEditItem(null); setItemModal(true); }}>+ Add Item</Btn>
          </div>
        }
      />

      {/* Summary row */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        {[
          ['Total Items',    items.length,                                            T.accent,  '📦'],
          ['Total Value',    `PKR ${fmt(items.reduce((s,i)=>s+Number(i.stock_quantity)*Number(i.cost_per_unit),0))}`, T.green, '💰'],
          ['Critical',       critical,                                                T.red,     '🚨'],
          ['Low Stock',      low,                                                     T.accent,  '⚠️'],
          ['Healthy',        items.filter(i=>alertLevel(i)==='ok').length,           T.green,   '✅'],
        ].map(([l,v,c,ic]) => (
          <div key={l} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:'10px 16px', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:16 }}>{ic}</span>
            <span style={{ fontSize:12, color:T.textMid }}>{l}</span>
            <span style={{ fontSize:16, fontWeight:800, color:c, fontFamily:'monospace' }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        <button style={tabStyle('items')}        onClick={()=>setTab('items')}>📋 Items</button>
        <button style={tabStyle('transactions')} onClick={()=>setTab('transactions')}>📝 Transactions</button>
        <button style={{ ...tabStyle('alerts'), ...(critical+low>0 ? { borderColor: T.red + '66' } : {}) }}
          onClick={()=>setTab('alerts')}>
          {critical+low>0 ? `🚨 Alerts (${critical+low})` : '✅ Alerts'}
        </button>
        <button style={tabStyle('report')}  onClick={()=>setTab('report')}>📊 Report</button>
      </div>

      {tab==='items'        && <ItemsTab items={items} onEdit={i=>{setEditItem(i);setItemModal(true);}} onDelete={handleDelete} onStockEntry={openStockEntry} onRefresh={load} />}
      {tab==='transactions' && <TransactionsTab items={items} />}
      {tab==='alerts'       && <AlertsTab items={items} onStockEntry={openStockEntry} />}
      {tab==='report'       && <ReportTab />}

      <ItemModal
        open={itemModal}
        onClose={()=>{setItemModal(false);setEditItem(null);}}
        onSaved={load}
        editItem={editItem}
      />
      <StockEntryModal
        open={stockModal}
        onClose={()=>{setStockModal(false);setStockTarget(null);}}
        onSaved={load}
        item={stockTarget}
        items={items}
      />
    </div>
  );
}
