import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth }  from '../../context/AuthContext';
import toast from 'react-hot-toast';
import {
  getDeliveryZones, createDeliveryZone, updateDeliveryZone, deleteDeliveryZone,
  getDeliveryAreas, createDeliveryArea, updateDeliveryArea, deleteDeliveryArea,
  getSurgeRules, createSurgeRule, updateSurgeRule, deleteSurgeRule,
  getCustomerRules, createCustomerRule, updateCustomerRule, deleteCustomerRule,
  getRestaurantLocation, saveRestaurantLocation,
} from '../../services/api';

// ── Shared helpers ────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toLocaleString();

function useLoad(fn) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    fn().then(r => setData(r.data)).catch(e => toast.error(e.response?.data?.error || e.message)).finally(() => setLoading(false));
  }, [fn]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, reload: load };
}

// ── Simple inline form modal ──────────────────────────────────────────────────
function Modal({ open, onClose, title, children }) {
  const { theme: T } = useTheme();
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: T.surface, borderRadius: 16, padding: 28, minWidth: 380, maxWidth: 520, width: '90%', border: `1px solid ${T.border}`, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.textMid, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children, style }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ label, ...props }) {
  const { theme: T } = useTheme();
  const inp = (
    <input
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '9px 12px',
        borderRadius: 8, border: `1px solid ${T.border}`,
        background: T.card, color: T.text, fontSize: 13, outline: 'none',
        ...props.style,
      }}
    />
  );
  return label ? <Field label={label}>{inp}</Field> : inp;
}

function Select({ label, children, ...props }) {
  const { theme: T } = useTheme();
  const sel = (
    <select
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box', padding: '9px 12px',
        borderRadius: 8, border: `1px solid ${T.border}`,
        background: T.card, color: T.text, fontSize: 13, outline: 'none',
        ...props.style,
      }}
    >
      {children}
    </select>
  );
  return label ? <Field label={label}>{sel}</Field> : sel;
}

function Toggle({ label, checked, onChange }) {
  const { theme: T } = useTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 40, height: 22, borderRadius: 11, cursor: 'pointer', transition: 'background 0.2s',
          background: checked ? T.accent : T.border, position: 'relative', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3, width: 16, height: 16,
          borderRadius: '50%', background: checked ? '#000' : T.surface, transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: 13, color: T.text }}>{label}</span>
    </div>
  );
}

function Btn({ children, variant = 'primary', size = 'md', onClick, disabled, style }) {
  const { theme: T } = useTheme();
  const base = {
    padding: size === 'sm' ? '5px 12px' : '9px 18px',
    borderRadius: 8, fontSize: size === 'sm' ? 12 : 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', border: 'none',
    opacity: disabled ? 0.6 : 1, transition: 'opacity 0.15s',
  };
  const variants = {
    primary: { background: T.accent, color: '#fff' },
    ghost: { background: 'transparent', color: T.textMid, border: `1px solid ${T.border}` },
    danger: { background: T.red, color: '#fff' },
  };
  return (
    <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[variant], ...style }}>
      {children}
    </button>
  );
}

function Badge({ children, color }) {
  return (
    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: color + '22', color, display: 'inline-block' }}>
      {children}
    </span>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'zones',     label: '🗺 Zones' },
  { id: 'areas',     label: '📍 Areas' },
  { id: 'surge',     label: '⚡ Surge Rules' },
  { id: 'vip',       label: '👑 VIP Customers' },
  { id: 'location',  label: '📌 Restaurant Location' },
];

