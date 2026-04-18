import React from 'react';
import {
  getMyShifts, getShifts, getEmployees, createShift, bulkCreateShifts,
  startMyShift, continueMyShift, closeMyShift, getShiftCashSummary,
} from '../../services/api';
import { Card, Badge, Spinner, Btn, Modal, Input, Select, T, useT } from '../shared/UI';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const weekDays = [
  ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4],
  ['Friday', 5], ['Saturday', 6], ['Sunday', 7],
];
const todayStr = () => new Date().toISOString().slice(0, 10);
const money = v => `PKR ${Number(v || 0).toLocaleString()}`;
const statusColor = s => s === 'active' ? T.green : s === 'in_process' ? T.accent : s === 'completed' ? T.blue : s === 'absent' ? T.red : T.textDim;

function Metric({ title, value, note }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ color: T.textDim, fontSize: 12 }}>{title}</div>
      <div style={{ color: T.text, fontSize: 26, fontWeight: 900, marginTop: 8 }}>{value}</div>
      <div style={{ color: T.textMid, fontSize: 12, marginTop: 4 }}>{note}</div>
    </Card>
  );
}

function ScheduleModal({ open, onClose, employees, onSaved }) {
  const blank = {
    employee_id: '', shift_name: 'Morning Counter', start_time: '09:00', end_time: '17:00',
    date_from: todayStr(), date_to: todayStr(), working_days: [1, 2, 3, 4, 5],
    allow_multiple_per_day: true, require_balance: true, notes: '',
  };
  const [form, setForm] = React.useState(blank);
  const [saving, setSaving] = React.useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleDay = day => set('working_days', form.working_days.includes(day) ? form.working_days.filter(d => d !== day) : [...form.working_days, day].sort());

  const save = async () => {
    if (!form.employee_id) return toast.error('Select an employee');
    if (!form.shift_name.trim()) return toast.error('Shift name required');
    setSaving(true);
    try {
      const isRange = form.date_to && form.date_to !== form.date_from;
      if (isRange) await bulkCreateShifts(form);
      else await createShift({ ...form, date: form.date_from });
      toast.success(isRange ? 'Shift schedule saved as one range record' : 'Shift scheduled');
      setForm(blank); onSaved(); onClose();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not save schedule'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Weekly Shift Schedule" width={760}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Select label="Employee" value={form.employee_id} onChange={e => set('employee_id', e.target.value)}>
          <option value="">Select employee</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}{e.role_name ? ` - ${e.role_name}` : ''}</option>)}
        </Select>
        <Input label="Shift Template Name" value={form.shift_name} onChange={e => set('shift_name', e.target.value)} />
        <Input label="Shift Start Time" type="time" value={form.start_time} onChange={e => set('start_time', e.target.value)} />
        <Input label="Shift End Time" type="time" value={form.end_time} onChange={e => set('end_time', e.target.value)} />
        <Input label="Usable From" type="date" value={form.date_from} onChange={e => set('date_from', e.target.value)} />
        <Input label="Usable To" type="date" value={form.date_to} onChange={e => set('date_to', e.target.value)} />
      </div>

      <div style={{ margin: '10px 0 16px' }}>
        <div style={{ color: T.textMid, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Working Days</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(72px,1fr))', gap: 8 }}>
          {weekDays.map(([name, id]) => {
            const active = form.working_days.includes(id);
            return (
              <button key={id} onClick={() => toggleDay(id)} style={{
                borderRadius: 16, border: `1px solid ${active ? T.accent : T.border}`,
                background: active ? T.accent : 'rgba(255,255,255,0.06)', color: active ? '#020617' : T.text,
                padding: '12px 8px', textAlign: 'left', cursor: 'pointer', fontWeight: 800,
              }}>
                <div>{name.slice(0, 3)}</div>
                <div style={{ fontSize: 11, opacity: 0.72, marginTop: 4 }}>{active ? 'Selected' : 'Off'}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
        {[
          ['allow_multiple_per_day', 'Allow Multiple Shifts Per Day', 'Employee can open more than one shift on the same date.'],
          ['require_balance', 'Require Balance on Open/Close', 'Cashier must enter opening and closing balances.'],
        ].map(([key, title, desc]) => (
          <button key={key} onClick={() => set(key, !form[key])} style={{ borderRadius: 18, border: `1px solid ${form[key] ? T.accent : T.border}`, background: form[key] ? T.accentGlow : 'rgba(255,255,255,0.06)', color: T.text, padding: 14, textAlign: 'left', cursor: 'pointer' }}>
            <div style={{ fontWeight: 900 }}>{title}</div>
            <div style={{ fontSize: 12, color: T.textMid, marginTop: 4 }}>{desc}</div>
          </button>
        ))}
      </div>

      <Input label="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
      <Btn onClick={save} disabled={saving} style={{ width: '100%', marginTop: 4 }}>{saving ? 'Saving...' : 'Save Schedule'}</Btn>
    </Modal>
  );
}

export default function MyShiftV2() {
  useT();
  const { hasPermission } = useAuth();
  const isManager = hasPermission('employees');
  const [tab, setTab] = React.useState('dashboard');
  const [loading, setLoading] = React.useState(true);
  const [shifts, setShifts] = React.useState([]);
  const [employees, setEmployees] = React.useState([]);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [opening, setOpening] = React.useState({});
  const [summary, setSummary] = React.useState(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = isManager ? { month: todayStr().slice(0, 7) } : null;
      const [sr, er] = await Promise.all([
        isManager ? getShifts(params) : getMyShifts(),
        isManager ? getEmployees() : Promise.resolve({ data: [] }),
      ]);
      setShifts(sr.data || []);
      setEmployees(er.data || []);
    } catch { toast.error('Failed to load shifts'); }
    finally { setLoading(false); }
  }, [isManager]);

  React.useEffect(() => { load(); }, [load]);

  const today = todayStr();
  const todayShifts = shifts.filter(s => String(s.date).slice(0, 10) === today);
  const active = shifts.filter(s => ['active', 'in_process'].includes(s.status));
  const completed = shifts.filter(s => s.status === 'completed');
  const cashOpen = active.reduce((sum, s) => sum + Number(s.opening_balance || 0), 0);

  const start = async shift => {
    try {
      await startMyShift(shift.id, { shift_date: String(shift.date).slice(0, 10), opening_balance: opening[shift.id] || 0 });
      toast.success('Shift opened');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not open shift'); }
  };
  const close = async shift => {
    try {
      await closeMyShift(shift.id, { shift_date: String(shift.date).slice(0, 10) });
      toast.success('Shift closed');
      setSummary(null);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not close shift'); }
  };
  const continueShift = async shift => {
    try {
      await continueMyShift(shift.id, { shift_date: String(shift.date).slice(0, 10) });
      toast.success('Continuing in overtime');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not continue shift'); }
  };
  const loadSummary = shift => getShiftCashSummary(shift.id).then(r => setSummary({ shift, ...r.data })).catch(() => {});

  if (loading) return <Spinner />;

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ borderRadius: 22, border: `1px solid ${T.border}`, background: 'linear-gradient(135deg,#111827,#020617)', padding: 24, boxShadow: '0 24px 60px rgba(0,0,0,0.24)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ color: T.accent, fontSize: 12, textTransform: 'uppercase', fontWeight: 900 }}>Staff Operations</div>
            <h1 style={{ margin: '6px 0', color: T.text, fontSize: 30 }}>Shift Management</h1>
            <p style={{ color: T.textMid, margin: 0 }}>Manage weekly schedules, open and close shifts, cash balances, and shift reporting.</p>
          </div>
          {isManager && <Btn onClick={() => setScheduleOpen(true)}>Create New Shift Schedule</Btn>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))', gap: 12, marginTop: 20 }}>
          <Metric title="Employees on Schedule" value={new Set(shifts.map(s => s.employee_id)).size} note="Assigned in current view" />
          <Metric title="Active Shifts" value={active.length} note="Currently open" />
          <Metric title="Cash in Open Shifts" value={money(cashOpen)} note="Opening balances" />
          <Metric title="Closed Shifts" value={completed.length} note="Completed records" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', background: 'rgba(15,23,42,0.82)', border: `1px solid ${T.border}`, borderRadius: 18, padding: 8 }}>
        {[
          ['dashboard', 'Dashboard'], ['schedule', 'Shift Schedule'],
          ['open-close', 'Open / Close Shift'], ['reports', 'Shift Reports'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: 0, borderRadius: 14, padding: '10px 14px', background: tab === id ? T.accent : 'transparent', color: tab === id ? '#020617' : T.textMid, fontWeight: 900, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 18 }}>
          <Card>
            <h2 style={{ margin: '0 0 12px', color: T.text }}>Today&apos;s Running Shifts</h2>
            {active.length === 0 && <div style={{ color: T.textDim }}>No active shifts right now.</div>}
            {active.map(s => <ShiftLine key={`${s.id}-${s.date}`} shift={s} onSummary={() => loadSummary(s)} />)}
          </Card>
          <Card>
            <h2 style={{ margin: '0 0 12px', color: T.text }}>Example Weekly Assignment</h2>
            {weekDays.map(([name, id]) => {
              const count = shifts.filter(s => (s.working_days || []).includes(id)).length;
              return <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${T.border}` }}><span>{name}</span><Badge color={count ? T.accent : T.textDim}>{count ? `${count} schedule` : 'Off'}</Badge></div>;
            })}
          </Card>
        </div>
      )}

      {tab === 'schedule' && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ margin: 0, color: T.text }}>Shift Schedule</h2>
            {isManager && <Btn onClick={() => setScheduleOpen(true)}>New Schedule</Btn>}
          </div>
          <ShiftTable shifts={shifts} />
        </Card>
      )}

      {tab === 'open-close' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Card>
            <h2 style={{ margin: '0 0 12px', color: T.text }}>Open Shift</h2>
            {todayShifts.filter(s => s.status === 'scheduled').map(s => (
              <div key={`${s.id}-${s.date}`} style={{ border: `1px solid ${T.border}`, borderRadius: 16, padding: 14, marginBottom: 10 }}>
                <ShiftLine shift={s} />
                <Input label="Opening Balance" type="number" value={opening[s.id] || ''} onChange={e => setOpening(o => ({ ...o, [s.id]: e.target.value }))} />
                <Btn onClick={() => start(s)} style={{ width: '100%' }}>Open Shift Now</Btn>
              </div>
            ))}
            {!todayShifts.some(s => s.status === 'scheduled') && <div style={{ color: T.textDim }}>No scheduled shifts available to open today.</div>}
          </Card>
          <Card>
            <h2 style={{ margin: '0 0 12px', color: T.text }}>Close Shift</h2>
            {active.map(s => (
              <div key={`${s.id}-${s.date}`} style={{ border: `1px solid ${T.border}`, borderRadius: 16, padding: 14, marginBottom: 10 }}>
                <ShiftLine shift={s} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Btn variant="secondary" onClick={() => loadSummary(s)} style={{ flex: 1 }}>Summary</Btn>
                  {s.status === 'active' && <Btn variant="secondary" onClick={() => continueShift(s)} style={{ flex: 1 }}>Continue</Btn>}
                  <Btn variant="danger" onClick={() => close(s)} style={{ flex: 1 }}>Close Shift</Btn>
                </div>
              </div>
            ))}
            {active.length === 0 && <div style={{ color: T.textDim }}>No active shifts to close.</div>}
          </Card>
        </div>
      )}

      {tab === 'reports' && (
        <Card>
          <h2 style={{ margin: '0 0 12px', color: T.text }}>Shift Report Summary</h2>
          <ShiftTable shifts={shifts} showBalances />
        </Card>
      )}

      {summary && (
        <Modal open onClose={() => setSummary(null)} title="Shift Cash Summary" width={420}>
          {[
            ['Opening Balance', summary.opening_balance],
            ['Cash Sales', summary.cash_sales],
            ['Expected Closing', summary.expected_closing],
            ['Closing Cash', summary.closing_cash ?? '-'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${T.border}`, padding: '10px 0' }}>
              <span style={{ color: T.textMid }}>{label}</span><strong>{value === '-' ? '-' : money(value)}</strong>
            </div>
          ))}
          <Btn onClick={() => close(summary.shift)} style={{ width: '100%', marginTop: 14 }}>Close Shift</Btn>
        </Modal>
      )}

      <ScheduleModal open={scheduleOpen} onClose={() => setScheduleOpen(false)} employees={employees} onSaved={load} />
    </div>
  );
}

