import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { register } from '../../services/api';
import toast from 'react-hot-toast';

const THEME_OPTIONS = [
  { id: 'dark',    name: 'Dark Orange',   bg: '#0A0C10', card: '#181C24', accent: '#F5A623' },
  { id: 'ocean',   name: 'Ocean Blue',    bg: '#070D17', card: '#111E2D', accent: '#3498DB' },
  { id: 'purple',  name: 'Royal Purple',  bg: '#0C0910', card: '#1A1525', accent: '#9B59B6' },
  { id: 'emerald', name: 'Emerald Green', bg: '#071210', card: '#112420', accent: '#2ECC71' },
  { id: 'light',   name: 'Light Mode',    bg: '#ECEEF2', card: '#FFFFFF', accent: '#C47A0A' },
];

const PLANS = [
  { id: 'starter',    name: 'Starter',    price: 'PKR 8,000/mo',  tables: 10,  staff: 15,  features: ['POS', 'Tables', 'Inventory', 'Basic Reports'] },
  { id: 'pro',        name: 'Pro',        price: 'PKR 22,000/mo', tables: 30,  staff: 50,  features: ['Everything in Starter', 'Online Orders', 'GL & Accounting', 'Recipes', 'Analytics'], popular: true },
  { id: 'enterprise', name: 'Enterprise', price: 'PKR 55,000/mo', tables: 100, staff: 200, features: ['Everything in Pro', 'Multi-branch', 'Priority Support', 'Custom Integrations'] },
];

const STEPS = ['Restaurant', 'Admin Account', 'Choose Plan', 'Review'];

