import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getMyShifts, getShifts, getEmployees, startMyShift, continueMyShift, closeMyShift } from '../../services/api';
import { Card, Badge, Spinner, Btn, T, useT, Modal } from '../shared/UI';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const STATUS_COLOR  = { scheduled: T.textMid, active: null, in_process: null, completed: null, absent: null };
const STATUS_LABEL  = { scheduled: 'Scheduled', active: 'Active', in_process: 'In Progress', completed: 'Completed', absent: 'Absent' };

function shiftColor(status) {
  if (status === 'active')     return T.green;
  if (status === 'in_process') return T.accent;
  if (status === 'completed')  return T.blue;
  if (status === 'absent')     return T.red;
  return T.textMid;
}

function fmtDate(dateStr) {
  return new Date((dateStr + '').slice(0, 10) + 'T12:00:00');
}

function fmtHours(start, end) {
  if (!start || !end) return '--';
  const [sh, sm] = start.slice(0, 5).split(':').map(Number);
  const [eh, em] = end.slice(0, 5).split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins <= 0) return '--';
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// ── Calendar ─────────────────────────────────────────────────────────────────
function CalendarView({ shifts, year, month, onDayClick }) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // group shifts by date string YYYY-MM-DD
  const byDay = {};
  shifts.forEach(s => {
    const key = (s.date + '').slice(0, 10);
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(s);
  });

  const today = new Date().toISOString().slice(0, 10);
  const cells = [];

  // empty cells before first day
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {dayNames.map(d => (
          <div key={d} style={{ fontSize: 10, fontWeight: 700, color: T.textMid, textAlign: 'center', padding: '4px 0', textTransform: 'uppercase', letterSpacing: 0.5 }}>{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const pad = String(month + 1).padStart(2, '0');
          const key = `${year}-${pad}-${String(d).padStart(2, '0')}`;
          const dayShifts = byDay[key] || [];
          const isToday = key === today;
          return (
            <div key={key} onClick={() => dayShifts.length && onDayClick(key, dayShifts)}
              style={{
                minHeight: 72, borderRadius: 10, padding: '6px 4px',
                background: isToday ? T.accentGlow : T.surface,
                border: `1px solid ${isToday ? T.accent + '88' : T.border}`,
                cursor: dayShifts.length ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}>
              <div style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? T.accent : T.text, marginBottom: 4, textAlign: 'center' }}>{d}</div>
              {dayShifts.slice(0, 3).map((s, si) => (
                <div key={si} style={{
                  fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 4px',
                  background: shiftColor(s.status) + '33',
                  color: shiftColor(s.status), marginBottom: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {s.employee_name ? s.employee_name.split(' ')[0] + ' · ' : ''}{s.start_time?.slice(0,5)}
                </div>
              ))}
              {dayShifts.length > 3 && (
                <div style={{ fontSize: 9, color: T.textDim, textAlign: 'center' }}>+{dayShifts.length - 3}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Table view ────────────────────────────────────────────────────────────────
function TableView({ shifts, isManager, onAction, acting }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${T.border}` }}>
            {['Date', isManager && 'Employee', 'Shift', 'Hours', 'Start – End', 'Status', 'Actions'].filter(Boolean).map(h => (
              <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shifts.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: T.textDim }}>No shifts found</td></tr>
          )}
          {shifts.map(s => {
            const d = fmtDate(s.date);
            const today = new Date().toISOString().slice(0, 10);
            const isToday = (s.date + '').slice(0, 10) === today;
            const now = new Date().toTimeString().slice(0, 5);
            const ended = isToday && now > (s.end_time?.slice(0, 5) || '23:59');
            return (
              <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}`, background: isToday ? T.accentGlow : 'transparent' }}>
                <td style={{ padding: '10px 12px', color: T.text, fontWeight: isToday ? 700 : 400 }}>
                  {d.toLocaleDateString('en', { day: '2-digit', month: 'short', year: 'numeric' })}
                  {isToday && <span style={{ marginLeft: 6, fontSize: 10, background: T.accent, color: '#000', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>Today</span>}
                </td>
                {isManager && <td style={{ padding: '10px 12px', color: T.text }}>{s.employee_name || '—'}</td>}
                <td style={{ padding: '10px 12px', color: T.text, fontWeight: 600 }}>#{s.shift_number} · {s.shift_name}</td>
                <td style={{ padding: '10px 12px', color: T.textMid, fontFamily: 'monospace' }}>{fmtHours(s.start_time, s.end_time)}</td>
                <td style={{ padding: '10px 12px', color: T.textMid, fontFamily: 'monospace', fontSize: 12 }}>{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}</td>
                <td style={{ padding: '10px 12px' }}>
                  <Badge color={shiftColor(s.status)}>{STATUS_LABEL[s.status] || s.status}</Badge>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {isToday && !isManager && s.status !== 'completed' && s.status !== 'absent' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {s.status === 'scheduled' && (
                        <Btn size="sm" disabled={acting} style={{ background: T.green, color: '#fff', border: 'none' }} onClick={() => onAction('start', s)}>▶ Start</Btn>
                      )}
                      {(s.status === 'active' || s.status === 'in_process') && (
                        <>
                          {s.status === 'active' && ended && (
                            <Btn size="sm" disabled={acting} style={{ background: T.accent, color: '#000', border: 'none' }} onClick={() => onAction('continue', s)}>⏩</Btn>
                          )}
                          <Btn size="sm" disabled={acting} style={{ background: T.red, color: '#fff', border: 'none' }} onClick={() => onAction('close', s)}>⏹ Close</Btn>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Open/Close panel ──────────────────────────────────────────────────────────
function ShiftPanel({ shift, acting, onStart, onContinue, onClose }) {
  const [elapsed, setElapsed] = useState('');
  const timerRef = useRef(null);

  useEffect(() => {
    if (shift?.status !== 'active' && shift?.status !== 'in_process') return;
    const calcElapsed = () => {
      const start = new Date((shift.date + '').slice(0, 10) + 'T' + (shift.start_time || '00:00').slice(0, 5));
      const mins = Math.floor((Date.now() - start.getTime()) / 60000);
      if (mins < 0) { setElapsed(''); return; }
      const h = Math.floor(mins / 60), m = mins % 60;
      setElapsed(h > 0 ? `${h}h ${m}m` : `${m}m`);
    };
    calcElapsed();
    timerRef.current = setInterval(calcElapsed, 60000);
    return () => clearInterval(timerRef.current);
  }, [shift]);

  if (!shift) {
    return (
      <Card style={{ padding: 28, textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📋</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No shift scheduled for today</div>
        <div style={{ fontSize: 13, color: T.textMid }}>Contact your manager to schedule a shift</div>
      </Card>
    );
  }

  const isOT = shift.status === 'in_process';
  const isActive = shift.status === 'active' || isOT;
  const panelColor = shift.status === 'scheduled' ? T.textMid : shift.status === 'active' ? T.green : shift.status === 'in_process' ? T.accent : shift.status === 'completed' ? T.blue : T.red;

  const now = new Date().toTimeString().slice(0, 5);
  const ended = now > (shift.end_time?.slice(0, 5) || '23:59');

  return (
    <Card style={{ padding: '20px 24px', marginBottom: 24, borderLeft: `4px solid ${panelColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: T.textMid, fontWeight: 700, marginBottom: 4 }}>
            {shift.status === 'scheduled' ? 'Upcoming Shift' : shift.status === 'completed' ? 'Shift Completed' : isOT ? 'Working Overtime' : 'Current Shift'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
            #{shift.shift_number} · {shift.shift_name}
          </div>
          <div style={{ fontSize: 13, color: T.textMid, marginTop: 3 }}>
            {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
            {elapsed && <span style={{ marginLeft: 10, color: panelColor, fontWeight: 700 }}>· {elapsed} elapsed</span>}
            {isOT && <span style={{ marginLeft: 8, background: T.accent + '33', color: T.accent, borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>OVERTIME</span>}
          </div>
        </div>

        <Badge color={panelColor} style={{ fontSize: 12 }}>{STATUS_LABEL[shift.status] || shift.status}</Badge>

        <div style={{ display: 'flex', gap: 10 }}>
          {shift.status === 'scheduled' && (
            <Btn disabled={acting} style={{ background: T.green, color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, fontWeight: 700 }}
              onClick={() => onStart(shift.id)}>
              ▶ Start Shift
            </Btn>
          )}
          {isActive && ended && shift.status === 'active' && (
            <Btn disabled={acting} style={{ background: T.accent, color: '#000', border: 'none', padding: '10px 20px', fontSize: 14, fontWeight: 700 }}
              onClick={() => onContinue(shift.id)}>
              ⏩ Continue
            </Btn>
          )}
          {isActive && (
            <Btn disabled={acting} style={{ background: T.red, color: '#fff', border: 'none', padding: '10px 20px', fontSize: 14, fontWeight: 700 }}
              onClick={() => onClose(shift.id)}>
              ⏹ Close Shift
            </Btn>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Day detail modal ──────────────────────────────────────────────────────────
function DayModal({ date, shifts, open, onClose }) {
  if (!date) return null;
  const d = fmtDate(date);
  return (
    <Modal open={open} onClose={onClose} title={d.toLocaleDateString('en', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} width={460}>
      {shifts.map(s => (
        <div key={s.id} style={{ padding: '12px 0', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: shiftColor(s.status), flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>#{s.shift_number} · {s.shift_name}</div>
            {s.employee_name && <div style={{ fontSize: 11, color: T.textMid }}>{s.employee_name}</div>}
            <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)} · {fmtHours(s.start_time, s.end_time)}</div>
          </div>
          <Badge color={shiftColor(s.status)} small>{STATUS_LABEL[s.status] || s.status}</Badge>
        </div>
      ))}
    </Modal>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MyShift() {
  useT();
  const { user, hasPermission } = useAuth();
  const isManager = hasPermission('employees');

  const now = new Date();
  const [year,         setYear]         = useState(now.getFullYear());
  const [month,        setMonth]        = useState(now.getMonth()); // 0-based
  const [view,         setView]         = useState('calendar'); // 'calendar' | 'table'
  const [shifts,       setShifts]       = useState([]);
  const [employees,    setEmployees]    = useState([]);
  const [filterEmp,    setFilterEmp]    = useState('');
  const [todayShift,   setTodayShift]   = useState(null); // for ShiftPanel (employee only)
  const [loading,      setLoading]      = useState(true);
  const [acting,       setActing]       = useState(false);
  const [dayModal,     setDayModal]     = useState(null); // { date, shifts }

  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (isManager) {
        const params = { month: monthStr };
        if (filterEmp) params.employee_id = filterEmp;
        const [sr, er] = await Promise.all([getShifts(params), employees.length ? null : getEmployees()]);
        setShifts(sr.data);
        if (er) setEmployees(er.data);
      } else {
        const sr = await getMyShifts();
        setShifts(sr.data);
        const today = new Date().toISOString().slice(0, 10);
        const todayList = sr.data.filter(s => (s.date + '').slice(0, 10) === today);
        setTodayShift(todayList.find(s => ['scheduled','active','in_process'].includes(s.status)) || todayList[0] || null);
      }
    } catch { toast.error('Failed to load shifts'); }
    finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, monthStr, filterEmp]);

  useEffect(() => { load(); }, [load]);

  // Filter shifts to current month for calendar (employee sees all months in table)
  const visibleShifts = view === 'calendar'
    ? shifts.filter(s => (s.date + '').slice(0, 7) === monthStr)
    : shifts;

  const handleAction = async (action, shift) => {
    setActing(true);
    try {
      if (action === 'start')    { await startMyShift(shift.id);    toast.success('Shift started!'); }
      if (action === 'continue') { await continueMyShift(shift.id); toast.success('Continuing in overtime'); }
      if (action === 'close')    { await closeMyShift(shift.id);    toast.success('Shift closed'); }
      load();
    } catch (e) { toast.error(e.response?.data?.error || 'Action failed'); }
    finally { setActing(false); }
  };

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0, flex: 1 }}>
          {isManager ? 'Shift Management' : 'My Shifts'}
        </h1>
        {/* View toggle */}
        <div style={{ display: 'flex', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: 'hidden' }}>
          {[['calendar','📅 Calendar'],['table','☰ Table']].map(([v, lbl]) => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: view === v ? T.accent : 'transparent',
              color: view === v ? '#000' : T.textMid,
              fontFamily: "'Syne', sans-serif",
            }}>{lbl}</button>
          ))}
        </div>
      </div>
      <p style={{ color: T.textMid, fontSize: 13, marginBottom: 20 }}>
        {isManager ? 'View and manage all employee shifts' : 'Open, close and track your work shifts'}
      </p>

      {/* Employee filter (manager only) */}
      {isManager && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
            style={{ background: T.card, border: `1px solid ${T.border}`, color: filterEmp ? T.text : T.textDim, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontFamily: "'Syne', sans-serif", outline: 'none' }}>
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </div>
      )}

      {/* Current shift panel (employee only) */}
      {!isManager && (
        <ShiftPanel
          shift={todayShift}
          acting={acting}
          onStart={id => handleAction('start', { id })}
          onContinue={id => handleAction('continue', { id })}
          onClose={id => handleAction('close', { id })}
        />
      )}

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14, fontFamily: "'Syne', sans-serif" }}>‹</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: T.text, minWidth: 160, textAlign: 'center' }}>
          {MONTH_NAMES[month]} {year}
        </div>
        <button onClick={nextMonth} style={{ background: T.card, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 14, fontFamily: "'Syne', sans-serif" }}>›</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()); }}
          style={{ background: T.accentGlow, border: `1px solid ${T.accent}44`, color: T.accent, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: "'Syne', sans-serif" }}>
          Today
        </button>

        {/* Legend */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[['scheduled', 'Scheduled'], ['active', 'Active'], ['in_process', 'Overtime'], ['completed', 'Completed']].map(([s, lbl]) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.textMid }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: shiftColor(s) }} />
              {lbl}
            </div>
          ))}
        </div>
      </div>

      {loading ? <Spinner /> : (
        <>
          {view === 'calendar' ? (
            <Card style={{ padding: 16 }}>
              <CalendarView
                shifts={visibleShifts}
                year={year}
                month={month}
                onDayClick={(date, dayShifts) => setDayModal({ date, shifts: dayShifts })}
              />
            </Card>
          ) : (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <TableView
                shifts={visibleShifts}
                isManager={isManager}
                acting={acting}
                onAction={(action, shift) => handleAction(action, shift)}
              />
            </Card>
          )}
        </>
      )}

      {/* Day detail modal */}
      <DayModal
        date={dayModal?.date}
        shifts={dayModal?.shifts || []}
        open={!!dayModal}
        onClose={() => setDayModal(null)}
      />
    </div>
  );
}
