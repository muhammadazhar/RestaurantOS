import React, { useEffect, useState } from 'react';
import { getDiscountPresets, createDiscountPreset, updateDiscountPreset, deleteDiscountPreset } from '../../services/api';
import { Card, Btn, Modal, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const EMPTY = { name: '', type: 'percent', value: '', is_active: true, sort_order: 0 };

export default function DiscountPresets() {
  useT();
  const [presets, setPresets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(false);
  const [editing, setEditing] = useState(null); // null = new
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    getDiscountPresets()
      .then(r => setPresets(r.data))
      .catch(() => toast.error('Failed to load presets'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openNew  = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (p) => { setEditing(p); setForm({ name: p.name, type: p.type, value: p.value, is_active: p.is_active, sort_order: p.sort_order }); setModal(true); };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (!form.value || parseFloat(form.value) <= 0) return toast.error('Value must be greater than 0');
    if (form.type === 'percent' && parseFloat(form.value) > 100) return toast.error('Percent cannot exceed 100');
    setSaving(true);
    try {
      if (editing) {
        await updateDiscountPreset(editing.id, { ...form, value: parseFloat(form.value) });
        toast.success('Preset updated');
      } else {
        await createDiscountPreset({ ...form, value: parseFloat(form.value) });
        toast.success('Preset created');
      }
      setModal(false);
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save preset');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this discount preset?')) return;
    try {
      await deleteDiscountPreset(id);
      toast.success('Preset deleted');
      load();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to delete preset');
    }
  };

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: 0 }}>🏷 Discount Presets</h1>
          <p style={{ fontSize: 13, color: T.textMid, marginTop: 4 }}>Define named discounts that cashiers can apply quickly at POS</p>
        </div>
        <Btn onClick={openNew}>+ Add Preset</Btn>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: T.textDim }}>Loading…</div>
      ) : presets.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏷</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>No discount presets yet</div>
          <div style={{ fontSize: 13, color: T.textMid, marginBottom: 20 }}>Create preset discounts for quick application at POS</div>
          <Btn onClick={openNew}>+ Create First Preset</Btn>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px 80px', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.textDim, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            <span>Name</span>
            <span>Type</span>
            <span>Value</span>
            <span>Order</span>
            <span style={{ textAlign: 'right' }}>Actions</span>
          </div>
          {presets.map((p, i) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 70px 80px', gap: 12, padding: '12px 16px', borderBottom: i < presets.length - 1 ? `1px solid ${T.border}` : 'none', alignItems: 'center', background: p.is_active ? 'transparent' : T.surface + '88', opacity: p.is_active ? 1 : 0.6 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{p.name}</span>
                {!p.is_active && <span style={{ marginLeft: 8, fontSize: 10, color: T.textDim, background: T.border, borderRadius: 4, padding: '1px 6px' }}>inactive</span>}
              </div>
              <div>
                <span style={{ fontSize: 12, color: p.type === 'percent' ? T.accent : T.green, fontWeight: 600, background: p.type === 'percent' ? T.accentGlow : T.greenDim, borderRadius: 6, padding: '2px 8px' }}>
                  {p.type === 'percent' ? '%' : 'PKR'}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: T.text }}>
                {p.type === 'percent' ? `${p.value}%` : `PKR ${Number(p.value).toLocaleString()}`}
              </div>
              <div style={{ fontSize: 13, color: T.textMid }}>{p.sort_order}</div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => openEdit(p)} style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Edit</button>
                <button onClick={() => handleDelete(p.id)} style={{ background: T.redDim, border: `1px solid ${T.red}44`, color: T.red, borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>✕</button>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Edit Discount Preset' : 'New Discount Preset'} width={420}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Name */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 5 }}>Preset Name *</label>
            <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Staff Discount, Happy Hour, 10% Off"
              style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box' }} />
          </div>

          {/* Type + Value */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 5 }}>Type *</label>
              <select value={form.type} onChange={e => f('type', e.target.value)}
                style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none' }}>
                <option value="percent">Percentage (%)</option>
                <option value="flat">Flat Amount (PKR)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 5 }}>
                Value * {form.type === 'percent' ? '(%)' : '(PKR)'}
              </label>
              <input type="number" min="0" max={form.type === 'percent' ? 100 : undefined} step="0.01"
                value={form.value} onChange={e => f('value', e.target.value)} placeholder={form.type === 'percent' ? '10' : '500'}
                style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Sort order + Active */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.textMid, display: 'block', marginBottom: 5 }}>Sort Order</label>
              <input type="number" min="0" value={form.sort_order} onChange={e => f('sort_order', parseInt(e.target.value) || 0)}
                style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13, color: T.text }}>
                <input type="checkbox" checked={form.is_active} onChange={e => f('is_active', e.target.checked)}
                  style={{ width: 16, height: 16, cursor: 'pointer', accentColor: T.accent }} />
                Active (visible at POS)
              </label>
            </div>
          </div>

          {/* Preview */}
          {form.value && parseFloat(form.value) > 0 && (
            <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: T.text }}>
              💡 Example: On a PKR 2,000 order → discount of{' '}
              <b style={{ color: T.accent }}>
                PKR {form.type === 'percent'
                  ? Math.round(2000 * parseFloat(form.value) / 100).toLocaleString()
                  : Number(form.value).toLocaleString()}
              </b>
            </div>
          )}

          <Btn onClick={handleSave} disabled={saving} style={{ width: '100%', marginTop: 4 }}>
            {saving ? '⏳ Saving…' : editing ? 'Save Changes' : 'Create Preset'}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