// ─────────────────────────────────────────────────────────────────────────────
// ZONES TAB
// ─────────────────────────────────────────────────────────────────────────────
function ZonesTab() {
  const { theme: T } = useTheme();
  const { data: zones, loading, reload } = useLoad(getDeliveryZones);
  const [modal, setModal] = useState(null); // null | 'create' | zone obj
  const empty = { name: '', sort_order: 0, min_km: 0, max_km: '', customer_fee: '', rider_payout: '', is_active: true };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const open = (zone) => { setForm(zone ? { ...zone } : { ...empty }); setModal(zone || 'create'); };
  const close = () => setModal(null);

  const save = async () => {
    if (!form.name || form.customer_fee === '') return toast.error('Name and customer fee required');
    setSaving(true);
    try {
      const payload = { ...form, max_km: form.max_km === '' ? null : form.max_km };
      if (modal === 'create') await createDeliveryZone(payload);
      else await updateDeliveryZone(modal.id, payload);
      toast.success(modal === 'create' ? 'Zone created' : 'Zone updated');
      reload(); close();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this zone?')) return;
    try { await deleteDeliveryZone(id); toast.success('Deleted'); reload(); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Delivery Zones</div>
          <div style={{ fontSize: 12, color: T.textMid }}>Define zones with customer fee and rider payout. Zones are matched by polygon → distance range (in order).</div>
        </div>
        <Btn onClick={() => open(null)}>+ Add Zone</Btn>
      </div>

      {zones.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: T.textDim, background: T.card, borderRadius: 12 }}>
          No delivery zones yet. Click "+ Add Zone" to create one.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {zones.map(z => (
          <div key={z.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: T.text }}>{z.name}</span>
                <Badge color={z.is_active ? '#2ECC71' : '#6B7280'}>{z.is_active ? 'Active' : 'Inactive'}</Badge>
                {z.polygon && <Badge color="#3498DB">Polygon</Badge>}
              </div>
              <div style={{ display: 'flex', gap: 24, fontSize: 12, color: T.textMid }}>
                <span>Range: {z.min_km}km – {z.max_km != null ? z.max_km + 'km' : '∞'}</span>
                <span style={{ color: T.text, fontWeight: 700 }}>Customer: PKR {fmt(z.customer_fee)}</span>
                <span>Rider: PKR {fmt(z.rider_payout)}</span>
                <span>Margin: PKR {fmt((z.customer_fee || 0) - (z.rider_payout || 0))}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" variant="ghost" onClick={() => open(z)}>Edit</Btn>
              <Btn size="sm" variant="danger" onClick={() => remove(z.id)}>Delete</Btn>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!modal} onClose={close} title={modal === 'create' ? 'New Zone' : `Edit Zone: ${form.name}`}>
        <Input label="Zone Name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Zone 1 – Near" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Min KM" type="number" step="0.1" value={form.min_km} onChange={e => set('min_km', e.target.value)} />
          <Input label="Max KM (blank = unlimited)" type="number" step="0.1" value={form.max_km} onChange={e => set('max_km', e.target.value)} placeholder="∞" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Customer Fee (PKR)" type="number" step="1" value={form.customer_fee} onChange={e => set('customer_fee', e.target.value)} />
          <Input label="Rider Payout (PKR)" type="number" step="1" value={form.rider_payout} onChange={e => set('rider_payout', e.target.value)} />
        </div>
        <Input label="Sort Order" type="number" value={form.sort_order} onChange={e => set('sort_order', e.target.value)} />
        <Toggle label="Active" checked={form.is_active} onChange={v => set('is_active', v)} />
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12, color: T.textMid }}>
          <strong style={{ color: T.text }}>Margin preview:</strong>{' '}
          Customer PKR {fmt(form.customer_fee)} − Rider PKR {fmt(form.rider_payout)} = <strong style={{ color: (form.customer_fee - form.rider_payout) >= 0 ? '#2ECC71' : '#E74C3C' }}>PKR {fmt((form.customer_fee || 0) - (form.rider_payout || 0))}</strong>
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={close}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Zone'}</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AREAS TAB
// ─────────────────────────────────────────────────────────────────────────────
function AreasTab() {
  const { theme: T } = useTheme();
  const { data: areas, loading, reload }  = useLoad(getDeliveryAreas);
  const { data: zones }                   = useLoad(getDeliveryZones);
  const [modal,  setModal]  = useState(null);
  const empty = { zone_id: '', name: '', lat: '', lng: '', is_active: true };
  const [form,   setForm]   = useState(empty);
  const [saving, setSaving] = useState(false);

  const open = (area) => { setForm(area ? { ...area } : { ...empty }); setModal(area || 'create'); };
  const close = () => setModal(null);

  const save = async () => {
    if (!form.zone_id || !form.name) return toast.error('Zone and area name required');
    setSaving(true);
    try {
      if (modal === 'create') await createDeliveryArea(form);
      else await updateDeliveryArea(modal.id, form);
      toast.success(modal === 'create' ? 'Area created' : 'Area updated');
      reload(); close();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this area?')) return;
    try { await deleteDeliveryArea(id); toast.success('Deleted'); reload(); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>Loading…</div>;

  // Group areas by zone
  const byZone = zones.reduce((acc, z) => {
    acc[z.id] = { zone: z, items: areas.filter(a => a.zone_id === z.id) };
    return acc;
  }, {});
  const unmapped = areas.filter(a => !zones.find(z => z.id === a.zone_id));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Delivery Areas</div>
          <div style={{ fontSize: 12, color: T.textMid }}>Map named neighbourhoods/areas to zones. E.g. "Nazimabad" → Zone 1.</div>
        </div>
        <Btn onClick={() => open(null)}>+ Add Area</Btn>
      </div>

      {areas.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: T.textDim, background: T.card, borderRadius: 12 }}>
          No areas yet. Add areas to enable name-based zone lookup on orders.
        </div>
      )}

      {Object.values(byZone).filter(g => g.items.length > 0).map(({ zone, items }) => (
        <div key={zone.id} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            {zone.name} — PKR {fmt(zone.customer_fee)} / Rider {fmt(zone.rider_payout)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map(a => (
              <div key={a.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontWeight: 700, color: T.text, flex: 1 }}>{a.name}</span>
                {(a.lat && a.lng) && <span style={{ fontSize: 11, color: T.textDim }}>📍 {parseFloat(a.lat).toFixed(4)}, {parseFloat(a.lng).toFixed(4)}</span>}
                <Badge color={a.is_active ? '#2ECC71' : '#6B7280'}>{a.is_active ? 'Active' : 'Off'}</Badge>
                <Btn size="sm" variant="ghost" onClick={() => open(a)}>Edit</Btn>
                <Btn size="sm" variant="danger" onClick={() => remove(a.id)}>Delete</Btn>
              </div>
            ))}
          </div>
        </div>
      ))}
      {unmapped.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.red, marginBottom: 8 }}>⚠ Unmapped Areas</div>
          {unmapped.map(a => (
            <div key={a.id} style={{ background: T.card, border: `1px solid ${T.red}44`, borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: T.text, flex: 1 }}>{a.name}</span>
              <Btn size="sm" variant="ghost" onClick={() => open(a)}>Fix</Btn>
              <Btn size="sm" variant="danger" onClick={() => remove(a.id)}>Delete</Btn>
            </div>
          ))}
        </div>
      )}

      <Modal open={!!modal} onClose={close} title={modal === 'create' ? 'New Area' : `Edit: ${form.name}`}>
        <Select label="Zone" value={form.zone_id} onChange={e => set('zone_id', e.target.value)}>
          <option value="">Select zone…</option>
          {zones.map(z => <option key={z.id} value={z.id}>{z.name} (PKR {fmt(z.customer_fee)})</option>)}
        </Select>
        <Input label="Area Name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Nazimabad, Block 5" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Lat (optional)" type="number" step="0.0001" value={form.lat} onChange={e => set('lat', e.target.value)} placeholder="24.8607" />
          <Input label="Lng (optional)" type="number" step="0.0001" value={form.lng} onChange={e => set('lng', e.target.value)} placeholder="67.0011" />
        </div>
        <Toggle label="Active" checked={form.is_active} onChange={v => set('is_active', v)} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={close}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Area'}</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SURGE RULES TAB
