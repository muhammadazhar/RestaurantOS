import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Spinner, PageHeader, Btn, Modal, Input, T, useT } from '../shared/UI';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import API from '../../services/api';

const getMyGroup        = ()  => API.get('/branches/my-group');
const registerMyGroup   = (d) => API.post('/my-group/register', d);
const updateMyGroupInfo = (d) => API.patch('/my-group', d);
const addBranch         = (d) => API.post('/my-group/branches', d);

const STATUS_COLOR = { active: '#2ecc71', trial: '#f39c12', suspended: '#e74c3c', pending: '#3498db' };

// ─── Create Company Group Modal (for existing restaurants) ───────────────────
function CreateGroupModal({ open, onClose, onSaved }) {
  const [form,   setForm]   = useState({ name: '', email: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => { if (open) setForm({ name: '', email: '', phone: '', address: '' }); }, [open]);

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Company name is required');
    setSaving(true);
    try {
      await registerMyGroup(form);
      toast.success('Company group created! Your restaurant is now Branch #1.');
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to create group'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Company Group" width={460}>
      <div style={{ fontSize: 13, color: T.textMid, marginBottom: 20 }}>
        Your current restaurant will become the first branch of this group. You can add more branches afterward.
      </div>
      <Input label="Company / Group Name *" value={form.name}    onChange={set('name')}    placeholder="e.g. Al-Barakat Restaurant Group" />
      <Input label="Business Email"         value={form.email}   onChange={set('email')}   type="email" placeholder="info@company.com" />
      <Input label="Business Phone"         value={form.phone}   onChange={set('phone')}   placeholder="+92 300 1234567" />
      <Input label="Head Office Address"    value={form.address} onChange={set('address')} placeholder="Street, City, Country" />
      <Btn onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
        {saving ? '⏳ Creating…' : '✓ Create Company Group'}
      </Btn>
    </Modal>
  );
}

// ─── Edit Group Modal ─────────────────────────────────────────────────────────
function EditGroupModal({ open, onClose, group, onSaved }) {
  const [form,   setForm]   = useState({ name: '', email: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (open && group) setForm({ name: group.name || '', email: group.email || '', phone: group.phone || '', address: group.address || '' });
  }, [open, group]);

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Company name required');
    setSaving(true);
    try {
      await updateMyGroupInfo(form);
      toast.success('Company info updated!');
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to update'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Company Info" width={440}>
      <Input label="Company Name *" value={form.name}    onChange={set('name')}    placeholder="Company name" />
      <Input label="Email"          value={form.email}   onChange={set('email')}   type="email" placeholder="info@company.com" />
      <Input label="Phone"          value={form.phone}   onChange={set('phone')}   placeholder="+92 300 …" />
      <Input label="Address"        value={form.address} onChange={set('address')} placeholder="Head office address" />
      <Btn onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
        {saving ? '⏳ Saving…' : '✓ Save Changes'}
      </Btn>
    </Modal>
  );
}

// ─── Add Branch Modal ─────────────────────────────────────────────────────────
function AddBranchModal({ open, onClose, onSaved }) {
  const [form,   setForm]   = useState({ name: '', branch_code: '', email: '', phone: '', address: '', city: '' });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (open) setForm({ name: '', branch_code: '', email: '', phone: '', address: '', city: '' });
  }, [open]);

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Branch name required');
    setSaving(true);
    try {
      await addBranch(form);
      toast.success('Branch added!');
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to add branch'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add New Branch" width={460}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '0 12px' }}>
        <Input label="Branch Name *"   value={form.name}        onChange={set('name')}        placeholder="e.g. Gulberg Branch" />
        <Input label="Branch Code"     value={form.branch_code} onChange={set('branch_code')} placeholder="GLB" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <Input label="City"  value={form.city}  onChange={set('city')}  placeholder="e.g. Lahore" />
        <Input label="Phone" value={form.phone} onChange={set('phone')} placeholder="+92 42 …" />
      </div>
      <Input label="Email"   value={form.email}   onChange={set('email')}   type="email" placeholder="branch@company.com" />
      <Input label="Address" value={form.address} onChange={set('address')} placeholder="Branch address" />
      <div style={{ background: T.surface, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: T.textDim, marginBottom: 16 }}>
        💡 After adding, a super admin can assign an admin user account to manage this branch.
      </div>
      <Btn onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
        {saving ? '⏳ Adding…' : '✓ Add Branch'}
      </Btn>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BranchManagement() {
  useT();
  const { user } = useAuth();
  const navigate  = useNavigate();
  const [group,     setGroup]     = useState(undefined);
  const [loading,   setLoading]   = useState(true);
  const [editModal,   setEditModal]   = useState(false);
  const [addModal,    setAddModal]    = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [reload,      setReload]      = useState(0);

  const load = useCallback(() => {
    setLoading(true);
    getMyGroup()
      .then(r => setGroup(r.data))
      .catch(() => toast.error('Failed to load group info'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, reload]);

  if (loading) return <Spinner />;

  // No group — show prompt
  if (!group) {
    const canCreate = !!(user?.permissions?.includes('settings') || user?.isSuperAdmin);
    return (
      <div>
        <PageHeader title="🏢 My Company Group" subtitle="Manage your restaurant group and branches" />
        <Card style={{ textAlign: 'center', padding: '60px 20px', maxWidth: 560, margin: '0 auto' }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🏢</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 8 }}>No Company Group Yet</div>
          {canCreate ? (
            <>
              <div style={{ fontSize: 13, color: T.textMid, marginBottom: 24, maxWidth: 380, margin: '0 auto 24px' }}>
                Create a company group to manage multiple branches, view consolidated reports, and unlock multi-branch subscription discounts.
              </div>
              <Btn onClick={() => setCreateModal(true)} size="lg">🏗 Create Company Group</Btn>
            </>
          ) : (
            <div style={{ fontSize: 13, color: T.textDim }}>
              Your restaurant is not assigned to a company group. Ask your group admin or system administrator to add you.
            </div>
          )}
        </Card>
        <CreateGroupModal open={createModal} onClose={() => setCreateModal(false)} onSaved={() => setReload(r => r + 1)} />
      </div>
    );
  }

  const branches      = group.branches || [];
  const currentBranch = branches.find(b => b.id === user?.restaurantId);
  const isAdmin       = group.is_admin;

  return (
    <div>
      <PageHeader
        title="🏢 My Company Group"
        subtitle={`${group.name} · ${branches.length} branch${branches.length !== 1 ? 'es' : ''}`}
        action={isAdmin && (
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" onClick={() => setEditModal(true)}>✎ Edit Info</Btn>
            <Btn variant="ghost" onClick={() => setAddModal(true)}>+ Add Branch</Btn>
            <Btn onClick={() => navigate('/group-dashboard')}>📊 Group Dashboard</Btn>
          </div>
        )}
      />

      {/* Group info card */}
      <Card style={{ marginBottom: 20, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 44 }}>🏢</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 4 }}>{group.name}</div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
            {group.email   && <span style={{ fontSize: 12, color: T.textMid }}>✉️ {group.email}</span>}
            {group.phone   && <span style={{ fontSize: 12, color: T.textMid }}>📞 {group.phone}</span>}
            {group.address && <span style={{ fontSize: 12, color: T.textMid }}>📍 {group.address}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {currentBranch && (
              <div style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, borderRadius: 8, padding: '4px 10px', fontSize: 12, color: T.accent, fontWeight: 600 }}>
                📍 You are at: {currentBranch.branch_code ? `[${currentBranch.branch_code}] ` : ''}{currentBranch.name}
              </div>
            )}
            {isAdmin && (
              <div style={{ background: `${T.green}20`, border: `1px solid ${T.green}44`, borderRadius: 8, padding: '4px 10px', fontSize: 12, color: T.green, fontWeight: 600 }}>
                ⭐ Group Admin
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.accent }}>{branches.length}</div>
          <div style={{ fontSize: 11, color: T.textMid }}>Branches</div>
        </div>
      </Card>

      {/* Multi-branch discount banner */}
      {isAdmin && branches.length >= 2 && (
        <div style={{ background: `${T.green}15`, border: `1px solid ${T.green}44`, borderRadius: 12, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: T.textMid }}>
          🎉 <strong style={{ color: T.text }}>Multi-branch discount active</strong> — {branches.length} branches qualify for subscription discounts applied automatically on new purchases.
        </div>
      )}

      {/* Branch grid */}
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>All Branches</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {branches.map(b => {
          const isCurrent = b.id === user?.restaurantId;
          return (
            <Card key={b.id} style={{ padding: 18, border: isCurrent ? `2px solid ${T.accent}` : `1px solid ${T.border}`, position: 'relative' }}>
              {isCurrent && (
                <div style={{ position: 'absolute', top: 10, right: 10, background: T.accent, color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6 }}>
                  YOU ARE HERE
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: isCurrent ? T.accentGlow : T.surface, border: `1px solid ${isCurrent ? T.accent : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  🏪
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{b.name}</div>
                  {b.branch_code && (
                    <span style={{ fontSize: 10, fontWeight: 700, background: T.accentGlow, color: T.accent, padding: '1px 6px', borderRadius: 4, display: 'inline-block', marginTop: 2 }}>{b.branch_code}</span>
                  )}
                  {b.city && <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>📍 {b.city}</div>}
                  <div style={{ fontSize: 11, color: STATUS_COLOR[b.status] || T.textMid, fontWeight: 600, marginTop: 4 }}>
                    ● {b.status?.toUpperCase()}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}

        {isAdmin && (
          <div
            onClick={() => setAddModal(true)}
            style={{ padding: 18, border: `2px dashed ${T.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', minHeight: 110, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.accentGlow; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ fontSize: 28, color: T.textDim }}>+</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textMid }}>Add New Branch</div>
          </div>
        )}
      </div>

      <EditGroupModal open={editModal} onClose={() => setEditModal(false)} group={group} onSaved={load} />
      <AddBranchModal open={addModal}  onClose={() => setAddModal(false)}  onSaved={load} />
    </div>
  );
}
