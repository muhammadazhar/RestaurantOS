import React, { useState, useEffect, useRef } from 'react';
import { Card, Badge, T, useT } from '../shared/UI';
import { getRestaurantSettings, updateRestaurantSettings, uploadRestaurantLogo, getRoles, createRole, updateRole, testWhatsAppMsg } from '../../services/api';
import { DEFAULT_PRINT_TEMPLATES, KOT_FIELDS, RECEIPT_FIELDS, mergePrintTemplates, renderKotHtml, renderReceiptHtml } from '../../utils/printTemplates';
import toast from 'react-hot-toast';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

// ─── Reusable field components ────────────────────────────────────────────────
const Field = ({ label, children, hint }) => (
  <div style={{ marginBottom: 20 }}>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 6, letterSpacing: 0.4 }}>{label}</label>
    {children}
    {hint && <div style={{ fontSize: 11, color: T.textDim, marginTop: 5 }}>{hint}</div>}
  </div>
);

const TextInput = ({ value, onChange, placeholder, type = 'text', disabled }) => (
  <input type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled}
    style={{
      width: '100%', background: disabled ? T.bg : T.surface,
      border: `1px solid ${T.border}`, borderRadius: 10,
      padding: '10px 14px', color: disabled ? T.textDim : T.text,
      fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none',
      cursor: disabled ? 'not-allowed' : 'text',
    }} />
);

const SelectInput = ({ value, onChange, children }) => (
  <select value={value} onChange={onChange}
    style={{
      width: '100%', background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: '10px 14px', color: T.text,
      fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none',
    }}>{children}</select>
);

const Toggle = ({ value, onChange, label }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: T.surface, borderRadius: 10, marginBottom: 8 }}>
    <span style={{ fontSize: 13, color: T.text }}>{label}</span>
    <div onClick={() => onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'all 0.25s',
      background: value ? T.accent : T.border, position: 'relative',
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        position: 'absolute', top: 3, left: value ? 23 : 3, transition: 'left 0.25s',
      }} />
    </div>
  </div>
);

const SaveBtn = ({ onClick, saving }) => (
  <button onClick={onClick} style={{
    background: saving ? T.border : T.accent, color: saving ? T.textMid : '#000',
    border: 'none', borderRadius: 10, padding: '11px 24px',
    fontSize: 13, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer',
    fontFamily: "'Inter', sans-serif", transition: 'all 0.2s', marginTop: 8,
  }}>
    {saving ? '⏳ Saving…' : '✓ Save Changes'}
  </button>
);

const SectionHeader = ({ icon, title, subtitle }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: T.text, margin: 0 }}>{title}</h2>
    </div>
    {subtitle && <p style={{ fontSize: 13, color: T.textMid, margin: 0, paddingLeft: 30 }}>{subtitle}</p>}
  </div>
);

const Divider = () => <div style={{ borderTop: `1px solid ${T.border}`, margin: '28px 0' }} />;
const DEFAULT_TAX_RATES = [
  { id: 'gst', name: 'Sales Tax (GST)', rate: 8, applies_to: 'all', enabled: true },
  { id: 'service', name: 'Service Charge', rate: 5, applies_to: 'dine_in', enabled: false },
  { id: 'delivery', name: 'Delivery Fee', rate: 2.5, applies_to: 'delivery', enabled: false },
];

