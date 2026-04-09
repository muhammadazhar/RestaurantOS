import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { getSetupStatus, completeSetup, createMenuItem } from '../../services/api';
import toast from 'react-hot-toast';
import API from '../../services/api';

// ─── Step definitions ─────────────────────────────────────────────────────────
const WIZARD_STEPS = [
  { id: 'welcome',    icon: '👋', title: 'Welcome',          subtitle: 'Quick overview of what we\'ll set up' },
  { id: 'tables',     icon: '🪑', title: 'Dining Tables',    subtitle: 'Configure your floor plan' },
  { id: 'categories', icon: '📋', title: 'Menu Categories',  subtitle: 'Organise your menu sections' },
  { id: 'menu',       icon: '🍽', title: 'First Menu Items',  subtitle: 'Add a few dishes to get started' },
  { id: 'staff',      icon: '👥', title: 'Invite Staff',      subtitle: 'Add your team members' },
  { id: 'done',       icon: '🎉', title: 'You\'re all set!',  subtitle: 'Your restaurant is ready' },
];

// ─── Table presets ────────────────────────────────────────────────────────────
const TABLE_PRESETS = [
  { label: 'Small café (6 tables)',    tables: Array.from({length:6}, (_,i) => ({ label:`T-0${i+1}`, section:'Main Hall', capacity: i<2?2:4 })) },
  { label: 'Mid-size (12 tables)',     tables: [
    ...Array.from({length:6}, (_,i) => ({ label:`T-0${i+1}`, section:'Main Hall', capacity:4 })),
    ...Array.from({length:4}, (_,i) => ({ label:`T-${i+7}`,  section:'Terrace',   capacity:4 })),
    ...Array.from({length:2}, (_,i) => ({ label:`T-V${i+1}`, section:'VIP',       capacity:6 })),
  ]},
  { label: 'Large restaurant (20 tables)', tables: [
    ...Array.from({length:10}, (_,i) => ({ label:`T-${String(i+1).padStart(2,'0')}`, section:'Main Hall', capacity:4 })),
    ...Array.from({length:6},  (_,i) => ({ label:`T-${String(i+11).padStart(2,'0')}`, section:'Terrace',  capacity:4 })),
    ...Array.from({length:4},  (_,i) => ({ label:`T-V${i+1}`,section:'VIP', capacity:6 })),
  ]},
];

const SECTION_COLORS = { 'Main Hall': '#F5A623', 'Terrace': '#3498DB', 'VIP': '#9B59B6', 'Bar': '#E74C3C', 'Private': '#2ECC71' };

