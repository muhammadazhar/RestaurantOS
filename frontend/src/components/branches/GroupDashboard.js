import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Spinner, Btn, Modal, Input, StatCard, PageHeader, T, useT, Badge } from '../shared/UI';
import toast from 'react-hot-toast';
import API from '../../services/api';

const getGroupDashboard = ()  => API.get('/my-group/dashboard');
const addBranch         = (d) => API.post('/my-group/branches', d);

const fmt    = (n)  => `PKR ${Number(n || 0).toLocaleString()}`;
const fmtNum = (n)  => Number(n || 0).toLocaleString();
const STATUS_COLOR = { active: '#2ecc71', trial: '#f39c12', suspended: '#e74c3c', pending: '#3498db' };

// ─── Add Branch Modal ─────────────────────────────────────────────────────────
function AddBranchModal({ open, onClose, onSaved }) {
  const [form,   setForm]   = useState({ name: '', branch_code: '', email: '', phone: '', city: '', address: '' });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (open) setForm({ name: '', branch_code: '', email: '', phone: '', city: '', address: '' });
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
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: '0 12px' }}>
        <Input label="Branch Name *"   value={form.name}        onChange={set('name')}        placeholder="e.g. DHA Branch" />
        <Input label="Branch Code"     value={form.branch_code} onChange={set('branch_code')} placeholder="DHA" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <Input label="City"  value={form.city}  onChange={set('city')}  placeholder="Lahore" />
        <Input label="Phone" value={form.phone} onChange={set('phone')} placeholder="+92 42 …" />
      </div>
      <Input label="Email"   value={form.email}   onChange={set('email')}   type="email" placeholder="branch@company.com" />
      <Input label="Address" value={form.address} onChange={set('address')} placeholder="Branch street address" />
      <div style={{ background: T.surface, borderRadius: 8, padding: '8px 12px', fontSize: 12, color: T.textDim, marginBottom: 16 }}>
        💡 A super admin can assign an admin user account to this branch after creation.
      </div>
      <Btn onClick={handleSave} disabled={saving} style={{ width: '100%' }}>
        {saving ? '⏳ Adding…' : '✓ Add Branch'}
      </Btn>
    </Modal>
  );
}