function ShiftLine({ shift, onSummary }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: T.text, fontWeight: 900 }}>{shift.employee_name || 'Employee'} - {shift.shift_name}</div>
        <div style={{ color: T.textMid, fontSize: 12 }}>{String(shift.date).slice(0, 10)} - {shift.start_time?.slice(0, 5)} to {shift.end_time?.slice(0, 5)}</div>
      </div>
      <Badge color={statusColor(shift.status)}>{shift.status}</Badge>
      {onSummary && <Btn size="sm" variant="ghost" onClick={onSummary}>View</Btn>}
    </div>
  );
}

function ShiftTable({ shifts, showBalances }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead><tr>{['Date', 'Employee', 'Shift', 'Time', 'Days', 'Opening', 'Closing', 'Status'].map(h => <th key={h} style={{ textAlign: 'left', color: T.textDim, padding: 10, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}</tr></thead>
        <tbody>
          {shifts.map(s => (
            <tr key={`${s.id}-${s.date}`} style={{ borderBottom: `1px solid ${T.border}` }}>
              <td style={{ padding: 10 }}>{String(s.date).slice(0, 10)}</td>
              <td style={{ padding: 10 }}>{s.employee_name || '-'}</td>
              <td style={{ padding: 10, fontWeight: 800 }}>{s.shift_name}</td>
              <td style={{ padding: 10 }}>{s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)}</td>
              <td style={{ padding: 10 }}>{(s.working_days || []).map(d => weekDays.find(w => w[1] === d)?.[0]?.slice(0, 3)).filter(Boolean).join(', ') || '-'}</td>
              <td style={{ padding: 10 }}>{showBalances ? money(s.opening_balance) : '-'}</td>
              <td style={{ padding: 10 }}>{showBalances && s.closing_cash != null ? money(s.closing_cash) : '-'}</td>
              <td style={{ padding: 10 }}><Badge color={statusColor(s.status)}>{s.status}</Badge></td>
            </tr>
          ))}
          {!shifts.length && <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: T.textDim }}>No shifts found</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
