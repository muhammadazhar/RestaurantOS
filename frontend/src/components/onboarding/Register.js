import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { register } from '../../services/api';
import API from '../../services/api';
import toast from 'react-hot-toast';

const THEME_OPTIONS = [
  { id: 'dark',    name: 'Dark Orange',   bg: '#0A0C10', card: '#181C24', accent: '#F5A623' },
  { id: 'ocean',   name: 'Ocean Blue',    bg: '#070D17', card: '#111E2D', accent: '#3498DB' },
  { id: 'purple',  name: 'Royal Purple',  bg: '#0C0910', card: '#1A1525', accent: '#9B59B6' },
  { id: 'emerald', name: 'Emerald Green', bg: '#071210', card: '#112420', accent: '#2ECC71' },
  { id: 'light',   name: 'Light Mode',    bg: '#ECEEF2', card: '#FFFFFF', accent: '#C47A0A' },
];

// Plans with multi-branch pricing info
const PLANS = [
  {
    id: 'starter', name: 'Starter', price: 'PKR 8,000/mo', priceNum: 8000,
    maxBranches: 1, staff: 15, discount: 0,
    features: ['POS', 'Tables', 'Inventory', 'Basic Reports'],
    branchNote: 'Single location only',
  },
  {
    id: 'pro', name: 'Pro', price: 'PKR 22,000/mo', priceNum: 22000,
    maxBranches: 3, staff: 50, discount: 15,
    features: ['Everything in Starter', 'Online Orders', 'GL & Accounting', 'Recipes', 'Analytics'],
    popular: true,
    branchNote: 'Up to 3 branches · 15% off per extra branch',
  },
  {
    id: 'enterprise', name: 'Enterprise', price: 'PKR 55,000/mo', priceNum: 55000,
    maxBranches: 10, staff: 200, discount: 25,
    features: ['Everything in Pro', 'Multi-branch', 'Priority Support', 'Custom Integrations'],
    branchNote: 'Up to 10 branches · 25% off per extra branch',
  },
];

const STEPS = ['Your Restaurant', 'Admin Account', 'Choose Plan', 'Review'];
const STEP_HINTS = [
  'Set up your main company or a new branch',
  'Your manager login credentials',
  'Choose the right plan for you',
  'Confirm and launch',
];

const emptyForm = (type = 'main', presetGroupId = '', presetTheme = 'dark') => ({
  restaurantType: type,          // 'main' | 'branch'
  company_group_id: presetGroupId,
  name: '', slug_override: '', email: '', phone: '',
  address: '', city: '', country: 'Pakistan', currency: 'PKR', timezone: 'Asia/Karachi',
  theme_id: localStorage.getItem('ros_theme') || presetTheme,
  admin_name: '', admin_password: '', admin_confirm: '', admin_pin: '',
  plan: 'pro',
});

