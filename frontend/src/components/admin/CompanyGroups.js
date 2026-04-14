import React, { useEffect, useState, useCallback } from 'react';
import { Card, Btn, Spinner, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';
import API from '../../services/api';

const getGroups              = ()     => API.get('/admin/groups');
const createGroup            = (d)    => API.post('/admin/groups', d);
const updateGroup            = (id,d) => API.put(`/admin/groups/${id}`, d);
const getGroupBranches       = (gid)  => API.get(`/admin/groups/${gid}/branches`);
const assignBranch           = (gid,d)=> API.post(`/admin/groups/${gid}/assign`, d);
const removeBranch           = (gid,rid)=> API.delete(`/admin/groups/${gid}/branches/${rid}`);
const getUnassigned          = ()     => API.get('/admin/unassigned-restaurants');
const getDiscountTiers       = ()     => API.get('/admin/branch-discounts');
const saveDiscountTiers      = (d)    => API.post('/admin/branch-discounts', d);
const getConsolidatedTB      = (gid,p)=> API.get(`/admin/groups/${gid}/consolidated-tb`, { params: p });

const STATUS_COLOR = { active: '#2ecc71', suspended: '#e74c3c' };

// ── Discount Tier Editor ──────────────────────────────────────────────────────
function DiscountTiers() {
  useT();
  const [tiers,   setTiers]   = useState([]);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => {
    getDiscountTiers().then(r => setTiers(r.data)).catch(() => {});
  }, []);

  const set = (i, field, val) => setTiers(p => p.map((t,idx) => idx===i ? { ...t, [field]: val } : t));
  const add = () => setTiers(p => [...p, { min_branches: '', discount_pct: '' }]);
  const del = (i) => setTiers(p => p.filter((_,idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      await saveDiscountTiers({ tiers });
      toast.success('Discount tiers saved!');
    } catch { toast.error('Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>🎁 Multi-Branch Discount Tiers</div>
          <div style={{ fontSize: 12, color: T.textMid }}>Automatic discounts applied when a group subscribes multiple branches to the same module.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn size="sm" onClick={add} style={{ background: T.card, color: T.text, border: `1px solid ${T.border}` }}>+ Add Tier</Btn>
          <Btn size="sm" onClick={save} disabled={saving}>{saving ? '⏳' : '✓ Save'}</Btn>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px 12px', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase' }}>Min Branches</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase' }}>Discount %</div>
        <div />
        {tiers.map((t, i) => (
          <React.Fragment key={i}>
            <input
              type="number" min={2} value={t.min_branches}
              onChange={e => set(i, 'min_branches', e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none' }}
            />
            <input
              type="number" min={0} max={100} step={0.5} value={t.discount_pct}
              onChange={e => set(i, 'discount_pct', e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none' }}
            />
            <button onClick={() => del(i)} style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 16 }}>×</button>
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
}

// ── Group Row with expandable branches ───────────────────────────────────────
function GroupRow({ group, onRefresh }) {
  useT();
  const [expanded,    setExpanded]    = useState(false);
  const [branches,    setBranches]    = useState(null);
  const [unassigned,  setUnassigned]  = useState([]);
  const [assignModal, setAssignModal] = useState(false);
  const [selRest,     setSelRest]     = useState('');
  const [branchCode,  setBranchCode]  = useState('');
  const [tb,          setTb]          = useState(null);
  const [tbFrom,      setTbFrom]      = useState('');
  const [tbTo,        setTbTo]        = useState('');
  const [editModal,   setEditModal]   = useState(false);
  const [form,        setForm]        = useState({ name: group.name, email: group.email||'', phone: group.phone||'', address: group.address||'' });

  const loadBranches = useCallback(async () => {
    try {
      const r = await getGroupBranches(group.id);
      setBranches(r.data);
    } catch { toast.error('Failed to load branches'); }
  }, [group.id]);

  const handleExpand = () => {
    setExpanded(e => !e);
    if (!expanded && !branches) loadBranches();
  };

  const handleAssign = async () => {
    if (!selRest) return;
    try {
      await assignBranch(group.id, { restaurant_id: selRest, branch_code: branchCode });
      toast.success('Branch assigned!');
      setAssignModal(false); setSelRest(''); setBranchCode('');
      loadBranches(); onRefresh();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleRemove = async (restaurantId, name) => {
    if (!window.confirm(`Remove "${name}" from this group?`)) return;
    try {
      await removeBranch(group.id, restaurantId);
      toast.success('Removed');
      loadBranches(); onRefresh();
    } catch { toast.error('Failed'); }
  };

  const loadUnassigned = async () => {
    const r = await getUnassigned();
    setUnassigned(r.data);
  };

  const loadTB = async () => {
    try {
      const r = await getConsolidatedTB(group.id, { from: tbFrom || undefined, to: tbTo || undefined });
      setTb(r.data);
    } catch { toast.error('Failed to load consolidated TB'); }
  };

  const handleSaveEdit = async () => {
    try {
      await updateGroup(group.id, form);
      toast.success('Group updated');
      setEditModal(false);
      onRefresh();
    } catch { toast.error('Update failed'); }
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          background: T.card, border: `1px solid ${T.border}`, borderRadius: expanded ? '12px 12px 0 0' : 12,
          padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
        }}
        onClick={handleExpand}
      >
        <span style={{ fontSize: 22 }}>🏢</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{group.name}</div>
          <div style={{ fontSize: 12, color: T.textMid }}>
            {group.branch_count} branch{group.branch_count !== 1 ? 'es' : ''}{group.email ? ` · ${group.email}` : ''}{group.city ? ` · ${group.city}` : ''}
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[group.status] || T.textMid }}>
          {group.status?.toUpperCase()}
        </span>
        <button onClick={e => { e.stopPropagation(); setEditModal(true); }}
          style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', color: T.textMid, fontFamily: "'Inter',sans-serif" }}>
          ✏️ Edit
        </button>
        <span style={{ fontSize: 16, color: T.textDim, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>›</span>
      </div>

      {expanded && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 16 }}>
          {/* Branch list */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Branches</div>
            <Btn size="sm" onClick={() => { setAssignModal(true); loadUnassigned(); }}>+ Assign Branch</Btn>
          </div>

          {!branches ? <Spinner /> : branches.length === 0 ? (
            <div style={{ fontSize: 13, color: T.textDim, textAlign: 'center', padding: '20px 0' }}>No branches assigned yet.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, marginBottom: 16 }}>
              {branches.map(b => (
                <div key={b.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{b.name}</div>
                      <div style={{ fontSize: 11, color: T.textMid }}>
                        {b.branch_code && <span style={{ background: T.accentGlow, color: T.accent, padding: '1px 6px', borderRadius: 4, marginRight: 6, fontWeight: 700 }}>{b.branch_code}</span>}
                        {b.city || b.email}
                      </div>
                      <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>
                        👥 {b.employee_count} staff · 📦 {b.active_modules} modules
                      </div>
                    </div>
                    <button onClick={() => handleRemove(b.id, b.name)}
                      style={{ background: 'none', border: 'none', color: T.red, cursor: 'pointer', fontSize: 14 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Consolidated Trial Balance */}
          <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>📊 Consolidated Trial Balance</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
              <input type="date" value={tbFrom} onChange={e => setTbFrom(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 12, fontFamily: "'Inter',sans-serif" }} />
              <span style={{ color: T.textMid, fontSize: 12 }}>to</span>
              <input type="date" value={tbTo} onChange={e => setTbTo(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 12, fontFamily: "'Inter',sans-serif" }} />
              <Btn size="sm" onClick={loadTB}>Load</Btn>
            </div>
            {tb && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: T.surface }}>
                      {['Code','Account','Type','Branch','Debit','Credit'].map(h => (
                        <th key={h} style={{ padding: '7px 12px', textAlign: 'left', color: T.textMid, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tb.map((r, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: '6px 12px', fontFamily: 'monospace', color: T.text }}>{r.code}</td>
                        <td style={{ padding: '6px 12px', color: T.text }}>{r.name}</td>
                        <td style={{ padding: '6px 12px', color: T.textMid }}>{r.type}</td>
                        <td style={{ padding: '6px 12px', color: T.accent, fontWeight: 600 }}>
                          {r.branch_code || r.branch_name}
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: T.text }}>{Number(r.total_debit).toLocaleString()}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: T.text }}>{Number(r.total_credit).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assign Branch Modal */}
      {assignModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.surface, borderRadius: 14, padding: '24px 28px', width: 380, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>Assign Branch to {group.name}</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 4 }}>Restaurant</div>
              <select value={selRest} onChange={e => setSelRest(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none' }}>
                <option value="">— Select restaurant —</option>
                {unassigned.map(r => <option key={r.id} value={r.id}>{r.name} ({r.city || r.email})</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 4 }}>Branch Code (optional)</div>
              <input value={branchCode} onChange={e => setBranchCode(e.target.value)} placeholder="e.g. BR001"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Btn onClick={() => setAssignModal(false)} style={{ flex: 1, background: T.card, color: T.text, border: `1px solid ${T.border}` }}>Cancel</Btn>
              <Btn onClick={handleAssign} style={{ flex: 2 }}>Assign Branch</Btn>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {editModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.surface, borderRadius: 14, padding: '24px 28px', width: 400, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>Edit Group</div>
            {[['name','Group Name'],['email','Email'],['phone','Phone'],['address','Address']].map(([k,l]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 4 }}>{l}</div>
                <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <Btn onClick={() => setEditModal(false)} style={{ flex: 1, background: T.card, color: T.text, border: `1px solid ${T.border}` }}>Cancel</Btn>
              <Btn onClick={handleSaveEdit} style={{ flex: 2 }}>Save Changes</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main CompanyGroups Page ───────────────────────────────────────────────────
export default function CompanyGroups() {
  useT();
  const [groups,     setGroups]     = useState(null);
  const [newModal,   setNewModal]   = useState(false);
  const [form,       setForm]       = useState({ name: '', email: '', phone: '', address: '' });
  const [creating,   setCreating]   = useState(false);

  const load = useCallback(async () => {
    try { const r = await getGroups(); setGroups(r.data); }
    catch { toast.error('Failed to load groups'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.name.trim()) return toast.error('Group name required');
    setCreating(true);
    try {
      await createGroup(form);
      toast.success('Group created!');
      setNewModal(false); setForm({ name: '', email: '', phone: '', address: '' });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setCreating(false); }
  };

  return (
    <div>
      <PageHeader
        title="🏢 Company Groups"
        subtitle="Manage restaurant chains, multi-branch groups, and consolidated reporting"
        action={<Btn onClick={() => setNewModal(true)}>+ New Group</Btn>}
      />

      <DiscountTiers />

      {!groups ? <Spinner /> : groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textDim }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textMid, marginBottom: 6 }}>No groups yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>Create a company group to manage multiple restaurant branches together.</div>
          <Btn onClick={() => setNewModal(true)}>+ Create First Group</Btn>
        </div>
      ) : (
        groups.map(g => <GroupRow key={g.id} group={g} onRefresh={load} />)
      )}

      {/* Create Group Modal */}
      {newModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: T.surface, borderRadius: 14, padding: '24px 28px', width: 400, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 18 }}>🏢 Create Company Group</div>
            {[['name','Group Name *'],['email','Email'],['phone','Phone'],['address','Address']].map(([k,l]) => (
              <div key={k} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textMid, marginBottom: 4 }}>{l}</div>
                <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Btn onClick={() => setNewModal(false)} style={{ flex: 1, background: T.card, color: T.text, border: `1px solid ${T.border}` }}>Cancel</Btn>
              <Btn onClick={handleCreate} disabled={creating} style={{ flex: 2 }}>{creating ? '⏳ Creating…' : '✓ Create Group'}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
