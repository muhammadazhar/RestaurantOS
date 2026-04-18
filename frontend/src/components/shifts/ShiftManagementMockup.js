import React from 'react';
import {
  getMyShifts, getShifts, getEmployees, createShift, updateShift, deleteShift,
  startMyShift, continueMyShift, closeMyShift, getShiftCashSummary, getShiftSalesReport,
} from '../../services/api';
import { Card, Badge, Spinner, Btn, Modal, Input, Select, T, useT } from '../shared/UI';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';

const weekDays = [
  ['Monday', 1], ['Tuesday', 2], ['Wednesday', 3], ['Thursday', 4],
  ['Friday', 5], ['Saturday', 6], ['Sunday', 7],
];

const SHIFT_TEMPLATES = [
  { id: 'morning', name: 'Morning', start: '07:00', end: '15:00', note: 'Opening counter shift' },
  { id: 'afternoon', name: 'Afternoon', start: '12:00', end: '20:00', note: 'Midday service shift' },
  { id: 'evening', name: 'Evening', start: '15:00', end: '23:00', note: 'Dinner and closing rush' },
  { id: 'night', name: 'Night', start: '22:00', end: '06:00', note: 'Late night shift' },
  { id: 'split', name: 'Split', start: '09:00', end: '17:00', note: 'Standard full-day coverage' },
  { id: 'regular', name: 'Regular', start: '10:00', end: '18:00', note: 'General restaurant coverage' },
];

const defaultTemplate = SHIFT_TEMPLATES[0];

const todayStr = () => new Date().toLocaleDateString('en-CA');
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA');
};
const money = v => `PKR ${Number(v || 0).toLocaleString()}`;
const statusColor = s => s === 'active' ? T.green : s === 'in_process' ? T.accent : s === 'completed' ? T.blue : s === 'absent' ? T.red : T.textDim;
const dayLabel = id => weekDays.find(w => w[1] === Number(id))?.[0]?.slice(0, 3);
const dateOnly = value => value ? String(value).slice(0, 10) : '';

const blankSchedule = () => ({
  employee_id: '',
  template_id: defaultTemplate.id,
  shift_name: defaultTemplate.name,
  start_time: defaultTemplate.start,
  end_time: defaultTemplate.end,
  date_from: todayStr(),
  date_to: todayStr(),
  working_days: [1, 2, 3, 4, 5],
  allow_multiple_per_day: true,
  require_balance: true,
  notes: '',
  status: 'scheduled',
});

function useShiftTheme() {
  const { mode, theme } = useTheme();
  useT();
  const light = mode === 'light';
  return {
    light,
    page: {
      background: light ? theme.bg : 'transparent',
      color: T.text,
    },
    panel: {
      background: T.card,
      border: `1px solid ${T.border}`,
      boxShadow: light ? '0 1px 2px rgba(15,23,42,0.05)' : '0 18px 42px rgba(0,0,0,0.16)',
    },
    soft: {
      background: light ? T.surface : 'rgba(255,255,255,0.04)',
      border: `1px solid ${T.border}`,
    },
    input: {
      background: light ? T.surface : '#0f172a',
      border: `1px solid ${T.border}`,
      color: T.text,
    },
    hero: {
      background: light ? 'transparent' : 'linear-gradient(135deg,#111827,#020617)',
      border: light ? '0' : `1px solid ${T.border}`,
      boxShadow: light ? 'none' : '0 24px 60px rgba(0,0,0,0.24)',
      padding: light ? '0 0 4px' : 24,
    },
    nav: {
      background: light ? T.card : 'rgba(15,23,42,0.82)',
      border: `1px solid ${T.border}`,
      boxShadow: light ? '0 1px 2px rgba(15,23,42,0.04)' : 'none',
    },
    primaryButton: {
      background: T.accent,
      color: light ? '#fff' : '#020617',
      border: '1px solid transparent',
    },
    secondaryButton: {
      background: light ? T.card : 'rgba(255,255,255,0.06)',
      color: T.text,
      border: `1px solid ${T.border}`,
    },
    activeTile: {
      background: T.accent,
      border: `1px solid ${T.accent}`,
      color: light ? '#fff' : '#020617',
    },
    inactiveTile: {
      background: light ? T.card : 'rgba(255,255,255,0.06)',
      border: `1px solid ${T.border}`,
      color: T.text,
    },
    activePill: {
      background: light ? T.accentGlow : T.accentGlow,
      border: `1px solid ${T.accent}`,
      color: light ? T.text : T.accent,
    },
    inactivePill: {
      background: light ? T.card : 'rgba(255,255,255,0.06)',
      border: `1px solid ${T.border}`,
      color: T.textMid,
    },
  };
}

