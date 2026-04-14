import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import API from '../../services/api';
import toast from 'react-hot-toast';

// Login phases: 'company' → 'branch' → 'credentials'  |  or 'direct' for slug login
export default function Login() {
  const { login }         = useAuth();
  const { mode, theme: T, toggle } = useTheme();
  const navigate          = useNavigate();

  const [phase, setPhase]         = useState('company');
  const [loading, setLoading]     = useState(false);

  // Company phase
  const [groups, setGroups]       = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupSearch, setGroupSearch]     = useState('');
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Branch phase
  const [branches, setBranches]   = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [selectedBranch, setSelectedBranch]   = useState(null);

  // Credentials phase
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Direct slug login (fallback for restaurants not in a group)
  const [directSlug, setDirectSlug] = useState('');

  useEffect(() => {
    API.get('/auth/groups')
      .then(r => setGroups(r.data))
      .catch(() => setGroups([]))
      .finally(() => setGroupsLoading(false));
  }, []);

  const selectGroup = async (group) => {
    setSelectedGroup(group);
    setSelectedBranch(null);
    setBranches([]);
    setBranchesLoading(true);
    setPhase('branch');
    try {
      const r = await API.get(`/auth/groups/${group.id}/restaurants`);
      setBranches(r.data);
    } catch {
      toast.error('Could not load branches');
    } finally { setBranchesLoading(false); }
  };

  const selectBranch = (branch) => {
    setSelectedBranch(branch);
    setPhase('credentials');
  };

  const submit = async e => {
    e.preventDefault();
    const slug = phase === 'direct' ? directSlug.trim() : selectedBranch?.slug;
    if (!slug) return toast.error('Restaurant slug required');
    setLoading(true);
    try {
      const user = await login(email, password, slug);
      toast.success(`Welcome, ${user.name}!`);
      const perms = user.permissions || [];
      const PERM_ROUTES = [
        ['dashboard', '/dashboard'], ['pos', '/pos'], ['kitchen', '/kitchen'],
        ['tables', '/tables'], ['inventory', '/inventory'],
        ['recipes', '/recipes'], ['employees', '/employees'],
        ['attendance', '/attendance'], ['gl', '/ledger'],
      ];
      const landing = PERM_ROUTES.find(([p]) => perms.includes(p));
      navigate(landing ? landing[1] : '/alerts');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Login failed');
    } finally { setLoading(false); }
  };

  const inp = {
    background: T.surface, border: `1px solid ${T.border}`,
    borderRadius: 10, padding: '12px 14px', color: T.text,
    fontSize: 14, fontFamily: "'Inter', sans-serif", outline: 'none', width: '100%',
  };

  const filteredGroups = groups.filter(g =>
    !groupSearch || g.name.toLowerCase().includes(groupSearch.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", transition: 'background 0.3s' }}>
      <button onClick={toggle} style={{ position: 'fixed', top: 20, right: 20, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 16, color: T.text }}>
        {mode === 'dark' ? '☀️' : '🌙'}
      </button>

      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 20, padding: '36px 32px', width: '100%', maxWidth: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 6 }}>🍽</div>
        <h1 style={{ color: T.text, textAlign: 'center', fontSize: 22, fontWeight: 800, margin: 0 }}>RestaurantOS</h1>
        <p style={{ color: T.textMid, textAlign: 'center', fontSize: 13, marginTop: 4, marginBottom: 20 }}>Sign in to your restaurant</p>

        {/* Breadcrumb */}
        {phase !== 'direct' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={() => { setPhase('company'); setSelectedGroup(null); setSelectedBranch(null); }}
              style={{ background: phase === 'company' ? T.accent + '22' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                fontSize: 12, fontWeight: 700, color: phase === 'company' ? T.accent : T.textMid, padding: '4px 8px', borderRadius: 6 }}>
              🏢 Company
            </button>
            {selectedGroup && <>
              <span style={{ color: T.textDim, fontSize: 12 }}>›</span>
              <button onClick={() => { setPhase('branch'); setSelectedBranch(null); }}
                style={{ background: phase === 'branch' ? T.accent + '22' : 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                  fontSize: 12, fontWeight: 700, color: phase === 'branch' ? T.accent : T.textMid, padding: '4px 8px', borderRadius: 6 }}>
                🏪 Branch
              </button>
            </>}
            {selectedBranch && <>
              <span style={{ color: T.textDim, fontSize: 12 }}>›</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.accent, padding: '4px 8px', borderRadius: 6, background: T.accent + '22' }}>
                🔑 Sign In
              </span>
            </>}
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <button onClick={() => { setPhase('company'); setDirectSlug(''); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'Inter', sans-serif",
                fontSize: 12, color: T.textMid, padding: 0 }}>
              ← Back to company list
            </button>
          </div>
        )}

        {/* ── Phase: Company ── */}
        {phase === 'company' && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid, marginBottom: 10 }}>Select your company / group</div>
            <input
              style={{ ...inp, marginBottom: 10 }}
              value={groupSearch}
              onChange={e => setGroupSearch(e.target.value)}
              placeholder="Search company…"
              autoFocus
            />
            {groupsLoading ? (
              <div style={{ textAlign: 'center', padding: 24, color: T.textDim }}>Loading…</div>
            ) : filteredGroups.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: T.textDim, fontSize: 13 }}>
                {groups.length === 0 ? 'No companies registered yet.' : 'No match found.'}
              </div>
            ) : (
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filteredGroups.map(g => (
                  <div key={g.id} onClick={() => selectGroup(g)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer',
                      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: T.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🏢</div>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.text }}>{g.name}</div>
                    <span style={{ color: T.textDim, fontSize: 16 }}>›</span>
                  </div>
                ))}
              </div>
            )}

            {/* Fallback for restaurants not in any group */}
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}`, textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: T.textDim, marginBottom: 8 }}>Restaurant not in the list?</div>
              <button onClick={() => { setPhase('direct'); setEmail(''); setPassword(''); }}
                style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 16px',
                  cursor: 'pointer', fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: T.textMid }}>
                Sign in with restaurant slug →
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: Branch ── */}
        {phase === 'branch' && (
          <div>
            <div style={{ fontSize: 13, color: T.textMid, marginBottom: 12 }}>
              <span style={{ fontWeight: 600, color: T.text }}>{selectedGroup?.name}</span> — select a branch
            </div>
            {branchesLoading ? (
              <div style={{ textAlign: 'center', padding: 24, color: T.textDim }}>Loading branches…</div>
            ) : branches.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 20, color: T.textDim, fontSize: 13 }}>No branches found under this company.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {branches.map(b => (
                  <div key={b.id} onClick={() => selectBranch(b)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', cursor: 'pointer',
                      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, transition: 'all 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: T.accent + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>🏪</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{b.name}</div>
                      {(b.branch_code || b.city) && (
                        <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>
                          {[b.branch_code, b.city].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <span style={{ color: T.textDim, fontSize: 16 }}>›</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Phase: Credentials (after branch selection) ── */}
        {phase === 'credentials' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 18 }}>🏪</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{selectedBranch?.name}</div>
                <div style={{ fontSize: 11, color: T.textDim }}>{selectedGroup?.name}</div>
              </div>
            </div>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 4, letterSpacing: 0.5 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@restaurant.com" style={inp} required autoFocus />
              <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, letterSpacing: 0.5 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={inp} required />
              <button type="submit" disabled={loading} style={{ marginTop: 18, background: T.accent, color: '#000', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {loading ? 'Signing in…' : 'Sign In →'}
              </button>
            </form>
          </div>
        )}

        {/* ── Phase: Direct slug login (fallback) ── */}
        {phase === 'direct' && (
          <div>
            <div style={{ fontSize: 13, color: T.textMid, marginBottom: 16 }}>
              Enter your restaurant slug and credentials directly.
            </div>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>Restaurant Slug</label>
              <div style={{ display: 'flex', alignItems: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
                <span style={{ padding: '12px 10px', color: T.textDim, fontSize: 12, background: T.card, borderRight: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>restaurantos.com/</span>
                <input
                  value={directSlug} onChange={e => setDirectSlug(e.target.value)}
                  placeholder="golden-fork" style={{ ...inp, border: 'none', borderRadius: 0, flex: 1 }}
                  required autoFocus
                />
              </div>
              <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 4, letterSpacing: 0.5 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@restaurant.com" style={inp} required />
              <label style={{ color: T.textMid, fontSize: 12, fontWeight: 600, marginBottom: 4, marginTop: 10, letterSpacing: 0.5 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" style={inp} required />
              <button type="submit" disabled={loading} style={{ marginTop: 18, background: T.accent, color: '#000', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: "'Inter', sans-serif" }}>
                {loading ? 'Signing in…' : 'Sign In →'}
              </button>
            </form>
          </div>
        )}

        <p style={{ marginTop: 20, fontSize: 12, color: T.textMid, textAlign: 'center' }}>
          Super Admin? <Link to="/super-login" style={{ color: T.accent }}>Login here</Link>
        </p>
        <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: T.textMid, marginBottom: 8 }}>Don't have an account yet?</p>
          <Link to="/register" style={{
            display: 'inline-block', background: T.surface, border: `1px solid ${T.border}`,
            color: T.text, borderRadius: 10, padding: '10px 24px', fontSize: 13, fontWeight: 700,
            textDecoration: 'none',
          }}>🏪 Register Your Restaurant →</Link>
        </div>
      </div>
    </div>
  );
}