export default function Register() {
  const { loginFromToken } = useAuth();
  const { mode, theme: T, toggle, setMode } = useTheme();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [slugEdited, setSlugEdited] = useState(false);

  const [form, setForm] = useState({
    // Step 0 — Restaurant
    restaurant_name: '', slug_override: '', email: '', phone: '',
    address: '', city: '', country: 'Pakistan', currency: 'PKR', timezone: 'Asia/Karachi',
    // Step 1 — Admin
    admin_name: '', admin_password: '', admin_confirm: '', admin_pin: '',
    // Step 2 — Plan
    plan: 'pro',
    // Theme
    theme_id: localStorage.getItem('ros_theme') || 'dark',
  });

  const set = k => e => {
    const val = e.target.value;
    setForm(f => {
      const update = { ...f, [k]: val };
      // Auto-generate slug from restaurant name (unless manually edited)
      if (k === 'restaurant_name' && !slugEdited) {
        update.slug_override = val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      }
      return update;
    });
  };

  const setVal = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validateStep = () => {
    if (step === 0) {
      if (!form.restaurant_name.trim()) return 'Restaurant name is required';
      if (!form.slug_override.trim())   return 'URL slug is required';
      if (!form.email.trim())           return 'Email is required';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return 'Enter a valid email';
    }
    if (step === 1) {
      if (!form.admin_name.trim())     return 'Your full name is required';
      if (!form.admin_password)        return 'Password is required';
      if (form.admin_password.length < 6) return 'Password must be at least 6 characters';
      if (form.admin_password !== form.admin_confirm) return 'Passwords do not match';
    }
    return null;
  };

  const next = () => {
    const err = validateStep();
    if (err) return toast.error(err);
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const res = await register({
        restaurant_name: form.restaurant_name,
        slug_override:   form.slug_override,
        email:           form.email,
        phone:           form.phone,
        address:         form.address,
        city:            form.city,
        country:         form.country,
        currency:        form.currency,
        timezone:        form.timezone,
        admin_name:      form.admin_name,
        admin_password:  form.admin_password,
        admin_pin:       form.admin_pin || undefined,
      });

      // Store tokens + user in AuthContext (same as a normal login)
      loginFromToken(res.data.accessToken, res.data.refreshToken, res.data.user);

      toast.success(`Welcome, ${form.admin_name}! Let's set up your restaurant.`);
      navigate('/setup');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed');
    } finally { setSaving(false); }
  };

  const inp = {
    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
    padding: '11px 14px', color: T.text, fontSize: 14,
    fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%',
  };

  const selectedPlan = PLANS.find(p => p.id === form.plan);

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', fontFamily: "'Inter', sans-serif", transition: 'background 0.3s' }}>
      {/* Left panel */}
      <div style={{ width: 360, background: T.surface, borderRight: `1px solid ${T.border}`, padding: '40px 32px', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🍽</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: T.text }}>RestaurantOS</div>
            <div style={{ fontSize: 11, color: T.textMid, letterSpacing: 1 }}>NEW RESTAURANT SETUP</div>
          </div>
        </div>

        {/* Steps */}
        <div style={{ flex: 1 }}>
          {STEPS.map((s, i) => {
            const done    = i < step;
            const current = i === step;
            return (
              <div key={s} style={{ display: 'flex', gap: 16, marginBottom: 28, alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: done ? 16 : 13, fontWeight: 800,
                    background: done ? T.green : current ? T.accent : T.border,
                    color: done || current ? '#000' : T.textDim,
                    flexShrink: 0,
                  }}>
                    {done ? '✓' : i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ width: 2, height: 24, background: done ? T.green : T.border, marginTop: 4 }} />
                  )}
                </div>
                <div style={{ paddingTop: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: current ? 700 : 500, color: current ? T.text : done ? T.textMid : T.textDim }}>
                    {s}
                  </div>
                  {current && (
                    <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>
                      {['Basic details about your restaurant', 'Your manager login credentials', 'Choose the right plan for you', 'Confirm and launch'][i]}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Already have account */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 20 }}>
          <p style={{ fontSize: 13, color: T.textMid }}>Already have an account?</p>
          <Link to="/login" style={{ fontSize: 13, color: T.accent, fontWeight: 700, textDecoration: 'none' }}>Sign in →</Link>
        </div>
      </div>

      {/* Right panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        {/* Theme toggle */}
        <button onClick={toggle} style={{ position: 'fixed', top: 20, right: 20, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, color: T.text }}>
          {mode === 'dark' ? '☀️' : '🌙'}
        </button>

        <div style={{ width: '100%', maxWidth: 540 }}>
          {/* ── Step 0: Restaurant Info ── */}
          {step === 0 && (
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 6 }}>Tell us about your restaurant</h2>
              <p style={{ fontSize: 14, color: T.textMid, marginBottom: 28 }}>This information will be used throughout your account and on receipts.</p>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <div style={{ gridColumn: '1/-1', marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Restaurant Name *</label>
                  <input style={inp} value={form.restaurant_name} onChange={set('restaurant_name')} placeholder="e.g. The Golden Fork" />
                </div>

                <div style={{ gridColumn: '1/-1', marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                    Login Slug * <span style={{ color: T.textDim, fontWeight: 400 }}>— staff use this to log in</span>
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
                    <span style={{ padding: '11px 12px', color: T.textDim, fontSize: 13, background: T.card, borderRight: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>restaurantos.com/</span>
                    <input
                      style={{ ...inp, border: 'none', borderRadius: 0, flex: 1 }}
                      value={form.slug_override}
                      onChange={e => { setSlugEdited(true); set('slug_override')(e); }}
                      placeholder="golden-fork"
                    />
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim, marginTop: 4 }}>Only lowercase letters, numbers and hyphens</div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Email Address *</label>
                  <input style={inp} type="email" value={form.email} onChange={set('email')} placeholder="info@restaurant.com" />
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
              <div style={{ marginTop: 8, marginBottom: 4 }}>
                <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 10 }}>Choose Your Theme</label>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {THEME_OPTIONS.map(opt => {
                    const selected = form.theme_id === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => { setVal('theme_id', opt.id); setMode(opt.id); }}
                        style={{
                          cursor: 'pointer', borderRadius: 14,
                          border: `2px solid ${selected ? opt.accent : T.border}`,
                          padding: 10, background: opt.bg,
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                          minWidth: 80, transition: 'all 0.2s',
                          boxShadow: selected ? `0 0 0 3px ${opt.accent}44` : 'none',
                        }}
                      >
                        {/* Mini preview */}
                        <div style={{ width: 48, height: 32, borderRadius: 8, background: opt.card, border: `1px solid ${opt.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 24, height: 6, borderRadius: 3, background: opt.accent }} />
                        </div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: opt.accent, textAlign: 'center', lineHeight: 1.3 }}>{opt.name}</div>
                        {selected && <div style={{ fontSize: 9, color: opt.accent }}>✓ Selected</div>}
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
              <p style={{ fontSize: 14, color: T.textMid, marginBottom: 28 }}>This will be the main admin account for <b style={{ color: T.accent }}>{form.restaurant_name}</b>.</p>

              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>Your Full Name *</label>
                <input style={inp} value={form.admin_name} onChange={set('admin_name')} placeholder="Ahmed Khan" />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, color: T.textMid, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Login Email <span style={{ color: T.textDim, fontWeight: 400 }}>— same as restaurant email</span>
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

              {/* Password strength indicator */}
              {form.admin_password && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: form.admin_password.length >= i*2 ? (form.admin_password.length >= 8 ? T.green : T.accent) : T.border }} />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: T.textDim }}>
                    {form.admin_password.length < 6 ? 'Too short' : form.admin_password.length < 8 ? 'Weak' : form.admin_password.length < 12 ? 'Good' : 'Strong'}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Step 2: Plan ── */}
          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: T.text, marginBottom: 6 }}>Choose your plan</h2>
              <p style={{ fontSize: 14, color: T.textMid, marginBottom: 28 }}>All plans start with a <b style={{ color: T.green }}>14-day free trial</b>. No credit card required.</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {PLANS.map(plan => (
                  <div key={plan.id} onClick={() => setVal('plan', plan.id)} style={{
                    background: form.plan === plan.id ? T.accentGlow : T.card,
                    border: `2px solid ${form.plan === plan.id ? T.accent : T.border}`,
                    borderRadius: 16, padding: '18px 20px', cursor: 'pointer', transition: 'all 0.2s',
                    position: 'relative',
                  }}>
                    {plan.popular && (
                      <div style={{ position: 'absolute', top: -10, left: 20, background: T.accent, color: '#000', borderRadius: 20, padding: '2px 12px', fontSize: 11, fontWeight: 800 }}>
                        ⭐ Most Popular
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{plan.name}</div>
                        <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>Up to {plan.tables} tables · {plan.staff} staff</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: form.plan === plan.id ? T.accent : T.text, fontFamily: 'monospace' }}>{plan.price}</div>
                        <div style={{ fontSize: 10, color: T.green, marginTop: 2 }}>14 days free</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {plan.features.map(f => (
                        <span key={f} style={{ fontSize: 11, color: T.textMid, background: T.surface, borderRadius: 20, padding: '3px 10px' }}>
                          ✓ {f}
                        </span>
                      ))}
                    </div>
                    {form.plan === plan.id && (
                      <div style={{ position: 'absolute', top: 16, right: 20, width: 22, height: 22, borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#000' }}>✓</div>
                    )}
                  </div>
                ))}
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
                  ['🏪 Restaurant', form.restaurant_name],
                  ['🔗 Login Slug', form.slug_override],
                  ['📧 Email', form.email],
                  ['📍 Location', [form.city, form.country].filter(Boolean).join(', ') || '—'],
                  ['💰 Currency', form.currency],
                  ['👤 Manager', form.admin_name],
                  ['📋 Plan', `${selectedPlan?.name} — ${selectedPlan?.price} (14-day trial)`],
                  ['🎨 Theme', THEME_OPTIONS.find(t => t.id === form.theme_id)?.name || 'Dark Orange'],
                ].map(([label, value], i) => (
                  <div key={label} style={{ display: 'flex', padding: '13px 18px', borderTop: i ? `1px solid ${T.border}` : 'none' }}>
                    <span style={{ fontSize: 13, color: T.textMid, width: 150, flexShrink: 0 }}>{label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: T.greenDim, border: `1px solid ${T.green}44`, borderRadius: 12, padding: '14px 18px', marginBottom: 20, fontSize: 13, color: T.text }}>
                <b style={{ color: T.green }}>✓ What happens next:</b>
                <ul style={{ marginTop: 8, paddingLeft: 16, color: T.textMid, lineHeight: 1.8 }}>
                  <li>Your account is created instantly</li>
                  <li>You'll be taken to the Setup Wizard to configure tables, menu & staff</li>
                  <li>Your 14-day free trial starts today — no payment needed</li>
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
                {saving ? '⏳ Creating your account…' : '🚀 Launch My Restaurant'}
              </button>
            )}
          </div>

          {step === 0 && (
            <p style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: T.textDim }}>
              By registering you agree to our Terms of Service and Privacy Policy.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