function Metric({ title, value, note }) {
  const ST = useShiftTheme();
  return (
    <Card style={{ padding: 20, borderRadius: 16, ...ST.panel }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ color: T.textDim, fontSize: 14 }}>{title}</div>
          <div style={{ color: T.text, fontSize: 24, fontWeight: 700, marginTop: 8 }}>{value}</div>
          <div style={{ color: T.textDim, fontSize: 12, marginTop: 4 }}>{note}</div>
        </div>
        <div style={{ width: 42, height: 42, borderRadius: 16, background: ST.light ? T.surface : 'rgba(255,255,255,0.06)', border: `1px solid ${T.border}` }} />
      </div>
    </Card>
  );
}

function ToggleCard({ active, title, desc, onClick }) {
  const ST = useShiftTheme();
  return (
    <button type="button" onClick={onClick} style={{
      borderRadius: 16, border: `1px solid ${active ? T.accent : T.border}`,
      background: ST.light ? (active ? T.accentGlow : T.card) : (active ? T.accentGlow : 'rgba(255,255,255,0.06)'),
      color: T.text, padding: 14, textAlign: 'left', cursor: 'pointer', minHeight: 92,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ fontWeight: 900 }}>{title}</div>
        <span style={{ width: 40, height: 22, borderRadius: 999, background: active ? T.accent : 'rgba(148,163,184,0.35)', position: 'relative', flex: '0 0 auto' }}>
          <span style={{ position: 'absolute', top: 3, left: active ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: active ? '#fff' : T.text, transition: 'left 0.18s' }} />
        </span>
      </div>
      <div style={{ fontSize: 12, color: T.textMid, marginTop: 6, lineHeight: 1.45 }}>{desc}</div>
    </button>
  );
}

