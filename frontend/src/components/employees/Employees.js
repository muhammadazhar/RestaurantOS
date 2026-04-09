import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  getEmployees, createEmployee, updateEmployee, uploadEmployeePhoto,
  getRoles, getShifts, createShift, bulkCreateShifts, updateShift, deleteShift,
} from '../../services/api';
import { Card, Badge, Spinner, Btn, Modal, Input, Select, PageHeader, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const IMG_BASE = process.env.REACT_APP_SOCKET_URL
  || (window.location.protocol + '//' + window.location.hostname + ':5000');

const EMPLOYEE_TYPES = [
  { value: 'full_time',  label: 'Full-Time',  icon: '🏢' },
  { value: 'part_time',  label: 'Part-Time',  icon: '🕐' },
  { value: 'contract',   label: 'Contract',   icon: '📝' },
  { value: 'intern',     label: 'Intern',     icon: '🎓' },
  { value: 'seasonal',   label: 'Seasonal',   icon: '🍂' },
];

const SHIFT_PRESETS = [
  { name: 'Morning',   start: '07:00', end: '15:00' },
  { name: 'Afternoon', start: '12:00', end: '20:00' },
  { name: 'Evening',   start: '15:00', end: '23:00' },
  { name: 'Night',     start: '22:00', end: '06:00' },
  { name: 'Split',     start: '09:00', end: '17:00' },
];

const SHIFT_STATUS_COLOR = { scheduled: T.blue, active: T.green, completed: T.textMid, absent: T.red };
const ROLE_COLOR = { Manager: T.purple, 'Head Server': T.accent, Server: T.blue, Chef: T.red, Cashier: T.green };
const EMP_TYPE_COLOR = { full_time: T.green, part_time: T.blue, contract: T.accent, intern: T.purple, seasonal: T.textMid };

const todayStr = () => new Date().toISOString().slice(0, 10);

// ─── Password strength checker ────────────────────────────────────────────────
function PasswordStrength({ password }) {
  if (!password) return null;
  const checks = [
    { label: 'At least 6 characters',           ok: password.length >= 6 },
    { label: 'At most 32 characters',            ok: password.length <= 32 },
    { label: 'Contains a number',                ok: /\d/.test(password) },
    { label: 'Contains a letter',                ok: /[a-zA-Z]/.test(password) },
    { label: 'Contains special character (!@#$)', ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password) },
  ];
  const passed = checks.filter(c => c.ok).length;
  const strength = passed <= 2 ? 'Weak' : passed <= 4 ? 'Fair' : 'Strong';
  const strengthColor = passed <= 2 ? T.red : passed <= 4 ? '#f59e0b' : T.green;
  const barWidth = `${(passed / checks.length) * 100}%`;

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, height: 4, background: T.border, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: barWidth, height: '100%', background: strengthColor, borderRadius: 2, transition: 'width 0.3s, background 0.3s' }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: strengthColor, minWidth: 44 }}>{strength}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
        {checks.map(c => (
          <div key={c.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: c.ok ? T.green : T.textDim }}>
            <span style={{ fontWeight: 700 }}>{c.ok ? '✓' : '○'}</span>
            {c.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────
const FieldLabel = ({ children }) => (
  <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>
    {children}
  </div>
);

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 20 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>
      {title}
    </div>
    {children}
  </div>
);

// ─── Employee Card ────────────────────────────────────────────────────────────
const EmpAvatar = ({ emp, size = 48 }) => {
  const [err, setErr] = useState(false);
  const src = emp.avatar_url && !err ? (emp.avatar_url.startsWith('http') ? emp.avatar_url : `${IMG_BASE}${emp.avatar_url}`) : null;
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: T.accentGlow, border: `2px solid ${emp.shift_status === 'active' ? T.green : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.33, fontWeight: 800, color: T.accent }}>
      {src
        ? <img src={src} alt={emp.full_name} onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : emp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
      }
    </div>
  );
};

const EmpCard = ({ emp, onEdit }) => (
  <Card hover style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
    <EmpAvatar emp={emp} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.full_name}</div>
      <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{emp.email || 'No email'}{emp.phone ? ` · ${emp.phone}` : ''}</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 7, flexWrap: 'wrap' }}>
        {emp.role_name && <Badge color={ROLE_COLOR[emp.role_name] || T.textMid} small>{emp.role_name}</Badge>}
        {emp.employee_type && (
          <Badge color={EMP_TYPE_COLOR[emp.employee_type] || T.blue} small>
            {EMPLOYEE_TYPES.find(t => t.value === emp.employee_type)?.icon}{' '}
            {EMPLOYEE_TYPES.find(t => t.value === emp.employee_type)?.label || emp.employee_type}
          </Badge>
        )}
        {emp.shift_name && <Badge color={T.blue} small>⏰ {emp.shift_name} {emp.start_time ? `${emp.start_time}–${emp.end_time}` : ''}</Badge>}
        <Badge color={emp.status === 'active' ? T.green : T.textDim} small>{emp.status}</Badge>
      </div>
    </div>
    <div style={{ textAlign: 'right', flexShrink: 0 }}>
      {emp.salary && <div style={{ fontSize: 12, fontWeight: 800, color: T.accent, fontFamily: 'monospace' }}>PKR {Number(emp.salary).toLocaleString()}</div>}
      <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{emp.shift_status === 'active' ? '🟢 On Duty' : '⚫ Off Duty'}</div>
      <button onClick={() => onEdit(emp)} style={{ marginTop: 6, background: 'none', border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 7, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>Edit</button>
    </div>
  </Card>
);

// ─── Add/Edit Employee Modal ──────────────────────────────────────────────────
const BLANK = { full_name: '', email: '', phone: '', pin: '', password: '', newPassword: '', confirmPassword: '', role_id: '', employee_type: 'full_time', salary: '', add_shift: false, shift_name: 'Morning', shift_start: '07:00', shift_end: '15:00', shift_date: todayStr() };

function EmployeeModal({ open, onClose, onSaved, editEmp, roles }) {
  const [form, setForm]             = useState(BLANK);
  const [saving, setSaving]         = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoFile,    setPhotoFile]    = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoRef = useRef();
  const isEdit = !!editEmp;

  useEffect(() => {
    if (open) {
      if (editEmp) {
        // role_id may come directly from API, or we fall back to matching by role_name
        const resolvedRoleId = editEmp.role_id
          || roles.find(r => r.name === editEmp.role_name)?.id
          || '';
        setForm({ ...BLANK, ...editEmp, role_id: resolvedRoleId, add_shift: false, password: '', newPassword: '', confirmPassword: '' });
      } else {
        setForm({ ...BLANK, shift_date: todayStr() });
      }
      setPhotoPreview(null);
      setPhotoFile(null);
    }
  }, [open, editEmp, roles]);

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handlePhotoUpload = async () => {
    if (!photoFile || !editEmp?.id) return;
    setPhotoUploading(true);
    try {
      await uploadEmployeePhoto(editEmp.id, photoFile);
      setPhotoPreview(null);
      setPhotoFile(null);
      toast.success('Photo updated!');
      onSaved();
    } catch { toast.error('Photo upload failed'); }
    finally { setPhotoUploading(false); }
  };

  const set    = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const setVal = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const applyPreset = p => setForm(f => ({ ...f, shift_name: p.name, shift_start: p.start, shift_end: p.end }));

  const handleSave = async () => {
    if (!form.full_name.trim()) return toast.error('Full name required');
    if (!form.role_id)          return toast.error('Please select a role');
    if (isEdit && form.newPassword && form.newPassword !== form.confirmPassword) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      if (isEdit) {
        await updateEmployee(editEmp.id, {
          full_name: form.full_name,
          phone: form.phone || null,
          email: form.email || null,
          role_id: form.role_id,
          salary: form.salary || null,
          status: form.status,
          password: form.newPassword || undefined,
        });
        toast.success('Employee updated!');
      } else {
        await createEmployee({
          full_name: form.full_name, email: form.email || undefined, phone: form.phone || undefined,
          role_id: form.role_id, salary: form.salary || undefined, pin: form.pin || undefined,
          password: form.password || undefined, employee_type: form.employee_type,
          ...(form.add_shift ? { shift_name: form.shift_name, shift_start: form.shift_start, shift_end: form.shift_end, shift_date: form.shift_date } : {}),
        });
        toast.success('Employee added!');
      }
      onSaved(); onClose();
    } catch (err) { toast.error(err.response?.data?.error || 'Save failed'); }
    finally { setSaving(false); }
  };

  const currentAvatarSrc = photoPreview
    || (editEmp?.avatar_url ? (editEmp.avatar_url.startsWith('http') ? editEmp.avatar_url : `${IMG_BASE}${editEmp.avatar_url}`) : null);

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit — ${editEmp?.full_name}` : 'Add New Employee'} width={560}>
      {/* Photo upload — only in edit mode since we need an employee ID */}
      {isEdit && (
        <Section title="Profile Photo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: T.accentGlow, border: `2px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: T.accent }}>
              {currentAvatarSrc
                ? <img src={currentAvatarSrc} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : editEmp.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
              }
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input ref={photoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              <button onClick={() => photoRef.current.click()} style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>
                {editEmp?.avatar_url ? '🔄 Change Photo' : '📷 Upload Photo'}
              </button>
              {photoFile && (
                <button onClick={handlePhotoUpload} disabled={photoUploading} style={{ background: T.accent, color: '#000', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 800, cursor: photoUploading ? 'not-allowed' : 'pointer', fontFamily: "'Syne', sans-serif" }}>
                  {photoUploading ? '⏳ Uploading…' : '⬆ Save Photo'}
                </button>
              )}
            </div>
          </div>
        </Section>
      )}
      <Section title="Personal Information">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <Input label="Full Name *"   value={form.full_name} onChange={set('full_name')} placeholder="Ahmed Khan" />
          <Input label="Phone"         value={form.phone}     onChange={set('phone')}     placeholder="+92-300-0000000" />
          {!isEdit && <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="ahmed@restaurant.com" />}
          <Input label="Salary (PKR)"  type="number" value={form.salary} onChange={set('salary')} placeholder="45000" />
        </div>
        {!isEdit && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Input label="Password"     type="password" value={form.password} onChange={set('password')} placeholder="Login password" />
            <Input label="PIN (4 digits)" value={form.pin} onChange={set('pin')} placeholder="1234" maxLength={4} />
          </div>
        )}
        {!isEdit && <PasswordStrength password={form.password} />}
      </Section>

      <Section title="Role & Employment Type">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: 14 }}>
          <Select label="Role *" value={form.role_id} onChange={set('role_id')}>
            <option value="">— Select Role —</option>
            {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </Select>
        </div>
        <FieldLabel>Employment Type</FieldLabel>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {EMPLOYEE_TYPES.map(t => (
            <div key={t.value} onClick={() => setVal('employee_type', t.value)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, cursor: 'pointer', background: form.employee_type === t.value ? EMP_TYPE_COLOR[t.value] + '22' : T.surface, border: `1px solid ${form.employee_type === t.value ? EMP_TYPE_COLOR[t.value] + '88' : T.border}`, transition: 'all 0.15s' }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span style={{ fontSize: 12, fontWeight: form.employee_type === t.value ? 700 : 500, color: form.employee_type === t.value ? EMP_TYPE_COLOR[t.value] : T.textMid }}>{t.label}</span>
            </div>
          ))}
        </div>
      </Section>

      {!isEdit && (
        <Section title="Shift Assignment">
          <div onClick={() => setVal('add_shift', !form.add_shift)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: T.surface, borderRadius: 10, cursor: 'pointer', marginBottom: form.add_shift ? 14 : 0, border: `1px solid ${form.add_shift ? T.accent + '55' : T.border}` }}>
            <span style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>⏰ Assign a shift for today</span>
            <div style={{ width: 40, height: 22, borderRadius: 11, background: form.add_shift ? T.accent : T.border, position: 'relative', transition: 'background 0.2s' }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: form.add_shift ? 21 : 3, transition: 'left 0.2s' }} />
            </div>
          </div>
          {form.add_shift && (
            <div>
              <FieldLabel>Quick Presets</FieldLabel>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                {SHIFT_PRESETS.map(p => (
                  <button key={p.name} onClick={() => applyPreset(p)} style={{ background: form.shift_name === p.name ? T.accentGlow : T.surface, border: `1px solid ${form.shift_name === p.name ? T.accent + '66' : T.border}`, color: form.shift_name === p.name ? T.accent : T.textMid, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>
                    {p.name} <span style={{ fontSize: 10, opacity: 0.7 }}>{p.start}–{p.end}</span>
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
                <Input label="Shift Name" value={form.shift_name}  onChange={set('shift_name')}  placeholder="Morning" />
                <Input label="Start Time" type="time" value={form.shift_start} onChange={set('shift_start')} />
                <Input label="End Time"   type="time" value={form.shift_end}   onChange={set('shift_end')} />
              </div>
              <Input label="Date" type="date" value={form.shift_date} onChange={set('shift_date')} />
            </div>
          )}
        </Section>
      )}
      {isEdit && (
        <Section title="Login Credentials">
          <Input label="Email" type="email" value={form.email} onChange={set('email')} placeholder="ahmed@restaurant.com" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <Input label="New Password" type="password" value={form.newPassword} onChange={set('newPassword')} placeholder="Leave blank to keep current" />
            <Input label="Confirm Password" type="password" value={form.confirmPassword} onChange={set('confirmPassword')} placeholder="Repeat new password" />
          </div>
          <PasswordStrength password={form.newPassword} />
          {form.newPassword && form.confirmPassword && form.newPassword !== form.confirmPassword && (
            <div style={{ fontSize: 12, color: T.red, marginTop: 4, fontWeight: 600 }}>✗ Passwords do not match</div>
          )}
          {form.newPassword && form.confirmPassword && form.newPassword === form.confirmPassword && (
            <div style={{ fontSize: 12, color: T.green, marginTop: 4, fontWeight: 600 }}>✓ Passwords match</div>
          )}
        </Section>
      )}

      <Btn onClick={handleSave} disabled={saving} style={{ width: '100%', marginTop: 4 }}>
        {saving ? '⏳ Saving…' : isEdit ? '✓ Save Changes' : '✓ Add Employee'}
      </Btn>
    </Modal>
  );
}

// ─── Bulk Shift Modal ─────────────────────────────────────────────────────────
function BulkShiftModal({ open, onClose, onSaved, employees }) {
  const BLANK = { employee_id: '', shift_name: 'Morning', start_time: '07:00', end_time: '15:00', date_from: todayStr(), date_to: todayStr(), notes: '', skip_weekends: false };
  const [form, setForm]     = useState(BLANK);
  const [mode, setMode]     = useState('bulk'); // 'bulk' | 'single'
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const applyPreset = p => setForm(f => ({ ...f, shift_name: p.name, start_time: p.start, end_time: p.end }));

  const dayCount = () => {
    try {
      const from = new Date(form.date_from), to = new Date(form.date_to);
      if (from > to) return 0;
      let days = Math.round((to - from) / 86400000) + 1;
      if (form.skip_weekends) {
        let count = 0;
        for (let i = 0; i < days; i++) {
          const d = new Date(from); d.setDate(from.getDate() + i);
          if (d.getDay() !== 0 && d.getDay() !== 6) count++;
        }
        return count;
      }
      return days;
    } catch { return 0; }
  };

  const handleSave = async () => {
    if (!form.employee_id) return toast.error('Select an employee');
    setSaving(true);
    try {
      if (mode === 'bulk') {
        const r = await bulkCreateShifts({ ...form, skip_weekends: form.skip_weekends });
        toast.success(`✓ ${r.data.created} shifts created${r.data.skipped ? `, ${r.data.skipped} already existed` : ''}`);
      } else {
        await createShift({ employee_id: form.employee_id, shift_name: form.shift_name, start_time: form.start_time, end_time: form.end_time, date: form.date_from, notes: form.notes });
        toast.success('Shift scheduled!');
      }
      onSaved(); onClose(); setForm(BLANK);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const btnStyle = (active) => ({
    flex: 1, padding: '8px 0', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
    fontFamily: "'Syne', sans-serif", border: `1px solid ${active ? T.accent + '66' : T.border}`,
    background: active ? T.accentGlow : T.surface, color: active ? T.accent : T.textMid,
  });

  return (
    <Modal open={open} onClose={onClose} title="Schedule Shifts" width={520}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        <button style={btnStyle(mode === 'bulk')}   onClick={() => setMode('bulk')}>📅 Bulk (Date Range)</button>
        <button style={btnStyle(mode === 'single')} onClick={() => setMode('single')}>📌 Single Date</button>
      </div>

      <Select label="Employee *" value={form.employee_id} onChange={set('employee_id')}>
        <option value="">— Select Employee —</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}{e.role_name ? ` (${e.role_name})` : ''}</option>)}
      </Select>

      <FieldLabel>Quick Presets</FieldLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {SHIFT_PRESETS.map(p => (
          <button key={p.name} onClick={() => applyPreset(p)} style={{ background: form.shift_name === p.name ? T.accentGlow : T.surface, border: `1px solid ${form.shift_name === p.name ? T.accent + '66' : T.border}`, color: form.shift_name === p.name ? T.accent : T.textMid, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>
            {p.name} <span style={{ fontSize: 10, opacity: 0.7 }}>{p.start}–{p.end}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
        <Input label="Shift Name" value={form.shift_name} onChange={set('shift_name')} placeholder="Morning" />
        <Input label="Start Time" type="time" value={form.start_time} onChange={set('start_time')} />
        <Input label="End Time"   type="time" value={form.end_time}   onChange={set('end_time')} />
      </div>

      {mode === 'bulk' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
            <Input label="From Date" type="date" value={form.date_from} onChange={set('date_from')} />
            <Input label="To Date"   type="date" value={form.date_to}   onChange={set('date_to')} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0 14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: T.textMid }}>
              <input type="checkbox" checked={form.skip_weekends} onChange={e => setForm(f => ({ ...f, skip_weekends: e.target.checked }))} style={{ accentColor: T.accent, width: 15, height: 15 }} />
              Skip weekends (Sat & Sun)
            </label>
            {dayCount() > 0 && (
              <span style={{ marginLeft: 'auto', fontSize: 12, color: T.accent, fontWeight: 700, background: T.accentGlow, padding: '4px 10px', borderRadius: 8 }}>
                {dayCount()} shifts will be created
              </span>
            )}
          </div>
        </>
      ) : (
        <Input label="Date" type="date" value={form.date_from} onChange={set('date_from')} />
      )}

      <Input label="Notes (optional)" value={form.notes} onChange={set('notes')} placeholder="Any instructions…" />

      <Btn onClick={handleSave} disabled={saving || (mode === 'bulk' && dayCount() === 0)} style={{ width: '100%', marginTop: 4 }}>
        {saving ? '⏳ Scheduling…' : mode === 'bulk' ? `✓ Create ${dayCount() || ''} Shifts` : '✓ Schedule Shift'}
      </Btn>
    </Modal>
  );
}

// ─── Edit Single Shift Modal ──────────────────────────────────────────────────
function EditShiftModal({ open, onClose, onSaved, shift }) {
  const [form, setForm] = useState({ shift_name: '', start_time: '', end_time: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    if (shift) setForm({ shift_name: shift.shift_name, start_time: shift.start_time, end_time: shift.end_time, notes: shift.notes || '' });
  }, [shift]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateShift(shift.id, form);
      toast.success('Shift updated!');
      onSaved(); onClose();
    } catch { toast.error('Failed to update shift'); }
    finally { setSaving(false); }
  };

  if (!shift) return null;
  return (
    <Modal open={open} onClose={onClose} title={`Edit Shift — ${shift.employee_name} (${shift.date})`} width={440}>
      <FieldLabel>Quick Presets</FieldLabel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {SHIFT_PRESETS.map(p => (
          <button key={p.name} onClick={() => setForm(f => ({ ...f, shift_name: p.name, start_time: p.start, end_time: p.end }))}
            style={{ background: form.shift_name === p.name ? T.accentGlow : T.surface, border: `1px solid ${form.shift_name === p.name ? T.accent + '66' : T.border}`, color: form.shift_name === p.name ? T.accent : T.textMid, borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>
            {p.name} <span style={{ fontSize: 10, opacity: 0.7 }}>{p.start}–{p.end}</span>
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
        <Input label="Shift Name" value={form.shift_name} onChange={set('shift_name')} />
        <Input label="Start Time" type="time" value={form.start_time} onChange={set('start_time')} />
        <Input label="End Time"   type="time" value={form.end_time}   onChange={set('end_time')} />
      </div>
      <Input label="Notes (optional)" value={form.notes} onChange={set('notes')} placeholder="Any instructions…" />
      <Btn onClick={handleSave} disabled={saving} style={{ width: '100%', marginTop: 4 }}>
        {saving ? '⏳ Saving…' : '✓ Save Changes'}
      </Btn>
    </Modal>
  );
}

// ─── Shifts Tab ───────────────────────────────────────────────────────────────
function ShiftsTab({ employees }) {
  const [shifts,     setShifts]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [addOpen,    setAddOpen]    = useState(false);
  const [editShift,  setEditShift]  = useState(null);
  const [dateFilter, setDateFilter] = useState(todayStr());

  const load = useCallback(() => {
    setLoading(true);
    getShifts({ date: dateFilter })
      .then(r => setShifts(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dateFilter]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (id, status) => {
    try { await updateShift(id, { status }); toast.success(`Shift ${status}`); load(); }
    catch { toast.error('Update failed'); }
  };

  const remove = async (id) => {
    try { await deleteShift(id); toast.success('Shift removed'); load(); }
    catch { toast.error('Delete failed'); }
  };

  const groups = [...new Set(shifts.map(s => s.shift_name))];

  if (loading) return <Spinner />;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 14px', color: T.text, fontSize: 13, fontFamily: "'Syne', sans-serif", outline: 'none' }} />
        <span style={{ fontSize: 13, color: T.textMid }}>{shifts.length} shift{shifts.length !== 1 ? 's' : ''} scheduled</span>
        <div style={{ marginLeft: 'auto' }}>
          <Btn onClick={() => setAddOpen(true)}>+ Schedule Shift</Btn>
        </div>
      </div>

      {shifts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: T.textDim }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.textMid, marginBottom: 6 }}>No shifts for {dateFilter}</div>
          <Btn onClick={() => setAddOpen(true)} style={{ marginTop: 12 }}>+ Schedule a Shift</Btn>
        </div>
      ) : (
        groups.map(group => (
          <div key={group} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              ⏰ {group} Shift
            </div>
            {shifts.filter(s => s.shift_name === group).map(shift => (
              <div key={shift.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: T.card, border: `1px solid ${SHIFT_STATUS_COLOR[shift.status]}44`, borderLeft: `3px solid ${SHIFT_STATUS_COLOR[shift.status]}`, borderRadius: 12, padding: '12px 16px', marginBottom: 8 }}>
                <EmpAvatar emp={{ full_name: shift.employee_name || '?', avatar_url: shift.avatar_url, shift_status: shift.status === 'active' ? 'active' : '' }} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{shift.employee_name}</div>
                  <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>
                    {shift.role_name && <span style={{ marginRight: 8 }}>{shift.role_name}</span>}
                    {shift.start_time} → {shift.end_time}
                  </div>
                </div>
                <Badge color={SHIFT_STATUS_COLOR[shift.status]} small>{shift.status}</Badge>
                <div style={{ display: 'flex', gap: 6 }}>
                  {shift.status === 'scheduled' && (
                    <>
                      <button onClick={() => changeStatus(shift.id, 'active')} style={{ background: T.greenDim, color: T.green, border: `1px solid ${T.green}44`, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>Check In</button>
                      <button onClick={() => changeStatus(shift.id, 'absent')} style={{ background: T.redDim, color: T.red, border: `1px solid ${T.red}44`, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>Absent</button>
                    </>
                  )}
                  {shift.status === 'active' && (
                    <button onClick={() => changeStatus(shift.id, 'completed')} style={{ background: T.blueDim, color: T.blue, border: `1px solid ${T.blue}44`, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>Check Out</button>
                  )}
                  <button onClick={() => setEditShift(shift)} style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textMid, borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'Syne', sans-serif" }}>✏ Edit</button>
                  <button onClick={() => remove(shift.id)} style={{ background: 'none', border: 'none', color: T.textDim, cursor: 'pointer', fontSize: 18, padding: '0 4px', lineHeight: 1 }}>×</button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}

      <BulkShiftModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={load} employees={employees} />
      <EditShiftModal open={!!editShift} onClose={() => setEditShift(null)} onSaved={load} shift={editShift} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Employees() {
  useT();
  const [employees, setEmployees] = useState([]);
  const [roles,     setRoles]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('staff');
  const [addOpen,   setAddOpen]   = useState(false);
  const [editEmp,   setEditEmp]   = useState(null);

  const load = useCallback(async () => {
    try {
      const [empRes, roleRes] = await Promise.all([getEmployees(), getRoles()]);
      setEmployees(empRes.data);
      setRoles(roleRes.data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDuty  = employees.filter(e => e.shift_status === 'active');
  const offDuty = employees.filter(e => e.shift_status !== 'active');

  const tabStyle = t => ({ padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 700 : 500, background: tab === t ? T.accent : 'transparent', color: tab === t ? '#000' : T.textMid, border: `1px solid ${tab === t ? T.accent : T.border}`, fontFamily: "'Syne', sans-serif" });

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="👥 Staff & Shifts"
        subtitle={`${employees.length} employees · ${onDuty.length} on duty`}
        action={<Btn onClick={() => { setEditEmp(null); setAddOpen(true); }}>+ Add Employee</Btn>}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button style={tabStyle('staff')}  onClick={() => setTab('staff')}>👤 Staff Directory</button>
        <button style={tabStyle('shifts')} onClick={() => setTab('shifts')}>📅 Shift Schedule</button>
      </div>

      {tab === 'staff' && (
        <>
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
            {[['Total Staff', employees.length, T.accent], ['On Duty', onDuty.length, T.green], ['Off Duty', offDuty.length, T.textMid], ['Full-Time', employees.filter(e => e.employee_type === 'full_time').length, T.blue], ['Part-Time', employees.filter(e => e.employee_type === 'part_time').length, T.purple]].map(([l, v, c]) => (
              <div key={l} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                <span style={{ fontSize: 12, color: T.textMid }}>{l}</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: c, fontFamily: 'monospace' }}>{v}</span>
              </div>
            ))}
          </div>

          {onDuty.length > 0 && (
            <>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: T.green, fontWeight: 700, marginBottom: 10 }}>🟢 On Duty ({onDuty.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 12, marginBottom: 24 }}>
                {onDuty.map(e => <EmpCard key={e.id} emp={e} onEdit={emp => { setEditEmp(emp); setAddOpen(true); }} />)}
              </div>
            </>
          )}

          {offDuty.length > 0 && (
            <>
              <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: T.textMid, fontWeight: 700, marginBottom: 10 }}>⚫ Off Duty ({offDuty.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 12 }}>
                {offDuty.map(e => <EmpCard key={e.id} emp={e} onEdit={emp => { setEditEmp(emp); setAddOpen(true); }} />)}
              </div>
            </>
          )}

          {employees.length === 0 && (
            <div style={{ textAlign: 'center', padding: 80, color: T.textDim }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>👥</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.textMid }}>No employees yet</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Click "+ Add Employee" to get started</div>
            </div>
          )}
        </>
      )}

      {tab === 'shifts' && <ShiftsTab employees={employees} />}

      <EmployeeModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditEmp(null); }}
        onSaved={load}
        editEmp={editEmp}
        roles={roles}
      />
    </div>
  );
}