// ─────────────────────────────────────────────────────────────────────────────
const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function SurgeTab() {
  const { theme: T } = useTheme();
  const { data: rules, loading, reload } = useLoad(getSurgeRules);
  const [modal, setModal] = useState(null);
  const empty = { name: '', trigger_type: 'peak_hours', start_time: '12:00', end_time: '15:00', days_of_week: '1,2,3,4,5,6,7', adj_type: 'flat', adj_value: 0, is_active: true };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const open = (r) => { setForm(r ? { ...r } : { ...empty }); setModal(r || 'create'); };
  const close = () => setModal(null);

  const save = async () => {
    if (!form.name) return toast.error('Rule name required');
    setSaving(true);
    try {
      if (modal === 'create') await createSurgeRule(form);
      else await updateSurgeRule(modal.id, form);
      toast.success(modal === 'create' ? 'Rule created' : 'Rule updated');
      reload(); close();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try { await deleteSurgeRule(id); toast.success('Deleted'); reload(); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDay = (day) => {
    const days = (form.days_of_week || '').split(',').map(Number).filter(Boolean);
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => a - b);
    set('days_of_week', next.join(',') || null);
  };

  const activeDays = (form.days_of_week || '').split(',').map(Number).filter(Boolean);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Surge Pricing Rules</div>
          <div style={{ fontSize: 12, color: T.textMid }}>Automatically add extra delivery fees during peak hours or special conditions.</div>
        </div>
        <Btn onClick={() => open(null)}>+ Add Rule</Btn>
      </div>

      {rules.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: T.textDim, background: T.card, borderRadius: 12 }}>
          No surge rules. Add a peak-hour rule to charge more during busy periods.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rules.map(r => {
          const days = (r.days_of_week || '').split(',').map(Number).filter(Boolean);
          return (
            <div key={r.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{r.name}</span>
                  <Badge color={r.is_active ? '#F5A623' : '#6B7280'}>{r.is_active ? 'Active' : 'Off'}</Badge>
                  <Badge color={r.trigger_type === 'peak_hours' ? '#3498DB' : r.trigger_type === 'manual' ? '#9B59B6' : '#1ABC9C'}>
                    {r.trigger_type === 'peak_hours' ? '⏰ Peak Hours' : r.trigger_type === 'manual' ? '🔧 Manual' : '🌧 Weather'}
                  </Badge>
                </div>
                <div style={{ fontSize: 12, color: T.textMid, display: 'flex', gap: 16 }}>
                  {r.trigger_type === 'peak_hours' && r.start_time && (
                    <span>{r.start_time?.substring(0, 5)} – {r.end_time?.substring(0, 5)}</span>
                  )}
                  {days.length > 0 && <span>{days.map(d => DAY_LABELS[d]).join(', ')}</span>}
                  <span style={{ color: T.accent, fontWeight: 700 }}>
                    +{r.adj_type === 'multiplier' ? `${r.adj_value}×` : `PKR ${fmt(r.adj_value)}`}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Btn size="sm" variant="ghost" onClick={() => open(r)}>Edit</Btn>
                <Btn size="sm" variant="danger" onClick={() => remove(r.id)}>Delete</Btn>
              </div>
            </div>
          );
        })}
      </div>

      <Modal open={!!modal} onClose={close} title={modal === 'create' ? 'New Surge Rule' : `Edit: ${form.name}`}>
        <Input label="Rule Name" value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Friday Evening Rush" />
        <Select label="Trigger Type" value={form.trigger_type} onChange={e => set('trigger_type', e.target.value)}>
          <option value="peak_hours">⏰ Peak Hours (time window)</option>
          <option value="manual">🔧 Manual (always active when enabled)</option>
          <option value="weather">🌧 Weather (activate manually via toggle)</option>
        </Select>
        {form.trigger_type === 'peak_hours' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Start Time" type="time" value={form.start_time || ''} onChange={e => set('start_time', e.target.value)} />
            <Input label="End Time" type="time" value={form.end_time || ''} onChange={e => set('end_time', e.target.value)} />
          </div>
        )}
        {form.trigger_type === 'peak_hours' && (
          <Field label="Days of Week">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1,2,3,4,5,6,7].map(d => (
                <button key={d} type="button" onClick={() => toggleDay(d)} style={{
                  padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  border: `2px solid ${activeDays.includes(d) ? '#F5A623' : '#444'}`,
                  background: activeDays.includes(d) ? '#F5A62322' : 'transparent',
                  color: activeDays.includes(d) ? '#F5A623' : '#888', cursor: 'pointer',
                }}>{DAY_LABELS[d]}</button>
              ))}
            </div>
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Select label="Adjustment Type" value={form.adj_type} onChange={e => set('adj_type', e.target.value)}>
            <option value="flat">Flat amount (PKR)</option>
            <option value="multiplier">Multiplier (e.g. 1.5×)</option>
          </Select>
          <Input label={form.adj_type === 'multiplier' ? 'Multiplier (e.g. 1.5)' : 'Extra Fee (PKR)'} type="number" step={form.adj_type === 'multiplier' ? '0.1' : '1'} value={form.adj_value} onChange={e => set('adj_value', e.target.value)} />
        </div>
        <Toggle label="Active" checked={form.is_active} onChange={v => set('is_active', v)} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={close}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Rule'}</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VIP CUSTOMERS TAB
// ─────────────────────────────────────────────────────────────────────────────
function VIPTab() {
  const { theme: T } = useTheme();
  const { data: rules, loading, reload } = useLoad(getCustomerRules);
  const [modal, setModal] = useState(null);
  const empty = { phone: '', rule_type: 'free_delivery', discount_value: 0, note: '', is_active: true };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const open = (r) => { setForm(r ? { ...r } : { ...empty }); setModal(r || 'create'); };
  const close = () => setModal(null);

  const save = async () => {
    if (!form.phone) return toast.error('Phone number required');
    setSaving(true);
    try {
      if (modal === 'create') await createCustomerRule(form);
      else await updateCustomerRule(modal.id, form);
      toast.success(modal === 'create' ? 'Rule created' : 'Rule updated');
      reload(); close();
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this rule?')) return;
    try { await deleteCustomerRule(id); toast.success('Deleted'); reload(); }
    catch (e) { toast.error(e.response?.data?.error || e.message); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const ruleLabel = (r) => {
    if (r.rule_type === 'free_delivery') return 'FREE delivery';
    if (r.rule_type === 'flat_discount')  return `-PKR ${fmt(r.discount_value)}`;
    return `-${r.discount_value}%`;
  };

  const ruleColor = (r) => r.rule_type === 'free_delivery' ? '#2ECC71' : '#3498DB';

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>VIP Customer Rules</div>
          <div style={{ fontSize: 12, color: T.textMid }}>Grant free delivery or discounts to specific phone numbers.</div>
        </div>
        <Btn onClick={() => open(null)}>+ Add Customer</Btn>
      </div>

      {rules.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: T.textDim, background: T.card, borderRadius: 12 }}>
          No VIP rules. Add a customer's phone number to give them special delivery pricing.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rules.map(r => (
          <div key={r.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 800, fontSize: 14, color: T.text, fontFamily: 'monospace' }}>{r.phone}</span>
                <Badge color={ruleColor(r)}>{ruleLabel(r)}</Badge>
                <Badge color={r.is_active ? '#2ECC71' : '#6B7280'}>{r.is_active ? 'Active' : 'Off'}</Badge>
              </div>
              {r.note && <div style={{ fontSize: 12, color: T.textMid }}>{r.note}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn size="sm" variant="ghost" onClick={() => open(r)}>Edit</Btn>
              <Btn size="sm" variant="danger" onClick={() => remove(r.id)}>Delete</Btn>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!modal} onClose={close} title={modal === 'create' ? 'New VIP Rule' : `Edit: ${form.phone}`}>
        <Input label="Customer Phone" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+923001234567" />
        <Select label="Rule Type" value={form.rule_type} onChange={e => set('rule_type', e.target.value)}>
          <option value="free_delivery">Free Delivery</option>
          <option value="flat_discount">Flat Discount (PKR)</option>
          <option value="pct_discount">Percentage Discount (%)</option>
        </Select>
        {form.rule_type !== 'free_delivery' && (
          <Input label={form.rule_type === 'flat_discount' ? 'Discount Amount (PKR)' : 'Discount (%)'} type="number" step="1" value={form.discount_value} onChange={e => set('discount_value', e.target.value)} />
        )}
        <Input label="Note (optional)" value={form.note} onChange={e => set('note', e.target.value)} placeholder="e.g. Owner family member" />
        <Toggle label="Active" checked={form.is_active} onChange={v => set('is_active', v)} />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={close}>Cancel</Btn>
          <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Rule'}</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESTAURANT LOCATION TAB
// ─────────────────────────────────────────────────────────────────────────────
function LocationTab() {
  const { theme: T } = useTheme();
  const [loc, setLoc]     = useState({ lat: '', lng: '' });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    getRestaurantLocation().then(r => setLoc({ lat: r.data.lat || '', lng: r.data.lng || '' })).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!loc.lat || !loc.lng) return toast.error('Both lat and lng required');
    setSaving(true);
    try {
      await saveRestaurantLocation(loc);
      toast.success('Location saved');
    } catch (e) { toast.error(e.response?.data?.error || e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>Loading…</div>;

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>Restaurant Origin Location</div>
      <div style={{ fontSize: 12, color: T.textMid, marginBottom: 20 }}>
        Used as the origin point for distance-based zone matching (Haversine formula).
        Enter your restaurant's GPS coordinates.
      </div>

      <div style={{ background: T.card, borderRadius: 12, border: `1px solid ${T.border}`, padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Input label="Latitude" type="number" step="0.0001" value={loc.lat} onChange={e => setLoc(l => ({ ...l, lat: e.target.value }))} placeholder="e.g. 24.8607" />
          <Input label="Longitude" type="number" step="0.0001" value={loc.lng} onChange={e => setLoc(l => ({ ...l, lng: e.target.value }))} placeholder="e.g. 67.0011" />
        </div>
        <div style={{ fontSize: 12, color: T.textMid, marginBottom: 16 }}>
          Tip: Open Google Maps, right-click your restaurant location → "What's here?" to get coordinates.
        </div>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Location'}</Btn>
      </div>

      <div style={{ marginTop: 20, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Zone Lookup Priority</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['1', '#F5A623', 'Area Name Match', 'If area name is provided on the order and matches a configured area → use that zone'],
            ['2', '#3498DB', 'Polygon Match', 'If customer lat/lng falls inside a zone polygon → use that zone (requires Maps module)'],
            ['3', '#2ECC71', 'Distance Range', 'Calculate Haversine distance from restaurant origin → match min_km / max_km range'],
            ['4', '#9B59B6', 'Default', 'If nothing matches → use the zone with the lowest sort_order'],
          ].map(([n, c, title, desc]) => (
            <div key={n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', background: c + '22', border: `2px solid ${c}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: c, flexShrink: 0 }}>{n}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</div>
                <div style={{ fontSize: 11, color: T.textMid }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP TAB (Leaflet — gated by maps module)
// ─────────────────────────────────────────────────────────────────────────────
function MapTab({ hasMaps }) {
  const { theme: T } = useTheme();
  if (!hasMaps) {
    return (
      <div style={{ textAlign: 'center', padding: 60, background: T.card, borderRadius: 16, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🗺</div>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 8 }}>Map Zone Editor</div>
        <div style={{ fontSize: 14, color: T.textMid, maxWidth: 420, margin: '0 auto 24px' }}>
          The <strong style={{ color: T.accent }}>Delivery Zone Maps</strong> module lets you draw polygon zones
          directly on a map and pin delivery areas. Subscribe to unlock visual zone management.
        </div>
        <div style={{ background: T.surface, borderRadius: 12, padding: 16, display: 'inline-block', border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 12, color: T.textMid, marginBottom: 4 }}>Go to</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>My Subscriptions → Delivery Zone Maps</div>
        </div>
      </div>
    );
  }
  // Lazy-load MapEditor only when maps module is active
  const MapEditor = React.lazy(() => import('./ZoneMapEditor'));
  return (
    <React.Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: T.textDim }}>Loading map…</div>}>
      <MapEditor />
    </React.Suspense>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function DeliveryPricing() {
  const { theme: T } = useTheme();
  const { hasModule } = useAuth();
  const hasMaps = hasModule('maps');
  const [tab, setTab] = useState('zones');

  const allTabs = [
    ...TABS,
    { id: 'map', label: `🗺 Map View${hasMaps ? '' : ' 🔒'}` },
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>Delivery Pricing Engine</h1>
        <p style={{ fontSize: 13, color: T.textMid }}>
          Configure delivery zones, area mappings, surge pricing, and VIP customer rules.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${T.border}`, paddingBottom: 0 }}>
        {allTabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '9px 16px', fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
              color: tab === t.id ? T.accent : T.textMid,
              background: 'transparent', border: 'none',
              borderBottom: `2px solid ${tab === t.id ? T.accent : 'transparent'}`,
              cursor: 'pointer', transition: 'color 0.15s',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: T.surface, borderRadius: 14, padding: 24, border: `1px solid ${T.border}` }}>
        {tab === 'zones'    && <ZonesTab />}
        {tab === 'areas'    && <AreasTab />}
        {tab === 'surge'    && <SurgeTab />}
        {tab === 'vip'      && <VIPTab />}
        {tab === 'location' && <LocationTab />}
        {tab === 'map'      && <MapTab hasMaps={hasMaps} />}
      </div>
    </div>
  );
}