function ScheduleBuilder({ employees, editing, onCancel, onSaved }) {
  const ST = useShiftTheme();
  const [form, setForm] = React.useState(blankSchedule);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!editing) {
      setForm(blankSchedule());
      return;
    }
    const matchedTemplate = SHIFT_TEMPLATES.find(t =>
      t.name.toLowerCase() === String(editing.shift_name || '').toLowerCase()
      || (t.start === editing.start_time?.slice(0, 5) && t.end === editing.end_time?.slice(0, 5))
    );
    setForm({
      employee_id: editing.employee_id || '',
      template_id: matchedTemplate?.id || 'custom',
      shift_name: editing.shift_name || '',
      start_time: editing.start_time?.slice(0, 5) || '09:00',
      end_time: editing.end_time?.slice(0, 5) || '17:00',
      date_from: dateOnly(editing.date_from || editing.date),
      date_to: dateOnly(editing.date_to || editing.date_from || editing.date),
      working_days: Array.isArray(editing.working_days) && editing.working_days.length ? editing.working_days : [1, 2, 3, 4, 5],
      allow_multiple_per_day: editing.allow_multiple_per_day !== false,
      require_balance: editing.require_balance !== false,
      notes: editing.notes || '',
      status: editing.status === 'draft' ? 'draft' : 'scheduled',
    });
  }, [editing]);

  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const applyTemplate = template => setForm(current => ({
    ...current,
    template_id: template.id,
    shift_name: template.name,
    start_time: template.start,
    end_time: template.end,
  }));
  const handleTemplateChange = value => {
    const template = SHIFT_TEMPLATES.find(t => t.id === value);
    if (template) applyTemplate(template);
    else set('template_id', 'custom');
  };
  const setCustom = (key, value) => setForm(current => ({
    ...current,
    template_id: 'custom',
    [key]: value,
  }));
  const toggleDay = day => set('working_days', form.working_days.includes(day)
    ? form.working_days.filter(d => d !== day)
    : [...form.working_days, day].sort((a, b) => a - b));

  const save = async (status = 'scheduled') => {
    if (!form.employee_id) return toast.error('Select an employee');
    if (!form.shift_name.trim()) return toast.error('Shift template name required');
    if (!form.working_days.length) return toast.error('Select at least one working day');
    if (form.date_to < form.date_from) return toast.error('Usable To must be after Usable From');

    const { template_id, ...schedule } = form;
    const payload = { ...schedule, status, date: form.date_from };
    setSaving(true);
    try {
      if (editing?.id) {
        await updateShift(editing.id, payload);
        toast.success('Shift schedule updated');
      } else {
        await createShift(payload);
        toast.success(status === 'draft' ? 'Draft schedule saved' : 'Weekly shift schedule saved');
      }
      setForm(blankSchedule());
      onSaved();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Could not save schedule');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ borderRadius: 16, padding: 24, ...ST.panel }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, color: T.text, fontSize: 20, fontWeight: 700 }}>Create Weekly Shift Schedule</h2>
          <div style={{ color: T.textMid, fontSize: 13, marginTop: 5 }}>One schedule stays as one row, even when it covers multiple days.</div>
        </div>
        {editing && <Btn variant="secondary" size="sm" style={ST.secondaryButton} onClick={onCancel}>Cancel Edit</Btn>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: 14 }}>
        <Select label="Employee" value={form.employee_id} style={ST.input} onChange={e => set('employee_id', e.target.value)}>
          <option value="">Select employee</option>
          {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}{e.role_name ? ` - ${e.role_name}` : ''}</option>)}
        </Select>
        <Select label="Shift Template" value={form.template_id} style={ST.input} onChange={e => handleTemplateChange(e.target.value)}>
          {SHIFT_TEMPLATES.map(template => (
            <option key={template.id} value={template.id}>{template.name} - {template.start} to {template.end}</option>
          ))}
          <option value="custom">Custom Shift</option>
        </Select>
      </div>

      <div style={{ margin: '4px 0 16px' }}>
        <div style={{ color: T.textMid, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Quick Presets</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SHIFT_TEMPLATES.map(template => {
            const active = form.template_id === template.id;
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => applyTemplate(template)}
                title={template.note}
                style={{
                  ...(active ? ST.activePill : ST.inactivePill),
                  borderRadius: 12,
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {template.name} <span style={{ opacity: 0.72, fontWeight: 700 }}>{template.start}-{template.end}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(160px, 1fr))', gap: 14 }}>
        <Input label="Shift Name" value={form.shift_name} style={ST.input} onChange={e => setCustom('shift_name', e.target.value)} />
        <Input label="Start Time" type="time" value={form.start_time} style={ST.input} onChange={e => setCustom('start_time', e.target.value)} />
        <Input label="End Time" type="time" value={form.end_time} style={ST.input} onChange={e => setCustom('end_time', e.target.value)} />
      </div>

      <div style={{ margin: '4px 0 16px' }}>
        <div style={{ color: T.textMid, fontSize: 12, fontWeight: 800, marginBottom: 8 }}>Working Days</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(64px, 1fr))', gap: 8 }}>
          {weekDays.map(([name, id]) => {
            const active = form.working_days.includes(id);
            return (
              <button key={id} type="button" onClick={() => toggleDay(id)} style={{
                borderRadius: 16,
                ...(active ? ST.activeTile : ST.inactiveTile),
                padding: '13px 12px',
                textAlign: 'left', cursor: 'pointer', fontWeight: 900, minHeight: 64,
              }}>
                <div>{name.slice(0, 3)}</div>
                <div style={{ fontSize: 11, opacity: active ? 0.8 : 0.75, marginTop: 4 }}>{active ? 'Selected' : 'Off'}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: 14 }}>
        <Input label="Usable From" type="date" value={form.date_from} style={ST.input} onChange={e => set('date_from', e.target.value)} />
        <Input label="Usable To" type="date" value={form.date_to} style={ST.input} onChange={e => set('date_to', e.target.value)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))', gap: 12, marginBottom: 14 }}>
        <ToggleCard active={form.allow_multiple_per_day} title="Allow Multiple Shifts Per Day" desc="Employee can open more than one shift on the same date." onClick={() => set('allow_multiple_per_day', !form.allow_multiple_per_day)} />
        <ToggleCard active={form.require_balance} title="Require Balance on Open/Close" desc="Cashier must enter opening and closing balances." onClick={() => set('require_balance', !form.require_balance)} />
      </div>

      <Input label="Notes" value={form.notes} style={ST.input} onChange={e => set('notes', e.target.value)} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <Btn variant="secondary" style={ST.secondaryButton} onClick={() => save('draft')} disabled={saving}>Save as Draft</Btn>
        <Btn style={ST.primaryButton} onClick={() => save('scheduled')} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update Schedule' : 'Save Schedule'}</Btn>
      </div>
    </Card>
  );
}

function SchedulePreview({ schedule }) {
  const ST = useShiftTheme();
  const days = schedule?.working_days || [1, 2, 3, 4, 5];
  return (
    <Card style={{ borderRadius: 16, padding: 24, ...ST.panel }}>
      <h2 style={{ margin: '0 0 12px', color: T.text, fontSize: 20, fontWeight: 700 }}>Schedule Preview</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ borderRadius: 16, background: ST.light ? T.accent : 'rgba(255,255,255,0.06)', color: ST.light ? '#fff' : T.text, padding: 20 }}>
          <div style={{ color: ST.light ? T.blueDim : T.textMid, fontSize: 13 }}>Template</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4 }}>{schedule?.shift_name || 'Weekly Shift Schedule'}</div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '16px 0' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            <MiniInfo dark label="Start" value={schedule?.start_time?.slice(0, 5) || '09:00'} />
            <MiniInfo dark label="End" value={schedule?.end_time?.slice(0, 5) || '17:00'} />
            <MiniInfo dark label="From" value={dateOnly(schedule?.date_from) || todayStr()} />
            <MiniInfo dark label="To" value={dateOnly(schedule?.date_to) || todayStr()} />
          </div>
        </div>
        <div>
          <div style={{ color: T.textDim, fontSize: 12, marginBottom: 8 }}>Working Days</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {weekDays.map(([name, id]) => <Badge key={id} color={days.includes(id) ? T.accent : T.textDim}>{name.slice(0, 3)}</Badge>)}
          </div>
        </div>
      </div>
    </Card>
  );
}