// ─── 1. General Info ──────────────────────────────────────────────────────────
function GeneralInfo() {
  useT();
  const [form, setForm] = useState({
    name: '', slug: '', email: '', phone: '', address: '',
    city: '', country: 'Pakistan', currency: 'PKR', timezone: 'Asia/Karachi',
    tagline: '',
  });
  const [logoUrl,      setLogoUrl]      = useState(null);
  const [logoPreview,  setLogoPreview]  = useState(null);
  const [logoFile,     setLogoFile]     = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [logoUploading,setLogoUploading]= useState(false);
  const fileRef = useRef();
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    getRestaurantSettings().then(r => {
      const d = r.data;
      setForm(f => ({
        ...f,
        name:     d.name      || f.name,
        slug:     d.slug      || f.slug,
        email:    d.email     || f.email,
        phone:    d.phone     || f.phone,
        address:  d.address   || f.address,
        city:     d.city      || f.city,
        country:  d.country   || f.country,
        currency: d.currency  || f.currency,
        timezone: d.timezone  || f.timezone,
        tagline:  d.tagline   || f.tagline,
      }));
      if (d.logo_url) setLogoUrl(d.logo_url);
    }).catch(() => {});
  }, []);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const handleLogoUpload = async () => {
    if (!logoFile) return;
    setLogoUploading(true);
    try {
      const { data } = await uploadRestaurantLogo(logoFile);
      setLogoUrl(data.url);
      setLogoPreview(null);
      setLogoFile(null);
      toast.success('Logo updated!');
    } catch { toast.error('Logo upload failed'); }
    finally { setLogoUploading(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateRestaurantSettings({
        slug: form.slug, email: form.email, phone: form.phone,
        address: form.address, city: form.city, country: form.country,
        currency: form.currency, timezone: form.timezone, tagline: form.tagline,
      });
      toast.success('General info saved!');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  const currentLogoSrc = logoPreview || (logoUrl ? (logoUrl.startsWith('http') ? logoUrl : `${IMG_BASE}${logoUrl}`) : null);

  return (
    <div>
      <SectionHeader icon="🏪" title="General Information" subtitle="Basic details about your restaurant visible to customers and staff." />

      {/* Logo upload */}
      <Field label="Restaurant Logo" hint="Shown in the sidebar and on receipts. Recommended: square image, min 128×128px.">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 14, overflow: 'hidden', flexShrink: 0,
            background: T.surface, border: `2px solid ${T.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {currentLogoSrc
              ? <img src={currentLogoSrc} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 28 }}>🍽</span>
            }
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoChange} />
            <button onClick={() => fileRef.current.click()} style={{
              background: T.surface, border: `1px solid ${T.border}`, color: T.text,
              borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}>
              {logoUrl ? '🔄 Change Logo' : '📁 Choose Image'}
            </button>
            {logoFile && (
              <button onClick={handleLogoUpload} disabled={logoUploading} style={{
                background: T.accent, color: '#fff', border: 'none',
                borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 800,
                cursor: logoUploading ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif",
              }}>
                {logoUploading ? '⏳ Uploading…' : '⬆ Upload Logo'}
              </button>
            )}
          </div>
        </div>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
        <Field label="Restaurant Name" hint="Changing name requires contacting support.">
          <TextInput value={form.name} onChange={set('name')} placeholder="The Golden Fork" disabled />
        </Field>
        <Field label="Slug (URL identifier)" hint="Used in login screen and public URLs.">
          <TextInput value={form.slug} onChange={set('slug')} placeholder="golden-fork" />
        </Field>
        <Field label="Contact Email">
          <TextInput value={form.email} onChange={set('email')} type="email" placeholder="admin@restaurant.com" />
        </Field>
        <Field label="Phone Number">
          <TextInput value={form.phone} onChange={set('phone')} placeholder="+92-21-0000000" />
        </Field>
        <Field label="City">
          <TextInput value={form.city} onChange={set('city')} placeholder="Karachi" />
        </Field>
        <Field label="Country">
          <SelectInput value={form.country} onChange={set('country')}>
            <option>Pakistan</option><option>United Arab Emirates</option>
            <option>Saudi Arabia</option><option>United Kingdom</option>
            <option>United States</option>
          </SelectInput>
        </Field>
        <Field label="Currency">
          <SelectInput value={form.currency} onChange={set('currency')}>
            <option value="PKR">PKR — Pakistani Rupee</option>
            <option value="USD">USD — US Dollar</option>
            <option value="AED">AED — UAE Dirham</option>
            <option value="SAR">SAR — Saudi Riyal</option>
            <option value="GBP">GBP — British Pound</option>
          </SelectInput>
        </Field>
        <Field label="Timezone">
          <SelectInput value={form.timezone} onChange={set('timezone')}>
            <option value="Asia/Karachi">Asia/Karachi (PKT +5)</option>
            <option value="Asia/Dubai">Asia/Dubai (GST +4)</option>
            <option value="Asia/Riyadh">Asia/Riyadh (AST +3)</option>
            <option value="Europe/London">Europe/London (GMT +0)</option>
            <option value="America/New_York">America/New_York (EST -5)</option>
          </SelectInput>
        </Field>
        <Field label="Tagline / Description" hint="Short description shown on receipts and login page.">
          <TextInput value={form.tagline} onChange={set('tagline')} placeholder="Fine dining at its best" />
        </Field>
        <Field label="Address">
          <TextInput value={form.address} onChange={set('address')} placeholder="Street address" />
        </Field>
      </div>
      <SaveBtn onClick={save} saving={saving} />
    </div>
  );
}

// ─── 2. Tax Rates ─────────────────────────────────────────────────────────────
function TaxRates() {
  const [taxes, setTaxes] = useState(DEFAULT_TAX_RATES);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTax, setNewTax] = useState({ name: '', rate: '', applies_to: 'all' });

  useEffect(() => {
    getRestaurantSettings()
      .then(r => {
        if (Array.isArray(r.data.tax_rates)) setTaxes(r.data.tax_rates);
      })
      .catch(() => {});
  }, []);

  const toggle  = (id) => setTaxes(t => t.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x));
  const remove  = (id) => setTaxes(t => t.filter(x => x.id !== id));
  const setRate = (id, v) => setTaxes(t => t.map(x => x.id === id ? { ...x, rate: parseFloat(v) || 0 } : x));

  const addTax = () => {
    if (!newTax.name || !newTax.rate) return toast.error('Name and rate required');
    setTaxes(t => [...t, { ...newTax, id: Date.now(), rate: parseFloat(newTax.rate), enabled: true }]);
    setNewTax({ name: '', rate: '', applies_to: 'all' });
    setAdding(false);
    toast.success('Tax added');
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateRestaurantSettings({ tax_rates: taxes });
      toast.success('Tax rates saved!');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const appliesToLabel = { all: 'All Orders', dine_in: 'Dine-in Only', delivery: 'Delivery Only', online: 'Online Only' };

  return (
    <div>
      <SectionHeader icon="🧾" title="Tax Rates" subtitle="Configure taxes and charges applied to customer orders." />
      <div style={{ marginBottom: 16 }}>
        {taxes.map(tax => (
          <div key={tax.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '14px 16px', background: T.surface, borderRadius: 12, marginBottom: 8,
            border: `1px solid ${tax.enabled ? T.border : T.border}`, opacity: tax.enabled ? 1 : 0.5,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{tax.name}</div>
              <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{appliesToLabel[tax.applies_to]}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="number" value={tax.rate} onChange={e => setRate(tax.id, e.target.value)}
                style={{ width: 60, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', color: T.accent, fontSize: 13, fontWeight: 800, fontFamily: "'Inter', sans-serif", outline: 'none', textAlign: 'center' }} />
              <span style={{ color: T.textMid, fontSize: 13 }}>%</span>
            </div>
            <Badge color={tax.enabled ? T.green : T.textDim} small>{tax.enabled ? 'Active' : 'Off'}</Badge>
            <button onClick={() => toggle(tax.id)} style={{ background: tax.enabled ? T.redDim : T.greenDim, border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', color: tax.enabled ? T.red : T.green, fontFamily: "'Inter', sans-serif" }}>
              {tax.enabled ? 'Disable' : 'Enable'}
            </button>
            <button onClick={() => remove(tax.id)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
          </div>
        ))}
      </div>

      {adding ? (
        <div style={{ background: T.surface, border: `1px solid ${T.accent}44`, borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 150px auto', gap: 10, alignItems: 'flex-end' }}>
            <Field label="Tax Name"><TextInput value={newTax.name} onChange={e => setNewTax(n => ({ ...n, name: e.target.value }))} placeholder="e.g. Service Charge" /></Field>
            <Field label="Rate (%)"><TextInput value={newTax.rate} onChange={e => setNewTax(n => ({ ...n, rate: e.target.value }))} type="number" placeholder="0" /></Field>
            <Field label="Applies To">
              <SelectInput value={newTax.applies_to} onChange={e => setNewTax(n => ({ ...n, applies_to: e.target.value }))}>
                <option value="all">All Orders</option>
                <option value="dine_in">Dine-in Only</option>
                <option value="delivery">Delivery Only</option>
                <option value="online">Online Only</option>
              </SelectInput>
            </Field>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addTax} style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap' }}>Add</button>
              <button onClick={() => setAdding(false)} style={{ background: T.border, color: T.textMid, border: 'none', borderRadius: 8, padding: '10px 12px', cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} style={{ background: 'transparent', border: `1px dashed ${T.border}`, color: T.textMid, borderRadius: 10, padding: '10px 18px', fontSize: 13, cursor: 'pointer', fontFamily: "'Inter', sans-serif", marginBottom: 16 }}>
          + Add Tax / Charge
        </button>
      )}
      <SaveBtn onClick={save} saving={saving} />
    </div>
  );
}

// ─── 3. Payment Methods ───────────────────────────────────────────────────────
function PaymentMethods() {
  const [methods, setMethods] = useState([
    { id: 'cash',   label: 'Cash',          icon: '💵', enabled: true,  details: '' },
    { id: 'card',   label: 'Credit / Debit Card', icon: '💳', enabled: true, details: 'Visa, Mastercard, Amex' },
    { id: 'jazzcash', label: 'JazzCash',    icon: '📱', enabled: true,  details: '0300-0000000' },
    { id: 'easypaisa', label: 'Easypaisa',  icon: '📲', enabled: false, details: '' },
    { id: 'bank',   label: 'Bank Transfer', icon: '🏦', enabled: false, details: 'HBL IBAN: PK00HBL...' },
  ]);
  const [saving, setSaving] = useState(false);

  const toggle  = (id) => setMethods(m => m.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x));
  const setDets = (id, v) => setMethods(m => m.map(x => x.id === id ? { ...x, details: v } : x));

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast.success('Payment methods saved!');
  };

  return (
    <div>
      <SectionHeader icon="💳" title="Payment Methods" subtitle="Choose which payment options are available at checkout." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        {methods.map(m => (
          <div key={m.id} style={{
            background: T.surface, border: `1px solid ${m.enabled ? T.borderLight : T.border}`,
            borderRadius: 12, padding: '16px 18px', opacity: m.enabled ? 1 : 0.55, transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>{m.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{m.label}</div>
                {m.enabled && (
                  <input value={m.details} onChange={e => setDets(m.id, e.target.value)}
                    placeholder="Optional: account number, notes…"
                    style={{ marginTop: 6, width: '100%', maxWidth: 360, background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', color: T.textMid, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
                )}
              </div>
              <div onClick={() => toggle(m.id)} style={{
                width: 44, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'all 0.25s',
                background: m.enabled ? T.accent : T.border, position: 'relative', flexShrink: 0,
              }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: m.enabled ? 23 : 3, transition: 'left 0.25s' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <SaveBtn onClick={save} saving={saving} />
    </div>
  );
}

// ─── 4. Roles & Permissions ───────────────────────────────────────────────────
const ALL_PERMS = [
  { key: 'shift_management', label: 'Shift Management', icon: 'SM' },
  { key: 'dashboard',  label: 'Dashboard',      icon: '⬛' },
  { key: 'pos',        label: 'POS / Orders',   icon: '📲' },
  { key: 'kitchen',    label: 'Kitchen Display',icon: '👨‍🍳' },
  { key: 'tables',     label: 'Tables',         icon: '🪑' },
  { key: 'inventory',  label: 'Inventory',      icon: '📦' },
  { key: 'recipes',    label: 'Recipes',        icon: '📋' },
  { key: 'employees',  label: 'Employees',      icon: '👥' },
  { key: 'attendance', label: 'Attendance',     icon: '🕐' },
  { key: 'delivery',   label: 'Online Delivery',icon: '🛵' },
  { key: 'rider',      label: 'Rider / Delivery Dashboard', icon: '🏍' },
  { key: 'gl',         label: 'General Ledger', icon: '📊' },
  { key: 'alerts',     label: 'Alerts',         icon: '🔔' },
  { key: 'settings',   label: 'Settings',       icon: '⚙️' },
];

function RolesPermissions() {
  const [roles, setRoles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRoles().then(r => {
      const data = r.data.map(role => ({
        ...role,
        system: role.is_system,
        permissions: Array.isArray(role.permissions) ? role.permissions : JSON.parse(role.permissions || '[]'),
      }));
      setRoles(data);
      if (data.length) setSelected(data[0].id);
    }).catch(() => toast.error('Failed to load roles')).finally(() => setLoading(false));
  }, []);

  const role = roles.find(r => r.id === selected);

  const togglePerm = (key) => {
    if (role?.system) return; // system roles are read-only
    setRoles(rs => rs.map(r => r.id === selected
      ? { ...r, permissions: r.permissions.includes(key) ? r.permissions.filter(p => p !== key) : [...r.permissions, key] }
      : r
    ));
  };

  const addRole = async () => {
    if (!newRole.trim()) return;
    try {
      const r = await createRole({ name: newRole.trim(), permissions: ['pos', 'alerts'] });
      const created = { ...r.data, system: r.data.is_system, permissions: Array.isArray(r.data.permissions) ? r.data.permissions : JSON.parse(r.data.permissions || '[]') };
      setRoles(rs => [...rs, created]);
      setSelected(created.id);
      setNewRole('');
      toast.success(`Role "${created.name}" created`);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to create role');
    }
  };

  const save = async () => {
    if (!role) return;
    if (role.system) return toast.error('System roles cannot be modified');
    setSaving(true);
    try {
      await updateRole(role.id, { permissions: role.permissions });
      toast.success('Permissions saved!');
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ color: T.textMid, padding: 24 }}>Loading roles…</div>;

  return (
    <div>
      <SectionHeader icon="🔐" title="Roles & Permissions" subtitle="Control what each role can access. System roles cannot be modified." />
      <div style={{ display: 'flex', gap: 16 }}>
        {/* Role list */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>Roles</div>
          {roles.map(r => (
            <div key={r.id} onClick={() => setSelected(r.id)} style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 6, cursor: 'pointer',
              background: selected === r.id ? T.accentGlow : T.surface,
              border: `1px solid ${selected === r.id ? T.accent + '66' : T.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: selected === r.id ? T.accent : T.text }}>{r.name}</div>
                <div style={{ fontSize: 10, color: T.textDim, marginTop: 2 }}>{r.permissions.length} permissions</div>
              </div>
              {r.system && <Badge color={T.blue} small>System</Badge>}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input value={newRole} onChange={e => setNewRole(e.target.value)} placeholder="New role name"
              onKeyDown={e => e.key === 'Enter' && addRole()}
              style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '7px 10px', color: T.text, fontSize: 12, fontFamily: "'Inter', sans-serif", outline: 'none' }} />
            <button onClick={addRole} style={{ background: T.accent, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 10px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>+</button>
          </div>
        </div>

        {/* Permission matrix */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700, marginBottom: 10 }}>
            Permissions for: <span style={{ color: T.accent }}>{role?.name}</span>
            {role?.system && <span style={{ color: T.blue, marginLeft: 8 }}>(system role)</span>}
          </div>
          {role?.system && (
            <div style={{ background: '#3498db11', border: '1px solid #3498db44', borderRadius: 8, padding: '8px 14px', marginBottom: 12, fontSize: 12, color: '#3498db' }}>
              🔒 System roles are read-only and cannot be modified.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {ALL_PERMS.map(p => {
              const active = role?.permissions.includes(p.key);
              const readonly = role?.system;
              return (
                <div key={p.key} onClick={() => togglePerm(p.key)} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 10,
                  background: active ? T.accentGlow : T.surface,
                  border: `1px solid ${active ? T.accent + '55' : T.border}`,
                  cursor: readonly ? 'not-allowed' : 'pointer',
                  opacity: readonly ? 0.6 : 1,
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 16 }}>{p.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: active ? T.accent : T.textMid, flex: 1 }}>{p.label}</span>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    background: active ? T.accent : T.border,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {active && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {!role?.system && <SaveBtn onClick={save} saving={saving} />}
        </div>
      </div>
    </div>
  );
}

// ─── 5. Alert Thresholds ──────────────────────────────────────────────────────
function AlertThresholds() {
  useT();
  const [thresholds, setThresholds] = useState({
    low_stock_pct:      100,
    critical_stock_pct: 50,
    order_timeout_min:  30,
  });
  const [channels, setChannels] = useState({
    in_app:  true,
    email:   true,
    sms:     false,
  });
  const [alertTypes, setAlertTypes] = useState({
    inventory_low:      true,
    inventory_critical: true,
    order_delayed:      true,
    order_ready:        true,
    shift_reminder:     false,
    system:             true,
  });
  const [tableOvertimeHours, setTableOvertimeHours] = useState(2);
  const [savingOvertime, setSavingOvertime] = useState(false);
  const [saving, setSaving] = useState(false);
  const setT = (k, v) => setThresholds(t => ({ ...t, [k]: v }));
  const toggleCh = (k) => setChannels(c => ({ ...c, [k]: !c[k] }));
  const toggleAt = (k) => setAlertTypes(a => ({ ...a, [k]: !a[k] }));

  useEffect(() => {
    getRestaurantSettings().then(r => {
      if (r.data?.table_overtime_hours) setTableOvertimeHours(Number(r.data.table_overtime_hours));
    }).catch(() => {});
  }, []);

  const saveOvertimeSetting = async () => {
    setSavingOvertime(true);
    try {
      await updateRestaurantSettings({ table_overtime_hours: tableOvertimeHours });
      toast.success(`Table overtime threshold set to ${tableOvertimeHours}h`);
    } catch { toast.error('Failed to save setting'); }
    finally { setSavingOvertime(false); }
  };

  const save = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 800));
    setSaving(false);
    toast.success('Alert thresholds saved!');
  };

  const SliderField = ({ label, value, onChange, min, max, unit, hint }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{label}</label>
        <span style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.accent }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(parseInt(e.target.value))}
        style={{ width: '100%', accentColor: T.accent, cursor: 'pointer' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textDim, marginTop: 4 }}>
        <span>{min}{unit}</span><span>{hint}</span><span>{max}{unit}</span>
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader icon="⚠️" title="Alert Thresholds" subtitle="Set when and how you get notified about critical events." />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>Stock Thresholds</div>
          <SliderField label="Low Stock Warning" value={thresholds.low_stock_pct} onChange={v => setT('low_stock_pct', v)} min={50} max={200} unit="%" hint="of minimum level" />
          <SliderField label="Critical Stock Level" value={thresholds.critical_stock_pct} onChange={v => setT('critical_stock_pct', v)} min={10} max={100} unit="%" hint="of minimum level" />
          <SliderField label="Order Timeout" value={thresholds.order_timeout_min} onChange={v => setT('order_timeout_min', v)} min={5} max={120} unit=" min" hint="before alerting" />

          <Divider />
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Delivery Channels</div>
          <Toggle value={channels.in_app} onChange={() => toggleCh('in_app')} label="🔔 In-App Notifications" />
          <Toggle value={channels.email}  onChange={() => toggleCh('email')}  label="📧 Email Alerts" />
          <Toggle value={channels.sms}    onChange={() => toggleCh('sms')}    label="📱 SMS Alerts" />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>Alert Types</div>
          {[
            ['inventory_low',      '📦', 'Inventory Low',       'Warn when stock nears minimum'],
            ['inventory_critical', '🚨', 'Inventory Critical',  'Alert when stock is dangerously low'],
            ['order_delayed',      '⏱',  'Order Delayed',       'Notify when order exceeds timeout'],
            ['order_ready',        '✅', 'Order Ready',         'Ping server when kitchen marks ready'],
            ['shift_reminder',     '⏰', 'Shift Reminder',      'Remind staff 30 min before shift'],
            ['system',             '⚙️', 'System Alerts',       'Platform & connectivity issues'],
          ].map(([key, icon, label, hint]) => (
            <div key={key} onClick={() => toggleAt(key)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', background: alertTypes[key] ? T.accentGlow : T.surface,
              border: `1px solid ${alertTypes[key] ? T.accent + '44' : T.border}`,
              borderRadius: 10, marginBottom: 8, cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: alertTypes[key] ? T.accent : T.text }}>{label}</div>
                <div style={{ fontSize: 11, color: T.textDim }}>{hint}</div>
              </div>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: alertTypes[key] ? T.accent : T.border, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {alertTypes[key] && <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      <SaveBtn onClick={save} saving={saving} />

      {/* Table Overtime — real API-backed setting */}
      <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
          Table Overtime Alert
        </div>
        <div style={{ background: T.surface, borderRadius: 12, padding: '16px 20px', marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>⏰ Max Seating Duration</div>
              <div style={{ fontSize: 11, color: T.textDim, marginTop: 3 }}>
                Tables occupied longer than this turn red and trigger an alert.
              </div>
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 800, color: T.red }}>
              {tableOvertimeHours}h
            </span>
          </div>
          <input
            type="range" min={1} max={12} value={tableOvertimeHours}
            onChange={e => setTableOvertimeHours(Number(e.target.value))}
            style={{ width: '100%', accentColor: T.red, cursor: 'pointer' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.textDim, marginTop: 4 }}>
            <span>1h</span><span>Drag to set threshold</span><span>12h</span>
          </div>
        </div>
        <SaveBtn onClick={saveOvertimeSetting} saving={savingOvertime} />
      </div>
    </div>
  );
}

// ─── 6. Integrations ─────────────────────────────────────────────────────────
function Integrations() {
  useT();
  const EMPTY_WA = { whatsapp_enabled: false, whatsapp_phone_number_id: '', whatsapp_access_token: '', whatsapp_from_name: '' };
  const [wa,       setWa]       = useState(EMPTY_WA);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [testing,  setTesting]  = useState(false);
  const [testTo,   setTestTo]   = useState('');

  useEffect(() => {
    getRestaurantSettings()
      .then(r => {
        const s = r.data || {};
        setWa({
          whatsapp_enabled:          !!s.whatsapp_enabled,
          whatsapp_phone_number_id:  s.whatsapp_phone_number_id  || '',
          whatsapp_access_token:     s.whatsapp_access_token     || '',
          whatsapp_from_name:        s.whatsapp_from_name        || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const w = (k, v) => setWa(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRestaurantSettings(wa);
      toast.success('WhatsApp settings saved');
    } catch (e) { toast.error(e.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleTest = async () => {
    const num = testTo.trim().replace(/\D/g, '');
    if (!num) return toast.error('Enter a recipient phone number (with country code)');
    if (!wa.whatsapp_phone_number_id || !wa.whatsapp_access_token)
      return toast.error('Save Phone Number ID and Access Token first');
    setTesting(true);
    try {
      await testWhatsAppMsg({ to: num, phone_number_id: wa.whatsapp_phone_number_id, access_token: wa.whatsapp_access_token });
      toast.success('Test WhatsApp message sent!');
    } catch (e) { toast.error(e.response?.data?.error || 'Test failed'); }
    finally { setTesting(false); }
  };

  if (loading) return null;

  const inp = (key, placeholder, type = 'text') => (
    <input
      type={type} value={wa[key]} onChange={e => w(key, e.target.value)}
      placeholder={placeholder}
      style={{ width: '100%', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', boxSizing: 'border-box' }}
    />
  );

  return (
    <div>
      <SectionHeader icon="🔌" title="Integrations" subtitle="Connect messaging channels for notifications and order updates." />

      {/* WhatsApp card */}
      <Card style={{ padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: '#25D36622', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
            💬
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>WhatsApp Business</div>
            <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>Meta Cloud API — send order updates and notifications via WhatsApp</div>
          </div>
          {/* Enable toggle */}
          <div
            onClick={() => w('whatsapp_enabled', !wa.whatsapp_enabled)}
            style={{ width: 44, height: 24, borderRadius: 12, cursor: 'pointer', transition: 'all 0.25s', background: wa.whatsapp_enabled ? '#25D366' : T.border, position: 'relative', flexShrink: 0 }}
          >
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: wa.whatsapp_enabled ? 23 : 3, transition: 'left 0.25s' }} />
          </div>
        </div>

        {wa.whatsapp_enabled && (
          <div>
            <Divider />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <Field label="Phone Number ID *">
                {inp('whatsapp_phone_number_id', '123456789012345')}
              </Field>
              <Field label="Display Name">
                {inp('whatsapp_from_name', 'My Restaurant')}
              </Field>
            </div>
            <Field label="Access Token *" hint="From Meta for Developers → WhatsApp → API Setup">
              {inp('whatsapp_access_token', 'EAABxx…', 'password')}
            </Field>

            <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '10px 14px', fontSize: 12, color: T.textMid, marginBottom: 16 }}>
              💡 Get your Phone Number ID and Access Token from{' '}
              <b style={{ color: T.accent }}>developers.facebook.com → My Apps → WhatsApp → API Setup</b>
            </div>
          </div>
        )}

        <SaveBtn onClick={handleSave} saving={saving} />
      </Card>

      {/* Test card — only shown when WA is enabled and configured */}
      {wa.whatsapp_enabled && wa.whatsapp_phone_number_id && wa.whatsapp_access_token && (
        <Card style={{ padding: 24 }}>
          <SectionHeader icon="🧪" title="Send Test Message" subtitle="Verify your WhatsApp config by sending a test message." />
          <div style={{ display: 'flex', gap: 10 }}>
            <TextInput
              value={testTo}
              onChange={e => setTestTo(e.target.value)}
              placeholder="923001234567 (with country code, no +)"
            />
            <button
              onClick={handleTest}
              disabled={testing}
              style={{ background: '#25D366', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 20px', fontSize: 13, fontWeight: 700, cursor: testing ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif", whiteSpace: 'nowrap', opacity: testing ? 0.6 : 1 }}
            >
              {testing ? '⏳ Sending…' : '💬 Send Test'}
            </button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────
function lineTextToArray(value) {
  return String(value || '').split('\n').map(line => line.trim()).filter(Boolean);
}

function PrintTemplateEditor() {
  useT();
  const [templates, setTemplates] = useState(DEFAULT_PRINT_TEMPLATES);
  const [restaurant, setRestaurant] = useState({});
  const [activeDoc, setActiveDoc] = useState('receipt');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRestaurantSettings().then(r => {
      setRestaurant(r.data || {});
      setTemplates(mergePrintTemplates(r.data || {}));
    }).catch(() => {});
  }, []);

  const doc = templates[activeDoc];
  const fields = activeDoc === 'receipt' ? RECEIPT_FIELDS : KOT_FIELDS;
  const setDoc = (key, value) => setTemplates(prev => ({ ...prev, [activeDoc]: { ...prev[activeDoc], [key]: value } }));
  const toggleField = (field) => {
    const current = doc.fields || [];
    setDoc('fields', current.includes(field) ? current.filter(f => f !== field) : [...current, field]);
  };

  const previewOrder = {
    order_number: 'ORD-1001',
    order_type: 'dine_in',
    table_label: 'T-04',
    customer_name: 'Walk-in Guest',
    customer_phone: '+92 300 0000000',
    guest_count: 3,
    subtotal: 2450,
    tax_amount: 196,
    discount_amount: 100,
    total_amount: 2546,
    payment_method: 'cash',
    payment_status: 'paid',
    created_at: new Date().toISOString(),
  };
  const previewItems = [
    { name: 'Chicken Karahi', quantity: 1, unit_price: 1800, total_price: 1800, notes: 'Medium spicy' },
    { name: 'Naan', quantity: 5, unit_price: 130, total_price: 650 },
  ];
  const previewHtml = activeDoc === 'receipt'
    ? renderReceiptHtml({
      template: doc,
      restaurant,
      order: previewOrder,
      items: previewItems,
      table: { label: 'T-04', section: 'Family' },
      taxBreakdown: [{ name: 'Sales Tax', rate: 8, amount: 196 }],
      taxLabel: 'Sales Tax 8%',
      methodLabel: 'Cash',
      isPaid: true,
      tenderedAmount: '3000',
      cashierName: 'Cashier',
      waiterName: 'Waiter',
      shiftLabel: '#1 Morning (09:00-17:00)',
    })
    : renderKotHtml({
      template: doc,
      restaurant,
      order: previewOrder,
      items: previewItems,
      table: { label: 'T-04', section: 'Family' },
      cashierName: 'Cashier',
      waiterName: 'Waiter',
      orderNotes: 'Serve bread first',
    });

  const save = async () => {
    setSaving(true);
    try {
      await updateRestaurantSettings({ print_templates: templates });
      toast.success('Print templates saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const resetCurrent = () => setTemplates(prev => ({ ...prev, [activeDoc]: DEFAULT_PRINT_TEMPLATES[activeDoc] }));
  const openPreview = () => {
    const w = window.open('', '_blank', 'width=420,height=720');
    if (!w) return toast.error('Pop-up blocked');
    w.document.write(previewHtml);
    w.document.close();
  };

  return (
    <div>
      <SectionHeader icon="🖨️" title="Receipt & KOT Designer" subtitle="Design POS printer headers, footers, logo, and printed fields." />
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {[
          ['receipt', 'Receipt'],
          ['kot', 'KOT'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setActiveDoc(id)} style={{ background: activeDoc === id ? T.accent : T.surface, color: activeDoc === id ? '#000' : T.text, border: `1px solid ${activeDoc === id ? T.accent : T.border}`, borderRadius: 10, padding: '9px 16px', fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>{label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 330px', gap: 22, alignItems: 'start' }}>
        <div>
          <Field label="Logo">
            <Toggle value={doc.showLogo} onChange={v => setDoc('showLogo', v)} label="Print logo on header" />
            {doc.showLogo && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 10 }}>
                <TextInput value={doc.logoUrl || ''} onChange={e => setDoc('logoUrl', e.target.value)} placeholder={restaurant.logo_url ? 'Leave blank to use restaurant logo' : 'https://.../logo.png'} />
                <TextInput value={doc.logoWidth || 48} onChange={e => setDoc('logoWidth', e.target.value)} type="number" placeholder="48" />
              </div>
            )}
          </Field>

          <Field label="Header Lines" hint="One line per row. First line prints larger by default.">
            <textarea value={(doc.headerLines || []).join('\n')} onChange={e => setDoc('headerLines', lineTextToArray(e.target.value))} style={{ width: '100%', minHeight: 92, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', resize: 'vertical' }} />
          </Field>

          <Field label="Footer Lines" hint="One line per row. Leave blank for no footer.">
            <textarea value={(doc.footerLines || []).join('\n')} onChange={e => setDoc('footerLines', lineTextToArray(e.target.value))} style={{ width: '100%', minHeight: 78, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px', color: T.text, fontSize: 13, fontFamily: "'Inter', sans-serif", outline: 'none', resize: 'vertical' }} />
          </Field>

          <Field label="Fields to Print">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
              {fields.map(([id, label]) => {
                const active = (doc.fields || []).includes(id);
                return (
                  <button key={id} type="button" onClick={() => toggleField(id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: active ? T.accentGlow : T.surface, color: active ? T.accent : T.textMid, border: `1px solid ${active ? T.accent + '66' : T.border}`, borderRadius: 10, padding: '9px 12px', cursor: 'pointer', fontWeight: 700, fontFamily: "'Inter', sans-serif" }}>
                    <span>{label}</span>
                    <span>{active ? 'On' : 'Off'}</span>
                  </button>
                );
              })}
            </div>
          </Field>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <SaveBtn onClick={save} saving={saving} />
            <button onClick={resetCurrent} style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif", marginTop: 8 }}>Reset {activeDoc === 'receipt' ? 'Receipt' : 'KOT'}</button>
            <button onClick={openPreview} style={{ background: T.greenDim, border: `1px solid ${T.green}55`, color: T.green, borderRadius: 10, padding: '11px 18px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif", marginTop: 8 }}>Open Print Preview</button>
          </div>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <div style={{ color: '#0f172a', fontSize: 12, fontWeight: 900, marginBottom: 8 }}>POS Printer Preview</div>
          <iframe title="print-template-preview" srcDoc={previewHtml} style={{ width: '100%', height: 560, border: '1px solid #cbd5e1', borderRadius: 8, background: '#fff' }} />
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'general',      icon: '🏪', label: 'General Info'       },
  { id: 'tax',          icon: '🧾', label: 'Tax Rates'          },
  { id: 'payments',     icon: '💳', label: 'Payment Methods'    },
  { id: 'roles',        icon: '🔐', label: 'Roles & Permissions'},
  { id: 'alerts',       icon: '⚠️', label: 'Alert Thresholds'   },
  { id: 'integrations', icon: '🔌', label: 'Integrations'        },
];

export default function Settings() {
  useT();
  const [active, setActive] = useState('general');

  const content = {
    general:      <GeneralInfo />,
    tax:          <TaxRates />,
    printing:     <PrintTemplateEditor />,
    payments:     <PaymentMethods />,
    roles:        <RolesPermissions />,
    alerts:       <AlertThresholds />,
    integrations: <Integrations />,
  };

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0 }}>⚙️ Settings</h1>
        <p style={{ color: T.textMid, fontSize: 13, marginTop: 4 }}>Configure your restaurant setup, permissions and integrations.</p>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Left nav */}
        <div style={{ width: 210, flexShrink: 0 }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActive(tab.id)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 10, marginBottom: 4, textAlign: 'left',
              background: active === tab.id ? T.accentGlow : 'transparent',
              color:      active === tab.id ? T.accent : T.textMid,
              border:     `1px solid ${active === tab.id ? T.accent + '44' : 'transparent'}`,
              fontSize: 13, fontWeight: active === tab.id ? 700 : 500,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
            }}>
              <span style={{ fontSize: 16 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <button onClick={() => setActive('printing')} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderRadius: 10, marginBottom: 4, textAlign: 'left',
            background: active === 'printing' ? T.accentGlow : 'transparent',
            color:      active === 'printing' ? T.accent : T.textMid,
            border:     `1px solid ${active === 'printing' ? T.accent + '44' : 'transparent'}`,
            fontSize: 13, fontWeight: active === 'printing' ? 700 : 500,
            cursor: 'pointer', fontFamily: "'Inter', sans-serif", transition: 'all 0.15s',
          }}>
            <span style={{ fontSize: 16 }}>PR</span>
            Receipt / KOT
          </button>
        </div>

        {/* Content */}
        <Card style={{ flex: 1, minHeight: 400 }}>
          {content[active]}
        </Card>
      </div>
    </div>
  );
}