// ─── Branch Performance Card ──────────────────────────────────────────────────
function BranchCard({ branch, view }) {
  const isOwner = branch.is_owner_branch;

  const primaryOrders  = view === 'today' ? branch.orders_today  : branch.orders_30d;
  const primaryRevenue = view === 'today' ? branch.revenue_today : branch.revenue_30d;

  return (
    <Card style={{ padding: 20, border: isOwner ? `2px solid ${T.accent}` : `1px solid ${T.border}`, position: 'relative' }}>
      {isOwner && (
        <div style={{ position: 'absolute', top: 10, right: 10, background: T.accent, color: '#000', fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 5 }}>
          MAIN BRANCH
        </div>
      )}

      {/* Branch header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: isOwner ? T.accentGlow : T.surface, border: `1px solid ${isOwner ? T.accent : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          🏪
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, paddingRight: isOwner ? 80 : 0 }}>{branch.name}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'wrap' }}>
            {branch.branch_code && (
              <span style={{ fontSize: 10, fontWeight: 700, background: T.accentGlow, color: T.accent, padding: '1px 6px', borderRadius: 4 }}>{branch.branch_code}</span>
            )}
            {branch.city && <span style={{ fontSize: 11, color: T.textMid }}>📍 {branch.city}</span>}
            <span style={{ fontSize: 10, color: STATUS_COLOR[branch.status] || T.textMid, fontWeight: 700 }}>● {branch.status?.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <div style={{ background: T.surface, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: T.textDim, marginBottom: 2 }}>
            {view === 'today' ? "Today's Revenue" : '30-Day Revenue'}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: T.green }}>
            {fmt(primaryRevenue)}
          </div>
        </div>
        <div style={{ background: T.surface, borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: T.textDim, marginBottom: 2 }}>
            {view === 'today' ? "Today's Orders" : '30-Day Orders'}
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 15, fontWeight: 800, color: T.accent }}>
            {fmtNum(primaryOrders)}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: T.surface, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.blue }}>{fmtNum(branch.employee_count)}</div>
          <div style={{ fontSize: 10, color: T.textDim }}>Employees</div>
        </div>
        <div style={{ flex: 1, background: T.surface, borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: Number(branch.open_shifts) > 0 ? T.green : T.textDim }}>
            {fmtNum(branch.open_shifts)}
          </div>
          <div style={{ fontSize: 10, color: T.textDim }}>Open Shifts</div>
        </div>
      </div>
    </Card>
  );
}

// ─── Main Group Dashboard ─────────────────────────────────────────────────────
export default function GroupDashboard() {
  useT();
  const navigate  = useNavigate();
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState('today'); // 'today' | '30d'
  const [addModal, setAddModal] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getGroupDashboard()
      .then(r => setData(r.data))
      .catch(err => {
        if (err.response?.status === 403) {
          toast.error('Group dashboard is only accessible to group admins');
          navigate('/branches');
        } else {
          toast.error('Failed to load dashboard');
        }
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner />;
  if (!data)   return null;

  const { group, branches, totals } = data;

  const viewRevenue = view === 'today' ? totals.revenue_today : totals.revenue_30d;
  const viewOrders  = view === 'today' ? totals.orders_today  : totals.orders_30d;

  const tabStyle = (v) => ({
    padding: '6px 18px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: view === v ? 700 : 500,
    background: view === v ? T.accent : 'transparent', color: view === v ? '#000' : T.textMid,
    border: `1px solid ${view === v ? T.accent : T.border}`, fontFamily: "'Inter', sans-serif",
  });

  return (
    <div>
      <PageHeader
        title="📊 Group Dashboard"
        subtitle={`${group.name} · ${totals.branch_count} branch${totals.branch_count !== 1 ? 'es' : ''}`}
        action={
          <div style={{ display: 'flex', gap: 10 }}>
            <Btn variant="ghost" onClick={() => navigate('/branches')}>🏢 Group Info</Btn>
            <Btn onClick={() => setAddModal(true)}>+ Add Branch</Btn>
          </div>
        }
      />

      {/* Top summary stats */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: T.textMid }}>Period:</span>
        <button style={tabStyle('today')} onClick={() => setView('today')}>Today</button>
        <button style={tabStyle('30d')}   onClick={() => setView('30d')}>Last 30 Days</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        <StatCard label={view === 'today' ? "Today's Revenue"  : '30-Day Revenue'}  value={fmt(viewRevenue)}           color={T.green}  icon="₨" />
        <StatCard label={view === 'today' ? "Today's Orders"   : '30-Day Orders'}   value={fmtNum(viewOrders)}         color={T.accent} icon="🧾" />
        <StatCard label="Total Employees"                                             value={fmtNum(totals.employee_count)} color={T.blue}   icon="👥" />
        <StatCard label="Active Branches"                                             value={totals.branch_count}        color={T.purple} icon="🏪" />
      </div>

      {/* Branch performance grid */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Branch Performance</div>
        <div style={{ fontSize: 12, color: T.textDim }}>
          {view === 'today' ? "Showing today's data" : 'Showing last 30 days'}
        </div>
      </div>

      {branches.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏪</div>
          <div style={{ fontSize: 14, color: T.textMid, marginBottom: 16 }}>No branches yet</div>
          <Btn onClick={() => setAddModal(true)}>+ Add First Branch</Btn>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {branches.map(b => <BranchCard key={b.id} branch={b} view={view} />)}

          {/* Add branch tile */}
          <div
            onClick={() => setAddModal(true)}
            style={{ padding: 20, border: `2px dashed ${T.border}`, borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', minHeight: 200, transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = T.accentGlow; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = 'transparent'; }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, background: T.surface, border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>+</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.textMid }}>Add New Branch</div>
            <div style={{ fontSize: 11, color: T.textDim, textAlign: 'center', maxWidth: 180 }}>Register a new restaurant branch under {group.name}</div>
          </div>
        </div>
      )}

      {/* Branch comparison table */}
      {branches.length > 1 && (
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Branch Comparison</div>
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  {['Branch', 'Code', 'City', 'Status', view === 'today' ? 'Revenue Today' : 'Revenue 30d', view === 'today' ? 'Orders Today' : 'Orders 30d', 'Employees', 'Open Shifts'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: ['Revenue Today','Revenue 30d','Revenue Today','Orders Today','Orders 30d','Employees','Open Shifts'].includes(h) ? 'right' : 'left', fontSize: 11, color: T.textMid, letterSpacing: 0.7, textTransform: 'uppercase', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...branches].sort((a, b) => {
                  const aRev = view === 'today' ? parseFloat(a.revenue_today) : parseFloat(a.revenue_30d);
                  const bRev = view === 'today' ? parseFloat(b.revenue_today) : parseFloat(b.revenue_30d);
                  return bRev - aRev;
                }).map((b, i) => {
                  const rev = view === 'today' ? b.revenue_today : b.revenue_30d;
                  const ord = view === 'today' ? b.orders_today  : b.orders_30d;
                  return (
                    <tr key={b.id} style={{ borderTop: `1px solid ${T.border}`, background: b.is_owner_branch ? `${T.accent}06` : 'transparent' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 700, color: T.text, fontSize: 13 }}>
                        {i === 0 && <span style={{ marginRight: 6, fontSize: 11 }}>🏆</span>}
                        {b.name}
                        {b.is_owner_branch && <span style={{ marginLeft: 6, fontSize: 10, color: T.accent }}>(main)</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12 }}>
                        {b.branch_code ? <span style={{ background: T.accentGlow, color: T.accent, padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{b.branch_code}</span> : <span style={{ color: T.textDim }}>—</span>}
                      </td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: T.textMid }}>{b.city || '—'}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[b.status] || T.textDim }}>● {b.status?.toUpperCase()}</span>
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: T.green }}>
                        {fmt(rev)}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, color: T.accent }}>
                        {fmtNum(ord)}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: T.blue }}>
                        {fmtNum(b.employee_count)}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: Number(b.open_shifts) > 0 ? T.green : T.textDim }}>
                        {fmtNum(b.open_shifts)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${T.borderLight}`, background: T.surface }}>
                  <td colSpan={4} style={{ padding: '10px 14px', fontSize: 12, fontWeight: 800, color: T.text }}>TOTAL</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.green }}>{fmt(viewRevenue)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: T.accent }}>{fmtNum(viewOrders)}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: T.blue }}>{fmtNum(totals.employee_count)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </Card>
        </div>
      )}

      <AddBranchModal open={addModal} onClose={() => setAddModal(false)} onSaved={load} />
    </div>
  );
}