function MiniInfo({ label, value, dark }) {
  const ST = useShiftTheme();
  return (
    <div style={{ border: `1px solid ${dark ? 'rgba(255,255,255,0.18)' : T.border}`, borderRadius: 14, padding: 12, background: dark ? 'rgba(255,255,255,0.10)' : (ST.light ? T.surface : 'rgba(255,255,255,0.04)') }}>
      <div style={{ color: dark ? 'rgba(255,255,255,0.74)' : T.textDim, fontSize: 11 }}>{label}</div>
      <div style={{ color: dark ? '#fff' : T.text, fontWeight: 900, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default function ShiftManagementMockup() {
  useT();
  const { hasPermission } = useAuth();
  const ST = useShiftTheme();
  const isManager = hasPermission('shift_management') || hasPermission('settings') || hasPermission('employees');
  const [tab, setTab] = React.useState('dashboard');
  const [loading, setLoading] = React.useState(true);
  const [reportLoading, setReportLoading] = React.useState(false);
  const [schedules, setSchedules] = React.useState([]);
  const [dayShifts, setDayShifts] = React.useState([]);
  const [employees, setEmployees] = React.useState([]);
  const [editing, setEditing] = React.useState(null);
  const [opening, setOpening] = React.useState({});
  const [closing, setClosing] = React.useState({});
  const [summary, setSummary] = React.useState(null);
  const [report, setReport] = React.useState(null);
  const [reportFilters, setReportFilters] = React.useState({ from: monthStart(), to: todayStr(), employee_id: '', status: '' });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      if (isManager) {
        const [scheduleRes, dayRes, employeeRes] = await Promise.all([
          getShifts({ schedule_view: '1' }),
          getShifts({ date: todayStr() }),
          getEmployees(),
        ]);
        setSchedules(scheduleRes.data || []);
        setDayShifts(dayRes.data || []);
        setEmployees(employeeRes.data || []);
      } else {
        const myRes = await getMyShifts();
        setSchedules(myRes.data || []);
        setDayShifts((myRes.data || []).filter(s => dateOnly(s.date) === todayStr()));
        setEmployees([]);
      }
    } catch {
      toast.error('Failed to load shifts');
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  React.useEffect(() => { load(); }, [load]);

  const loadReport = React.useCallback(async () => {
    if (!isManager) return;
    setReportLoading(true);
    try {
      const params = { from: reportFilters.from, to: reportFilters.to };
      if (reportFilters.employee_id) params.employee_id = reportFilters.employee_id;
      const res = await getShiftSalesReport(params);
      setReport(res.data || null);
    } catch {
      toast.error('Failed to load shift reports');
    } finally {
      setReportLoading(false);
    }
  }, [isManager, reportFilters.from, reportFilters.to, reportFilters.employee_id]);

  React.useEffect(() => { loadReport(); }, [loadReport]);

  const active = dayShifts.filter(s => ['active', 'in_process'].includes(s.status));
  const cashOpen = active.reduce((sum, s) => sum + Number(s.opening_balance || 0), 0);
  const reportRows = report?.shifts || [];
  const totalVariance = reportRows.reduce((sum, row) => sum + Math.abs(Number(row.variance || 0)), 0);

  if (!isManager) {
    return (
      <Card style={{ borderRadius: 18, ...ST.panel }}>
        <h2 style={{ margin: '0 0 8px', color: T.text }}>Shift Management</h2>
        <div style={{ color: T.textMid }}>You do not have access to this module. Ask an admin to enable the Shift Management permission for your role.</div>
      </Card>
    );
  }

  const start = async shift => {
    try {
      await startMyShift(shift.id, { shift_date: dateOnly(shift.date), opening_balance: opening[shift.id] || 0 });
      toast.success('Shift opened');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not open shift'); }
  };

  const close = async shift => {
    const cashierCollection = Number(closing[shift.id]);
    if (!Number.isFinite(cashierCollection) || cashierCollection < 0) {
      toast.error('Enter cashier collection amount');
      return;
    }
    try {
      await closeMyShift(shift.id, { shift_date: dateOnly(shift.date), cashier_collection: cashierCollection });
      toast.success('Shift closed');
      setSummary(null);
      setClosing(current => ({ ...current, [shift.id]: '' }));
      load();
      loadReport();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not close shift'); }
  };

  const continueShift = async shift => {
    try {
      await continueMyShift(shift.id, { shift_date: dateOnly(shift.date) });
      toast.success('Continuing in overtime');
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not continue shift'); }
  };

  const removeSchedule = async schedule => {
    if (!window.confirm(`Delete ${schedule.shift_name || 'this schedule'}?`)) return;
    try {
      await deleteShift(schedule.id);
      toast.success('Shift schedule deleted');
      if (editing?.id === schedule.id) setEditing(null);
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Could not delete schedule'); }
  };

  const loadSummary = shift => getShiftCashSummary(shift.id)
    .then(r => setSummary({ shift, ...r.data }))
    .catch(() => toast.error('Could not load summary'));

  if (loading) return <Spinner />;

  return (
    <div style={{ display: 'grid', gap: 24, ...ST.page }}>
      <div style={{ borderRadius: ST.light ? 0 : 22, ...ST.hero }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, color: T.text, fontSize: 30, fontWeight: 700, letterSpacing: 0 }}>Shift Management</h1>
            <p style={{ color: T.textMid, margin: 0 }}>Create weekly shift schedules, open and close cashier shifts, and review shift activity.</p>
          </div>
          {isManager && <Btn onClick={() => setTab('schedule')} style={ST.primaryButton}>Create Weekly Shift Schedule</Btn>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(130px, 1fr))', gap: 12, marginTop: 20 }}>
          <Metric title="Employees on Schedule" value={new Set(schedules.map(s => s.employee_id)).size} note="Assigned this week" />
          <Metric title="Active Shifts" value={active.length} note="Currently open" />
          <Metric title="Cash in Open Shifts" value={money(cashOpen)} note="Opening + running balance" />
          <Metric title="Total Variance" value={money(totalVariance)} note="Across selected reports" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderRadius: 16, padding: 6, ...ST.nav }}>
        {[
          ['dashboard', 'Dashboard'],
          ['schedule', 'Shift Schedule'],
          ['open-close', 'Open / Close Shift'],
          ['reports', 'Shift Reports'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: 0, borderRadius: 12, padding: '10px 14px', background: tab === id ? T.accent : 'transparent', color: tab === id ? (ST.light ? '#fff' : '#020617') : T.textMid, fontWeight: 800, cursor: 'pointer' }}>{label}</button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 18 }}>
            <Card style={{ borderRadius: 16, ...ST.panel }}>
              <h2 style={{ margin: '0 0 12px', color: T.text }}>Today's Running Shifts</h2>
              {active.length === 0 && <div style={{ color: T.textDim }}>No active shifts right now.</div>}
              {active.map(s => <ShiftLine key={`${s.id}-${dateOnly(s.date)}`} shift={s} onSummary={() => loadSummary(s)} />)}
            </Card>
            <Card style={{ borderRadius: 16, ...ST.panel }}>
              <h2 style={{ margin: '0 0 12px', color: T.text }}>Example Weekly Assignment</h2>
              {weekDays.map(([name, id]) => {
                const count = schedules.filter(s => (s.working_days || []).includes(id)).length;
                return (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: `1px solid ${T.border}` }}>
                    <span>{name}</span>
                    <Badge color={count ? T.accent : T.textDim}>{count ? `${count} schedule` : 'Off Day'}</Badge>
                  </div>
                );
              })}
            </Card>
          </div>
          <Card style={{ borderRadius: 16, ...ST.panel }}>
            <h2 style={{ margin: '0 0 12px', color: T.text }}>Separate Screens Included</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 12 }}>
              {[
                ['Shift Schedule Screen', 'Create weekly schedules with weekdays, time range, and valid date range.'],
                ['Open Shift Screen', 'Open a shift with opening balance and actual start time.'],
                ['Close Shift Screen', 'Cashier enters collected amount and sees system financial summary.'],
                ['Shift Report Screen', 'Track history, balances, sales, cashier collection, and variance.'],
              ].map(([title, desc]) => (
                <div key={title} style={{ ...ST.soft, borderRadius: 16, padding: 14 }}>
                  <div style={{ color: T.text, fontWeight: 900 }}>{title}</div>
                  <div style={{ color: T.textMid, fontSize: 12, lineHeight: 1.4, marginTop: 6 }}>{desc}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {tab === 'schedule' && (
        <div style={{ display: 'grid', gap: 18 }}>
          {isManager && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(280px, 0.55fr)', gap: 18 }}>
              <ScheduleBuilder employees={employees} editing={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
              <SchedulePreview schedule={editing || schedules[0]} />
            </div>
          )}
          <Card style={{ borderRadius: 16, ...ST.panel }}>
            <div style={{ marginBottom: 14 }}>
              <h2 style={{ margin: 0, color: T.text }}>Saved Shift Schedules</h2>
              <div style={{ color: T.textMid, fontSize: 13, marginTop: 4 }}>Each row is one schedule record, even when it covers multiple days.</div>
            </div>
            <ScheduleTable schedules={schedules} onEdit={setEditing} onDelete={removeSchedule} canManage={isManager} />
          </Card>
        </div>
      )}

      {tab === 'open-close' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <Card style={{ borderRadius: 16, ...ST.panel }}>
            <h2 style={{ margin: '0 0 12px', color: T.text }}>Open Shift</h2>
            {dayShifts.filter(s => s.status === 'scheduled').map(s => (
              <div key={`${s.id}-${dateOnly(s.date)}`} style={{ ...ST.soft, borderRadius: 16, padding: 14, marginBottom: 10 }}>
                <ShiftLine shift={s} />
                {s.require_balance !== false && <Input label="Opening Balance" type="number" style={ST.input} value={opening[s.id] || ''} onChange={e => setOpening(o => ({ ...o, [s.id]: e.target.value }))} />}
                <Btn onClick={() => start(s)} style={{ width: '100%', ...ST.primaryButton }}>Open Shift Now</Btn>
              </div>
            ))}
            {!dayShifts.some(s => s.status === 'scheduled') && <div style={{ color: T.textDim }}>No scheduled shifts available to open today.</div>}
          </Card>
          <Card style={{ borderRadius: 16, ...ST.panel }}>
            <h2 style={{ margin: '0 0 12px', color: T.text }}>Close Shift</h2>
            {active.map(s => (
              <div key={`${s.id}-${dateOnly(s.date)}`} style={{ ...ST.soft, borderRadius: 16, padding: 14, marginBottom: 10 }}>
                <ShiftLine shift={s} />
                <Input
                  label="Cashier Collected Amount"
                  type="number"
                  style={ST.input}
                  value={closing[s.id] || ''}
                  onChange={e => setClosing(current => ({ ...current, [s.id]: e.target.value }))}
                />
                {summary?.shift?.id === s.id && (
                  <div style={{ border: `1px dashed ${ST.light ? T.borderLight : T.borderLight}`, borderRadius: 14, padding: 12, marginBottom: 12, background: ST.light ? T.card : 'transparent' }}>
                    <div style={{ color: T.text, fontWeight: 900, marginBottom: 8 }}>Financial Summary</div>
                    <div style={{ color: T.textDim, fontSize: 12, marginBottom: 10 }}>Expected closing = opening balance + recorded sales. Variance = cashier collection - expected closing.</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 8 }}>
                      <MiniSummary label="Opening Balance" value={summary.opening_balance} />
                      <MiniSummary label="Recorded Sales" value={summary.cash_sales} />
                      <MiniSummary label="Expected Closing" value={summary.expected_closing} />
                      <MiniSummary label="System Closing" value={summary.closing_cash} />
                      <MiniSummary label="Cashier Collection" value={closing[s.id]} />
                      <MiniSummary label="Variance" value={Number(closing[s.id] || 0) - Number(summary.expected_closing || 0)} danger={Math.abs(Number(closing[s.id] || 0) - Number(summary.expected_closing || 0)) > 0.01} />
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Btn variant="secondary" onClick={() => loadSummary(s)} style={{ flex: 1, ...ST.secondaryButton }}>Summary</Btn>
                  {s.status === 'active' && <Btn variant="secondary" onClick={() => continueShift(s)} style={{ flex: 1, ...ST.secondaryButton }}>Continue</Btn>}
                  <Btn variant="danger" onClick={() => close(s)} style={{ flex: 1 }}>Close Shift</Btn>
                </div>
              </div>
            ))}
            {active.length === 0 && <div style={{ color: T.textDim }}>No active shifts to close.</div>}
          </Card>
        </div>
      )}

      {tab === 'reports' && (
        <div style={{ display: 'grid', gap: 18 }}>
          <Card style={{ borderRadius: 16, ...ST.panel }}>
            <h2 style={{ margin: '0 0 12px', color: T.text }}>Shift Report Filters</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(140px, 1fr))', gap: 12, alignItems: 'end' }}>
              <Input label="From Date" type="date" value={reportFilters.from} onChange={e => setReportFilters(f => ({ ...f, from: e.target.value }))} style={ST.input} />
              <Input label="To Date" type="date" value={reportFilters.to} onChange={e => setReportFilters(f => ({ ...f, to: e.target.value }))} style={ST.input} />
              <Select label="Employee" value={reportFilters.employee_id} onChange={e => setReportFilters(f => ({ ...f, employee_id: e.target.value }))} style={ST.input}>
                <option value="">All Employees</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </Select>
              <Select label="Status" value={reportFilters.status} onChange={e => setReportFilters(f => ({ ...f, status: e.target.value }))} style={ST.input}>
                <option value="">All Statuses</option>
                <option value="active">Open</option>
                <option value="completed">Closed</option>
              </Select>
              <Btn onClick={loadReport} style={ST.primaryButton}>Apply</Btn>
            </div>
          </Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 12 }}>
            <Metric title="Closed Shifts" value={reportRows.filter(r => r.shift_status === 'completed').length} note="For selected period" />
            <Metric title="Open Shifts" value={reportRows.filter(r => ['active', 'in_process'].includes(r.shift_status)).length} note="Currently active" />
            <Metric title="Total Sales" value={money(report?.summary?.total_revenue)} note="Captured in shifts" />
            <Metric title="Total Variance" value={money(totalVariance)} note="Across closed shifts" />
          </div>
          <Card style={{ borderRadius: 16, ...ST.panel }}>
            <h2 style={{ margin: '0 0 12px', color: T.text }}>Shift Report Summary</h2>
            {reportLoading ? <Spinner /> : <ReportTable rows={reportRows.filter(r => !reportFilters.status || r.shift_status === reportFilters.status)} />}
          </Card>
        </div>
      )}

      {summary && (
        <Modal open onClose={() => setSummary(null)} title="Shift Cash Summary" width={420}>
          {[
            ['Opening Balance', summary.opening_balance],
            ['Cash Sales', summary.cash_sales],
            ['Expected Closing', summary.expected_closing],
            ['System Closing', summary.closing_cash ?? '-'],
            ['Cashier Collection', closing[summary.shift.id] || '-'],
            ['Variance', closing[summary.shift.id] ? Number(closing[summary.shift.id]) - Number(summary.expected_closing || 0) : '-'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${T.border}`, padding: '10px 0' }}>
              <span style={{ color: T.textMid }}>{label}</span><strong>{value === '-' ? '-' : money(value)}</strong>
            </div>
          ))}
          <Input
            label="Cashier Collected Amount"
            type="number"
            value={closing[summary.shift.id] || ''}
            onChange={e => setClosing(current => ({ ...current, [summary.shift.id]: e.target.value }))}
            style={ST.input}
          />
          <Btn onClick={() => close(summary.shift)} style={{ width: '100%', marginTop: 14, ...ST.primaryButton }}>Close Shift</Btn>
        </Modal>
      )}
    </div>
  );
}

function ShiftLine({ shift, onSummary }) {
  const ST = useShiftTheme();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: `1px solid ${T.border}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.text, fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shift.employee_name || 'Employee'} - {shift.shift_name}</div>
        <div style={{ color: T.textMid, fontSize: 12 }}>{dateOnly(shift.date)} - {shift.start_time?.slice(0, 5)} to {shift.end_time?.slice(0, 5)}</div>
      </div>
      <Badge color={statusColor(shift.status)}>{shift.status}</Badge>
      {onSummary && <Btn size="sm" variant="ghost" style={ST.secondaryButton} onClick={onSummary}>View</Btn>}
    </div>
  );
}

function MiniSummary({ label, value, danger }) {
  const ST = useShiftTheme();
  return (
    <div style={{ background: ST.light ? T.surface : T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 10 }}>
      <div style={{ color: T.textDim, fontSize: 11 }}>{label}</div>
      <div style={{ color: danger ? T.red : T.text, fontWeight: 900, marginTop: 4 }}>{value === '' || value == null ? '-' : money(value)}</div>
    </div>
  );
}

function ScheduleTable({ schedules, onEdit, onDelete, canManage }) {
  const ST = useShiftTheme();
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Employee', 'Shift Template', 'Time', 'Working Days', 'Usable From', 'Usable To', 'Options', 'Status', 'Actions'].map(h => (
              <th key={h} style={{ textAlign: 'left', color: T.textDim, padding: 10, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {schedules.map(s => (
            <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}` }}>
              <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{s.employee_name || '-'}</td>
              <td style={{ padding: 10, fontWeight: 900, maxWidth: 190, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.shift_name}</td>
              <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{s.start_time?.slice(0, 5)} - {s.end_time?.slice(0, 5)}</td>
              <td style={{ padding: 10, minWidth: 150 }}>{(s.working_days || []).map(dayLabel).filter(Boolean).join(', ') || '-'}</td>
              <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{dateOnly(s.date_from || s.date)}</td>
              <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{dateOnly(s.date_to || s.date)}</td>
              <td style={{ padding: 10, minWidth: 170 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {s.allow_multiple_per_day !== false && <Badge color={T.accent}>Multiple</Badge>}
                  {s.require_balance !== false && <Badge color={T.green}>Balance</Badge>}
                </div>
              </td>
              <td style={{ padding: 10 }}><Badge color={statusColor(s.status)}>{s.status}</Badge></td>
              <td style={{ padding: 10, whiteSpace: 'nowrap' }}>
                {canManage ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Btn size="sm" variant="secondary" style={ST.secondaryButton} onClick={() => onEdit(s)}>Edit</Btn>
                    <Btn size="sm" variant="danger" onClick={() => onDelete(s)}>Delete</Btn>
                  </div>
                ) : '-'}
              </td>
            </tr>
          ))}
          {!schedules.length && <tr><td colSpan={9} style={{ padding: 30, textAlign: 'center', color: T.textDim }}>No shift schedules found</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ReportTable({ rows }) {
  useShiftTheme();
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {['Date', 'Employee', 'Shift', 'Open', 'Close', 'Opening', 'Sales', 'Expected Closing', 'Cashier Collection', 'System Closing', 'Variance', 'Status'].map(h => (
              <th key={h} style={{ textAlign: 'left', color: T.textDim, padding: 10, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row.shift_id}-${row.shift_date}-${idx}`} style={{ borderBottom: `1px solid ${T.border}` }}>
              <td style={{ padding: 10, whiteSpace: 'nowrap' }}>{dateOnly(row.shift_date)}</td>
              <td style={{ padding: 10, fontWeight: 900 }}>{row.employee_name || '-'}</td>
              <td style={{ padding: 10 }}>{row.shift_name || '-'}</td>
              <td style={{ padding: 10 }}>{row.start_time || '-'}</td>
              <td style={{ padding: 10 }}>{row.shift_status === 'completed' ? row.end_time || '-' : '-'}</td>
              <td style={{ padding: 10 }}>{money(row.opening_balance)}</td>
              <td style={{ padding: 10 }}>{money(row.cash_revenue)}</td>
              <td style={{ padding: 10 }}>{money(row.expected_closing)}</td>
              <td style={{ padding: 10 }}>{money(row.cashier_collection)}</td>
              <td style={{ padding: 10 }}>{money(row.closing_balance)}</td>
              <td style={{ padding: 10, color: Math.abs(Number(row.variance || 0)) > 0.01 ? T.red : T.green, fontWeight: 900 }}>{money(row.variance)}</td>
              <td style={{ padding: 10 }}><Badge color={statusColor(row.shift_status)}>{row.shift_status || '-'}</Badge></td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: T.textDim }}>No shift report rows found</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