export default function Register() {
  const { loginFromToken } = useAuth();
  const { mode, theme: T, toggle, setMode } = useTheme();
  const navigate = useNavigate();

  const [step, setStep]         = useState(0);
  const [saving, setSaving]     = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);
  const [form, setForm]         = useState(emptyForm());

  // Existing groups for branch selection
  const [groups, setGroups]     = useState([]);
  const [groupSearch, setGroupSearch] = useState('');

  // After successful company registration on a multi-branch plan:
  // postReg = { groupId, groupName } — show "add branch?" prompt
  const [postReg, setPostReg]   = useState(null);
  // When adding branch after registration (don't re-login)
  const [isBranchAddition, setIsBranchAddition] = useState(false);
  const [presetGroup, setPresetGroup] = useState(null); // { id, name } locked group for branch addition

  useEffect(() => {
    API.get('/auth/groups').then(r => setGroups(r.data)).catch(() => {});
  }, []);

  const set = k => e => {
    const val = e.target.value;
    setForm(f => {
      const update = { ...f, [k]: val };
      if (k === 'name' && !slugEdited) {
        update.slug_override = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
      return update;
    });
  };
  const setVal = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validateStep = () => {
    if (step === 0) {
      if (form.restaurantType === 'branch' && !form.company_group_id)
        return 'Please select a parent company';
      if (!form.name.trim()) return form.restaurantType === 'main' ? 'Company name is required' : 'Branch name is required';
      if (!form.slug_override.trim()) return 'Login slug is required';
      if (!form.email.trim())         return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email';
    }
    if (step === 1) {
      if (!form.admin_name.trim())        return 'Your full name is required';
      if (!form.admin_password)           return 'Password is required';
      if (form.admin_password.length < 6) return 'Password must be at least 6 characters';
      if (form.admin_password !== form.admin_confirm) return 'Passwords do not match';
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) return toast.error(err);
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = {
        restaurant_name: form.name,
        slug_override:   form.slug_override,
        email:           form.email,
        phone:           form.phone || undefined,
        address:         form.address || undefined,
        city:            form.city || undefined,
        country:         form.country,
        currency:        form.currency,
        timezone:        form.timezone,
        admin_name:      form.admin_name,
        admin_password:  form.admin_password,
        admin_pin:       form.admin_pin || undefined,
        ...(form.restaurantType === 'main'
          ? { company_name: form.name }                        // creates a new group
          : { company_group_id: form.company_group_id }),      // joins existing group
      };

      const res = await register(payload);

      // Only update auth session for the very first (main) registration
      if (!isBranchAddition) {
        loginFromToken(res.data.accessToken, res.data.refreshToken, res.data.user);
      }

      const selectedPlan = PLANS.find(p => p.id === form.plan);
      const groupId      = res.data.companyGroupId || res.data.user?.companyGroupId;

      // After main registration on a multi-branch plan → prompt to add branch
      if (!isBranchAddition && selectedPlan?.maxBranches > 1 && groupId) {
        setPostReg({ groupId, groupName: form.name });
        setSaving(false);
        return;
      }

      if (isBranchAddition) {
        toast.success(`Branch "${form.name}" created!`);
        // Ask to add another branch
        setPostReg({ groupId: presetGroup.id, groupName: presetGroup.name });
        setSaving(false);
        return;
      }

      toast.success(`Welcome, ${form.admin_name}! Let's set up your restaurant.`);
      navigate('/setup');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally { setSaving(false); }
  };

  // Start branch addition flow after main registration
  const startBranchSetup = () => {
    const { groupId, groupName } = postReg;
    setPostReg(null);
    setIsBranchAddition(true);
    setPresetGroup({ id: groupId, name: groupName });
    setSlugEdited(false);
    setStep(0);
    setForm(emptyForm('branch', groupId));
    setGroupSearch('');
  };

  const skipToSetup = () => navigate('/setup');

  const inp = {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
    padding: '11px 14px', color: T.text, fontSize: 14,
    fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%',
  };

  const selectedPlan   = PLANS.find(p => p.id === form.plan);
  const filteredGroups = groups.filter(g =>
    !groupSearch || g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  // ── Post-registration: "Add a branch?" prompt ──────────────────────────────
  if (postReg) {
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '48px 40px', maxWidth: 480, width: '100%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
          <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 8 }}>
            {isBranchAddition ? 'Branch Created!' : 'Company Set Up!'}
          </h2>
          <p style={{ fontSize: 14, color: T.textMid, marginBottom: 32, lineHeight: 1.6 }}>
            <b style={{ color: T.accent }}>{postReg.groupName}</b> is live.
            {isBranchAddition
              ? ' Would you like to add another branch?'
              : ` Your plan supports up to ${selectedPlan?.maxBranches} branches. Would you like to set up a branch now?`}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={startBranchSetup} style={{
              background: T.accent, color: '#000', border: 'none', borderRadius: 12,
              padding: '14px 24px', fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}>
              🏪 Set Up a Branch Now →
            </button>
            <button onClick={skipToSetup} style={{
              background: 'transparent', border: `1px solid ${T.border}`, color: T.textMid,
              borderRadius: 12, padding: '12px 24px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}>
              Skip for now — go to Setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main registration layout ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', fontFamily: "'Inter', sans-serif", transition: 'background 0.3s' }}>
      {/* Left panel */}
      <div style={{ width: 340, background: T.surface, borderRight: `1px solid ${T.border}`, padding: '40px 28px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🍽</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.text }}>RestaurantOS</div>
            <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 1 }}>
              {isBranchAddition ? 'ADD BRANCH' : 'NEW RESTAURANT SETUP'}
            </div>
          </div>
        </div>

        {isBranchAddition && presetGroup && (
          <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 10, padding: '10px 14px', marginBottom: 24, fontSize: 12 }}>
            <div style={{ color: T.textDim, marginBottom: 2 }}>Adding branch to:</div>
            <div style={{ color: T.accent, fontWeight: 700 }}>🏢 {presetGroup.name}</div>
          </div>
        )}

        <div style={{ flex: 1 }}>
          {STEPS.map((s, i) => {
            const done = i < step, current = i === step;
            return (
              <div key={s} style={{ display: 'flex', gap: 14, marginBottom: 26, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: done ? 15 : 12, fontWeight: 800, flexShrink: 0,
                    background: done ? T.green : current ? T.accent : T.border,
                    color: done || current ? '#000' : T.textDim,
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  {i < STEPS.length - 1 && <div style={{ width: 2, height: 22, background: done ? T.green : T.border, marginTop: 4 }} />}
                </div>
                <div style={{ paddingTop: 3 }}>
                  <div style={{ fontSize: 13, fontWeight: current ? 700 : 500, color: current ? T.text : done ? T.textMid : T.textDim }}>{s}</div>
                  {current && <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{STEP_HINTS[i]}</div>}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
          <p style={{ fontSize: 12, color: T.textMid }}>Already have an account?</p>
          <Link to="/login" style={{ fontSize: 12, color: T.accent, fontWeight: 700, textDecoration: 'none' }}>Sign in →</Link>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <button onClick={toggle} style={{ position: 'fixed', top: 20, right: 20, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, color: T.text }}>
          {mode === 'dark' ? '☀️' : '🌙'}
        </button>

        <div style={{ width: '100%', maxWidth: 560 }}>

          {/* ── Step 0: Your Restaurant ── */}
          {step === 0 && (
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 6 }}>Tell us about your restaurant</h2>
              <p style={{ fontSize: 14, color: T.textMid, marginBottom: 24 }}>This information appears on receipts and is used for staff login.</p>

              {/* Type selector — hidden when branch addition (type is locked) */}
              {!isBranchAddition && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 8 }}>What are you setting up? *</label>
                  <div style={{ display: 'flex', gap: 0, border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden' }}>
                    {[
                      ['main',   '🏢 Main Company / New Group'],
                      ['branch', '🏪 Branch of Existing Company'],
                    ].map(([val, label]) => (
                      <button key={val} onClick={() => { setVal('restaurantType', val); setVal('company_group_id', ''); }}
                        style={{ flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                          fontSize: 13, fontWeight: 700, transition: 'all 0.15s',
                          background: form.restaurantType === val ? T.accent : T.surface,
                          color:      form.restaurantType === val ? '#000' : T.textMid }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Branch: select parent company */}
              {form.restaurantType === 'branch' && !isBranchAddition && (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Parent Company *</label>
                  <input
                    style={{ ...inp, marginBottom: 8 }}
                    value={groupSearch}
                    onChange={e => setGroupSearch(e.target.value)}
                    placeholder="Search company groups…"
                  />
                  {groups.length === 0 ? (
                    <div style={{ fontSize: 12, color: T.textDim, padding: '10px 0' }}>No company groups found. Register a main company first.</div>
                  ) : (
                    <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {filteredGroups.map(g => {
                        const sel = form.company_group_id === g.id;
                        return (
                          <div key={g.id} onClick={() => setVal('company_group_id', g.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer',
                              background: sel ? T.accentGlow : T.card, border: `2px solid ${sel ? T.accent : T.border}`,
                              borderRadius: 10, transition: 'all 0.12s' }}>
                            <span style={{ fontSize: 16 }}>🏢</span>
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: T.text }}>{g.name}</span>
                            {sel && <span style={{ color: T.accent, fontSize: 14, fontWeight: 800 }}>✓</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={{ gridColumn: '1/-1', marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    {form.restaurantType === 'main' ? 'Company / Group Name *' : 'Branch Name *'}
                  </label>
                  <input style={inp} value={form.name} onChange={set('name')}
                    placeholder={form.restaurantType === 'main' ? 'e.g. The Golden Fork Group' : 'e.g. The Golden Fork — Downtown'} />
                </div>

                <div style={{ gridColumn: '1/-1', marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Login Slug * <span style={{ color: T.textDim, fontWeight: 400 }}>— staff use this to log in</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                    <span style={{ padding: '11px 10px', color: T.textDim, fontSize: 12, background: T.card, borderRight: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>restaurantos.com/</span>
                    <input style={{ ...inp, border: 'none', borderRadius: 0, flex: 1 }}
                      value={form.slug_override}
                      onChange={e => { setSlugEdited(true); set('slug_override')(e); }}
                      placeholder={form.restaurantType === 'main' ? 'golden-fork-group' : 'golden-fork-downtown'} />
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>Only lowercase letters, numbers and hyphens</div>
                </div>

                <div style={{ gridColumn: '1/-1', marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    {form.restaurantType === 'main' ? 'Company Email *' : 'Branch Email *'}
                    <span style={{ color: T.textDim, fontWeight: 400 }}>
                      {form.restaurantType === 'main' ? ' — also used for admin login' : ''}
                    </span>
                  </label>
                  <input style={inp} type="email" value={form.email} onChange={set('email')}
                    placeholder={form.restaurantType === 'main' ? 'info@company.com' : 'branch@company.com'} />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Phone</label>
                  <input style={inp} value={form.phone} onChange={set('phone')} placeholder="+92-21-0000000" />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>City</label>
                  <input style={inp} value={form.city} onChange={set('city')} placeholder="Karachi" />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Country</label>
                  <select style={inp} value={form.country} onChange={set('country')}>
                    <option>Pakistan</option><option>United Arab Emirates</option>
                    <option>Saudi Arabia</option><option>United Kingdom</option><option>United States</option>
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Currency</label>
                  <select style={inp} value={form.currency} onChange={set('currency')}>
                    <option value="PKR">PKR — Pakistani Rupee</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="AED">AED — UAE Dirham</option>
                    <option value="SAR">SAR — Saudi Riyal</option>
                    <option value="GBP">GBP — British Pound</option>
                  </select>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Timezone</label>
                  <select style={inp} value={form.timezone} onChange={set('timezone')}>
                    <option value="Asia/Karachi">Asia/Karachi (PKT +5)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GST +4)</option>
                    <option value="Asia/Riyadh">Asia/Riyadh (AST +3)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                  </select>
                </div>
                <div style={{ gridColumn: '1/-1', marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Address</label>
                  <input style={inp} value={form.address} onChange={set('address')} placeholder="Street address" />
                </div>
              </div>

              {/* Theme picker */}
              <div>
                <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 10 }}>Choose Your Theme</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {THEME_OPTIONS.map(opt => {
                    const selected = form.theme_id === opt.id;
                    return (
                      <div key={opt.id} onClick={() => { setVal('theme_id', opt.id); setMode(opt.id); }}
                        style={{ cursor: 'pointer', borderRadius: 12, border: `2px solid ${selected ? opt.accent : T.border}`,
                          padding: 8, background: opt.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 72,
                          boxShadow: selected ? `0 0 0 3px ${opt.accent}44` : 'none', transition: 'all 0.2s' }}>
                        <div style={{ width: 42, height: 28, borderRadius: 6, background: opt.card, border: `1px solid ${opt.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 20, height: 5, borderRadius: 3, background: opt.accent }} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: opt.accent, textAlign: 'center' }}>{opt.name}</div>
                        {selected && <div style={{ fontSize: 9, color: opt.accent }}>✓</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1: Admin Account ── */}
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 6 }}>Create your manager account</h2>
              <p style={{ fontSize: 14, color: T.textMid, marginBottom: 28 }}>
                This will be the admin account for <b style={{ color: T.accent }}>{form.name}</b>.
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Your Full Name *</label>
                <input style={inp} value={form.admin_name} onChange={set('admin_name')} placeholder="Ahmed Khan" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Login Email <span style={{ color: T.textDim, fontWeight: 400 }}>— same as {form.restaurantType === 'main' ? 'company' : 'branch'} email</span>
                </label>
                <input style={{ ...inp, background: T.card, color: T.textDim }} value={form.email} readOnly />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Password * (min 6 chars)</label>
                  <input style={inp} type="password" value={form.admin_password} onChange={set('admin_password')} placeholder="••••••••" />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Confirm Password *</label>
                  <input style={{ ...inp, borderColor: form.admin_confirm && form.admin_confirm !== form.admin_password ? '#E74C3C' : T.border }}
                    type="password" value={form.admin_confirm} onChange={set('admin_confirm')} placeholder="••••••••" />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  POS PIN (4 digits) <span style={{ color: T.textDim, fontWeight: 400 }}>— optional, for quick POS login</span>
                </label>
                <input style={{ ...inp, maxWidth: 160 }} type="text" maxLength={4} value={form.admin_pin} onChange={set('admin_pin')} placeholder="1234" />
              </div>
              {form.admin_password && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{ flex: 1, height: 4, borderRadius: 2,
                        background: form.admin_password.length >= i*2 ? (form.admin_password.length >= 8 ? T.green : T.accent) : T.border }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim }}>
                    {form.admin_password.length < 6 ? 'Too short' : form.admin_password.length < 8 ? 'Weak' : form.admin_password.length < 12 ? 'Good' : 'Strong'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Choose Plan ── */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 6 }}>Choose your plan</h2>
              <p style={{ fontSize: 14, color: T.textMid, marginBottom: 28 }}>
                All plans start with a <b style={{ color: T.green }}>14-day free trial</b>. No credit card required.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {PLANS.map(plan => (
                  <div key={plan.id} onClick={() => setVal('plan', plan.id)} style={{
                    background: form.plan === plan.id ? T.accentGlow : T.card,
                    border: `2px solid ${form.plan === plan.id ? T.accent : T.border}`,
                    borderRadius: 16, padding: '18px 20px', cursor: 'pointer', transition: 'all 0.2s', position: 'relative',
                  }}>
                    {plan.popular && (
                      <div style={{ position: 'absolute', top: -10, left: 20, background: T.accent, color: '#000', borderRadius: 20, padding: '2px 12px', fontSize: 11, fontWeight: 800 }}>
                        ⭐ Most Popular
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{plan.name}</div>
                        <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>Up to {plan.staff} staff</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: form.plan === plan.id ? T.accent : T.text, fontFamily: 'monospace' }}>{plan.price}</div>
                        <div style={{ fontSize: 10, color: T.green, marginTop: 2 }}>14 days free</div>
                      </div>
                    </div>

                    {/* Branch info banner */}
                    <div style={{ marginBottom: 10, padding: '6px 10px', borderRadius: 8,
                      background: plan.maxBranches > 1 ? `${T.green}18` : T.surface,
                      border: `1px solid ${plan.maxBranches > 1 ? T.green + '44' : T.border}`,
                      fontSize: 12, color: plan.maxBranches > 1 ? T.green : T.textDim, fontWeight: 600 }}>
                      {plan.maxBranches > 1
                        ? `🏢 ${plan.branchNote}`
                        : `🏪 ${plan.branchNote}`}
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {plan.features.map(f => (
                        <span key={f} style={{ fontSize: 11, color: T.textMid, background: T.surface, borderRadius: 20, padding: '3px 10px' }}>✓ {f}</span>
                      ))}
                    </div>
                    {form.plan === plan.id && (
                      <div style={{ position: 'absolute', top: 16, right: 20, width: 22, height: 22, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#000' }}>✓</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Discount table */}
              <div style={{ marginTop: 20, background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '14px 18px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>🏢 Multi-branch subscription discounts</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {[['2 branches', '10% off'], ['3 branches', '15% off'], ['5 branches', '20% off'], ['10+ branches', '25% off']].map(([label, disc]) => (
                    <div key={label} style={{ textAlign: 'center', background: T.surface, borderRadius: 8, padding: '8px 4px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.green }}>{disc}</div>
                      <div style={{ fontSize: 10, color: T.textDim }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 3: Review ── */}
          {step === 3 && (
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 6 }}>Review & Launch 🚀</h2>
              <p style={{ fontSize: 14, color: T.textMid, marginBottom: 28 }}>Everything looks good? Hit launch to create your account.</p>

              <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden', marginBottom: 20 }}>
                {[
                  [form.restaurantType === 'main' ? '🏢 Company' : '🏪 Branch', form.name],
                  ['🔗 Login Slug', form.slug_override],
                  ['📧 Email', form.email],
                  ['📍 Location', [form.city, form.country].filter(Boolean).join(', ') || '—'],
                  ['💰 Currency', form.currency],
                  ['👤 Manager', form.admin_name],
                  ...(!isBranchAddition ? [['📋 Plan', `${selectedPlan?.name} — ${selectedPlan?.price} (14-day trial)`]] : []),
                  ['🎨 Theme', THEME_OPTIONS.find(t => t.id === form.theme_id)?.name || 'Dark Orange'],
                ].map(([label, value], i) => (
                  <div key={label} style={{ display: 'flex', padding: '13px 18px', borderTop: i ? `1px solid ${T.border}` : 'none' }}>
                    <span style={{ fontSize: 13, color: T.textMid, width: 150, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{value}</span>
                  </div>
                ))}
              </div>

              {!isBranchAddition && selectedPlan?.maxBranches > 1 && (
                <div style={{ background: `${T.green}15`, border: `1px solid ${T.green}44`, borderRadius: 12, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: T.textMid }}>
                  🏢 <b style={{ color: T.green }}>Multi-branch plan selected</b> — after launch you'll be asked to set up your first branch.
                </div>
              )}

              <div style={{ background: T.greenDim, border: `1px solid ${T.green}44`, borderRadius: 12, padding: '14px 18px', fontSize: 13, color: T.text }}>
                <b style={{ color: T.green }}>✓ What happens next:</b>
                <ul style={{ marginTop: 8, paddingLeft: 16, color: T.textMid, lineHeight: 1.8 }}>
                  <li>Your account is created instantly</li>
                  {!isBranchAddition && <li>You'll be taken to the Setup Wizard to configure tables, menu & staff</li>}
                  {!isBranchAddition && <li>Your 14-day free trial starts today — no payment needed</li>}
                  <li>All data is saved securely on your server</li>
                </ul>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 28 }}>
            {step > 0 && (
              <button onClick={() => setStep(s => s - 1)} style={{
                background: 'transparent', border: `1px solid ${T.border}`, color: T.textMid,
                borderRadius: 12, padding: '14px 24px', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              }}>← Back</button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={next} style={{
                flex: 1, background: T.accent, color: '#000', border: 'none',
                borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800,
                cursor: 'pointer', fontFamily: "'Inter', sans-serif",
              }}>Continue →</button>
            ) : (
              <button onClick={handleSubmit} disabled={saving} style={{
                flex: 1, background: saving ? T.border : T.green, color: saving ? T.textMid : '#fff',
                border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800,
                cursor: saving ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif",
              }}>
                {saving ? '⏳ Creating…' : isBranchAddition ? '🏪 Launch Branch' : '🚀 Launch My Restaurant'}
              </button>
            )}
          </div>

          {step === 0 && !isBranchAddition && (
            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: T.textDim }}>
              By registering you agree to our Terms of Service and Privacy Policy.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