// ─── Category presets ─────────────────────────────────────────────────────────
const CAT_PRESETS = {
  'Full Restaurant': ['Starters','Soups','Salads','Mains','Grills','Pasta','Pizza','Desserts','Hot Drinks','Cold Drinks'],
  'Café':            ['Breakfast','Sandwiches','Burgers','Salads','Cakes & Pastries','Hot Drinks','Cold Drinks','Juices'],
  'Fast Food':       ['Burgers','Wraps','Sides','Deals','Drinks','Desserts'],
  'Fine Dining':     ['Amuse-Bouche','Starters','Soups','Fish','Mains','Cheese','Desserts','Wine','Beverages'],
  'Custom':          [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getRoles = () => API.get('/roles');
const createEmployee = (d) => API.post('/employees', d);

export default function SetupWizard() {
  const { user } = useAuth();
  const { theme: T } = useTheme();
  const navigate = useNavigate();

  const [step,    setStep]    = useState(0);
  const [status,  setStatus]  = useState(null);
  const [saving,  setSaving]  = useState(false);

  // Step data
  const [tables,       setTables]       = useState([]);
  const [customTable,  setCustomTable]  = useState({ label:'', section:'Main Hall', capacity:4 });
  const [categories,   setCategories]   = useState([]);
  const [customCat,    setCustomCat]    = useState('');
  const [menuItems,    setMenuItems]    = useState([{ name:'', price:'', category:'', prep_time_min:15 }]);
  const [staffList,    setStaffList]    = useState([{ full_name:'', email:'', role_id:'', phone:'' }]);
  const [roles,        setRoles]        = useState([]);
  const [skipSteps,    setSkipSteps]    = useState({});

  // Load setup status + roles
  useEffect(() => {
    getSetupStatus().then(r => setStatus(r.data)).catch(console.error);
    getRoles().then(r => setRoles(r.data)).catch(console.error);
  }, []);

  const cur = WIZARD_STEPS[step];

  // ── Step actions ──────────────────────────────────────────────────────────
  const applyTablePreset = (preset) => setTables(preset.tables);

  const addCustomTable = () => {
    if (!customTable.label.trim()) return toast.error('Enter a table label');
    if (tables.find(t => t.label === customTable.label)) return toast.error('Table label already exists');
    setTables(t => [...t, { ...customTable }]);
    setCustomTable(c => ({ ...c, label: '', capacity: 4 }));
  };

  const removeTable = (label) => setTables(t => t.filter(x => x.label !== label));

  const applyCatPreset = (presetName) => {
    setCategories(CAT_PRESETS[presetName].map((name, i) => ({ name, sort_order: i + 1 })));
  };

  const addCustomCat = () => {
    if (!customCat.trim()) return;
    if (categories.find(c => c.name.toLowerCase() === customCat.toLowerCase())) return toast.error('Category already exists');
    setCategories(c => [...c, { name: customCat.trim(), sort_order: c.length + 1 }]);
    setCustomCat('');
  };

  const setMenuItem = (i, k, v) => setMenuItems(items => items.map((m, idx) => idx === i ? { ...m, [k]: v } : m));
  const addMenuItem = () => setMenuItems(items => [...items, { name:'', price:'', category:'', prep_time_min:15 }]);
  const removeMenuItem = (i) => setMenuItems(items => items.filter((_,idx) => idx !== i));

  const setStaff = (i, k, v) => setStaffList(list => list.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const addStaff = () => setStaffList(list => [...list, { full_name:'', email:'', role_id:'', phone:'' }]);
  const removeStaff = (i) => setStaffList(list => list.filter((_,idx) => idx !== i));

  // ── Save each step and advance ─────────────────────────────────────────────
  const saveAndNext = async () => {
    setSaving(true);
    try {
      if (cur.id === 'tables' && !skipSteps.tables) {
        if (tables.length === 0) return toast.error('Add at least one table, or skip this step');
        await completeSetup({ tables, categories: [], restaurant_info: null });
        toast.success(`${tables.length} tables saved!`);
      }

      if (cur.id === 'categories' && !skipSteps.categories) {
        if (categories.length === 0) return toast.error('Add at least one category, or skip');
        await completeSetup({ categories, tables: [], restaurant_info: null });
        toast.success(`${categories.length} categories saved!`);
      }

      if (cur.id === 'menu' && !skipSteps.menu) {
        const valid = menuItems.filter(m => m.name && m.price);
        if (valid.length === 0) return toast.error('Add at least one menu item, or skip');
        // Find category IDs
        const catRes = await API.get('/menu');
        const catMap = {};
        (catRes.data.categories || []).forEach(c => { catMap[c.name] = c.id; });
        for (const item of valid) {
          await createMenuItem({
            name:          item.name,
            price:         parseFloat(item.price),
            prep_time_min: parseInt(item.prep_time_min) || 15,
            category_id:   catMap[item.category] || null,
            is_available:  true,
          });
        }
        toast.success(`${valid.length} menu items added!`);
      }

      if (cur.id === 'staff' && !skipSteps.staff) {
        const valid = staffList.filter(s => s.full_name && s.email && s.role_id);
        for (const s of valid) {
          try {
            await createEmployee({ ...s, password: 'changeme123', employee_type: 'full_time' });
          } catch { /* skip duplicates */ }
        }
        if (valid.length > 0) toast.success(`${valid.length} staff members added!`);
      }

      if (cur.id === 'done') {
        await completeSetup({ tables: [], categories: [], restaurant_info: null });
        navigate('/dashboard');
        return;
      }

      setStep(s => s + 1);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  };

  const skip = () => {
    setSkipSteps(s => ({ ...s, [cur.id]: true }));
    setStep(s => s + 1);
  };

  // ── Progress ───────────────────────────────────────────────────────────────
  const progress = Math.round((step / (WIZARD_STEPS.length - 1)) * 100);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'Syne', sans-serif", display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🍽</div>
          <span style={{ fontWeight: 800, fontSize: 15, color: T.text }}>Setup Wizard</span>
        </div>

        {/* Progress steps */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, flex: 1 }}>
          {WIZARD_STEPS.map((s, i) => (
            <React.Fragment key={s.id}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: i < step ? 'pointer' : 'default' }}
                onClick={() => i < step && setStep(i)}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: i < step ? T.green : i === step ? T.accent : T.border,
                  fontSize: i < step ? 13 : 12, fontWeight: 800,
                  color: i <= step ? '#000' : T.textDim, transition: 'all 0.3s',
                }}>{i < step ? '✓' : s.icon}</div>
                <span style={{ fontSize: 9, color: i === step ? T.accent : T.textDim, marginTop: 3, letterSpacing: 0.5, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {s.title}
                </span>
              </div>
              {i < WIZARD_STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2, background: i < step ? T.green : T.border, margin: '0 4px', marginBottom: 14, transition: 'background 0.3s', minWidth: 20 }} />
              )}
            </React.Fragment>
          ))}
        </div>

        <span style={{ fontSize: 12, color: T.textMid, flexShrink: 0 }}>{progress}% complete</span>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 700 }}>

          {/* Step header */}
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{cur.icon}</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: T.text, marginBottom: 6 }}>{cur.title}</h1>
            <p style={{ fontSize: 15, color: T.textMid }}>{cur.subtitle}</p>
          </div>

          {/* ── Welcome ── */}
          {cur.id === 'welcome' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              {[
                { icon:'🪑', title:'Tables',    desc:'Set up your dining floor with sections and capacities' },
                { icon:'🍽', title:'Menu',      desc:'Add categories and dishes with prices and photos' },
                { icon:'👥', title:'Staff',     desc:'Invite your team with roles and permissions' },
                { icon:'📦', title:'Inventory', desc:'Track stock levels and get low-stock alerts' },
                { icon:'📊', title:'Reports',   desc:'Revenue, orders, and financial reports' },
                { icon:'⚙️', title:'Settings',  desc:'Taxes, payment methods, alerts and integrations' },
              ].map(item => (
                <div key={item.title} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: '18px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 30, marginBottom: 10 }}>{item.icon}</div>
                  <div style={{ fontWeight: 700, color: T.text, fontSize: 14, marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              ))}
              <div style={{ gridColumn:'1/-1', background: T.accentGlow, border:`1px solid ${T.accent}44`, borderRadius:14, padding:'14px 18px', fontSize:13, color:T.text }}>
                👋 Welcome, <b>{user?.name}</b>! This wizard takes about <b>5 minutes</b>. You can skip any step and configure it later from Settings.
              </div>
            </div>
          )}

          {/* ── Tables ── */}
          {cur.id === 'tables' && (
            <div>
              {/* Presets */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Quick Presets</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {TABLE_PRESETS.map(p => (
                    <button key={p.label} onClick={() => applyTablePreset(p)} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily:"'Syne',sans-serif", fontWeight: 600 }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom add */}
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Add Custom Table</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Label</label>
                    <input value={customTable.label} onChange={e => setCustomTable(c => ({ ...c, label: e.target.value }))}
                      placeholder="T-01"
                      style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily:"'Syne',sans-serif", outline: 'none', width: '100%' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Section</label>
                    <select value={customTable.section} onChange={e => setCustomTable(c => ({ ...c, section: e.target.value }))}
                      style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily:"'Syne',sans-serif", outline: 'none', width: '100%' }}>
                      {['Main Hall','Terrace','VIP','Bar','Private','Outdoor'].map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 80 }}>
                    <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Seats</label>
                    <input type="number" min={1} max={50} value={customTable.capacity} onChange={e => setCustomTable(c => ({ ...c, capacity: parseInt(e.target.value) || 4 }))}
                      style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily:"'Syne',sans-serif", outline: 'none', width: '100%' }} />
                  </div>
                  <button onClick={addCustomTable} style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily:"'Syne',sans-serif", whiteSpace: 'nowrap' }}>+ Add</button>
                </div>
              </div>

              {/* Table grid preview */}
              {tables.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
                    {tables.length} Tables — Floor Preview
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {tables.map(t => (
                      <div key={t.label} style={{
                        background: T.card, border: `2px solid ${SECTION_COLORS[t.section] || T.border}22`,
                        borderLeft: `3px solid ${SECTION_COLORS[t.section] || T.accent}`,
                        borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 13, color: T.text }}>{t.label}</div>
                          <div style={{ fontSize: 10, color: T.textDim }}>{t.section} · {t.capacity} seats</div>
                        </div>
                        <button onClick={() => removeTable(t.label)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Categories ── */}
          {cur.id === 'categories' && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Restaurant Type Presets</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {Object.keys(CAT_PRESETS).map(name => (
                    <button key={name} onClick={() => applyCatPreset(name)} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 10, padding: '8px 16px', fontSize: 13, cursor: 'pointer', fontFamily:"'Syne',sans-serif", fontWeight: 600 }}>
                      {name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category tags */}
              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: categories.length > 0 ? 12 : 0 }}>
                  {categories.map((cat, i) => (
                    <div key={cat.name} style={{
                      background: T.accentGlow, border: `1px solid ${T.accent}66`,
                      borderRadius: 20, padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>{cat.name}</span>
                      <button onClick={() => setCategories(c => c.filter((_,idx) => idx !== i))}
                        style={{ background: 'none', border: 'none', color: T.accent, cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <input value={customCat} onChange={e => setCustomCat(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCustomCat()}
                    placeholder="Add custom category and press Enter…"
                    style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '9px 12px', color: T.text, fontSize: 13, fontFamily:"'Syne',sans-serif", outline: 'none' }} />
                  <button onClick={addCustomCat} style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily:"'Syne',sans-serif" }}>+ Add</button>
                </div>
              </div>
            </div>
          )}

          {/* ── Menu Items ── */}
          {cur.id === 'menu' && (
            <div>
              <div style={{ background: T.accentGlow, border:`1px solid ${T.accent}44`, borderRadius:12, padding:'10px 16px', marginBottom:16, fontSize:12, color:T.textMid }}>
                💡 Add a few sample items now. You can always add more from the <b style={{ color:T.accent }}>Menu Management</b> screen.
              </div>
              {menuItems.map((item, i) => (
                <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Item {i + 1}</span>
                    {menuItems.length > 1 && (
                      <button onClick={() => removeMenuItem(i)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 16 }}>×</button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0 10px' }}>
                    <div>
                      <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Item Name</label>
                      <input value={item.name} onChange={e => setMenuItem(i, 'name', e.target.value)} placeholder="e.g. Chicken Burger"
                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.text, fontSize: 12, fontFamily:"'Syne',sans-serif", outline: 'none', width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Price (PKR)</label>
                      <input type="number" value={item.price} onChange={e => setMenuItem(i, 'price', e.target.value)} placeholder="0"
                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.accent, fontSize: 12, fontFamily: 'monospace', outline: 'none', width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Category</label>
                      <select value={item.category} onChange={e => setMenuItem(i, 'category', e.target.value)}
                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.text, fontSize: 12, fontFamily:"'Syne',sans-serif", outline: 'none', width: '100%' }}>
                        <option value="">None</option>
                        {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Prep (min)</label>
                      <input type="number" value={item.prep_time_min} onChange={e => setMenuItem(i, 'prep_time_min', e.target.value)}
                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.text, fontSize: 12, fontFamily: 'monospace', outline: 'none', width: '100%' }} />
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addMenuItem} style={{ width:'100%', background:'transparent', border:`1px dashed ${T.border}`, color:T.textMid, borderRadius:10, padding:'10px', fontSize:13, cursor:'pointer', fontFamily:"'Syne',sans-serif" }}>
                + Add Another Item
              </button>
            </div>
          )}

          {/* ── Staff ── */}
          {cur.id === 'staff' && (
            <div>
              <div style={{ background: T.accentGlow, border:`1px solid ${T.accent}44`, borderRadius:12, padding:'10px 16px', marginBottom:16, fontSize:12, color:T.textMid }}>
                💡 Invite your team. They'll receive a temporary password (<b style={{ color:T.text }}>changeme123</b>) which they should change on first login.
              </div>
              {staffList.map((s, i) => (
                <div key={i} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Staff Member {i + 1}</span>
                    {staffList.length > 1 && (
                      <button onClick={() => removeStaff(i)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 16 }}>×</button>
                    )}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 10px' }}>
                    <div>
                      <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Full Name</label>
                      <input value={s.full_name} onChange={e => setStaff(i,'full_name',e.target.value)} placeholder="Ahmed Khan"
                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.text, fontSize: 12, fontFamily:"'Syne',sans-serif", outline: 'none', width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Email</label>
                      <input type="email" value={s.email} onChange={e => setStaff(i,'email',e.target.value)} placeholder="ahmed@restaurant.com"
                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.text, fontSize: 12, fontFamily:"'Syne',sans-serif", outline: 'none', width: '100%' }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: T.textMid, display: 'block', marginBottom: 4 }}>Role</label>
                      <select value={s.role_id} onChange={e => setStaff(i,'role_id',e.target.value)}
                        style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', color: T.text, fontSize: 12, fontFamily:"'Syne',sans-serif", outline: 'none', width: '100%' }}>
                        <option value="">— Select —</option>
                        {roles.filter(r => r.name !== 'Manager').map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addStaff} style={{ width:'100%', background:'transparent', border:`1px dashed ${T.border}`, color:T.textMid, borderRadius:10, padding:'10px', fontSize:13, cursor:'pointer', fontFamily:"'Syne',sans-serif" }}>
                + Add Another Staff Member
              </button>
            </div>
          )}

          {/* ── Done ── */}
          {cur.id === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 80, marginBottom: 20 }}>🎉</div>
              <h2 style={{ fontSize: 28, fontWeight: 800, color: T.text, marginBottom: 10 }}>
                {user?.restaurantName || 'Your restaurant'} is ready!
              </h2>
              <p style={{ fontSize: 15, color: T.textMid, marginBottom: 32 }}>
                Your setup is complete. Here's a summary of what was configured:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32, textAlign: 'left' }}>
                {[
                  { icon:'🪑', label:'Tables',    value: tables.length > 0 ? `${tables.length} tables` : 'Skipped', ok: tables.length > 0 },
                  { icon:'📋', label:'Categories', value: categories.length > 0 ? `${categories.length} categories` : 'Skipped', ok: categories.length > 0 },
                  { icon:'🍽', label:'Menu Items', value: menuItems.filter(m=>m.name&&m.price).length > 0 ? `${menuItems.filter(m=>m.name&&m.price).length} items` : 'Skipped', ok: menuItems.filter(m=>m.name&&m.price).length > 0 },
                  { icon:'👥', label:'Staff',      value: staffList.filter(s=>s.full_name&&s.email).length > 0 ? `${staffList.filter(s=>s.full_name&&s.email).length} members` : 'Skipped', ok: staffList.filter(s=>s.full_name&&s.email).length > 0 },
                ].map(item => (
                  <div key={item.label} style={{ background: item.ok ? T.greenDim : T.card, border: `1px solid ${item.ok ? T.green+'44' : T.border}`, borderRadius: 12, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 22 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: 12, color: T.textMid }}>{item.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: item.ok ? T.green : T.textDim }}>{item.value}</div>
                    </div>
                    <div style={{ marginLeft:'auto', fontSize:18 }}>{item.ok ? '✅' : '⏭'}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: T.accentGlow, border:`1px solid ${T.accent}44`, borderRadius:14, padding:'16px 20px', fontSize:13, color:T.textMid, textAlign:'left' }}>
                <b style={{ color:T.accent }}>💡 What you can do next:</b>
                <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[['📲','Take your first order from POS'],['📦','Add inventory items to track stock'],['🖼','Upload photos to your menu items'],['⚙️','Configure taxes and payment methods']].map(([ic,txt]) => (
                    <div key={txt} style={{ display:'flex', gap:8, alignItems:'center' }}>
                      <span>{ic}</span><span>{txt}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Nav buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 32, justifyContent: 'flex-end' }}>
            {step > 0 && step < WIZARD_STEPS.length - 1 && (
              <button onClick={() => setStep(s => s - 1)} style={{ background:'transparent', border:`1px solid ${T.border}`, color:T.textMid, borderRadius:12, padding:'12px 20px', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'Syne',sans-serif" }}>← Back</button>
            )}
            {!['welcome','done'].includes(cur.id) && (
              <button onClick={skip} style={{ background:'transparent', border:`1px solid ${T.border}`, color:T.textMid, borderRadius:12, padding:'12px 20px', fontSize:13, cursor:'pointer', fontFamily:"'Syne',sans-serif" }}>
                Skip for now ⏭
              </button>
            )}
            <button onClick={saveAndNext} disabled={saving} style={{
              background: saving ? T.border : cur.id === 'done' ? T.green : T.accent,
              color: saving ? T.textMid : cur.id === 'done' ? '#fff' : '#000',
              border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800,
              cursor: saving ? 'not-allowed' : 'pointer', fontFamily:"'Syne',sans-serif", minWidth:140,
            }}>
              {saving ? '⏳ Saving…' : cur.id === 'welcome' ? 'Let\'s start →' : cur.id === 'done' ? '🚀 Go to Dashboard' : 'Save & Continue →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
