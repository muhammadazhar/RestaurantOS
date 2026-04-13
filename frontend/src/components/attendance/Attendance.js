import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import {
  attClockIn, attClockOut, attGetStatus, attGetTodayOverview,
  attGetDaily, attGetLeaves, attCreateLeave, attUpdateLeave,
  attGetHolidays, attCreateHoliday, attUpdateHoliday, attDeleteHoliday,
  attGetOTRules, attCreateOTRule, attUpdateOTRule,
  attGetCorrections, attCreateCorrection, attUpdateCorrection,
  attGetMonthlySummary, attGetLogs, attCreateLog, attVoidLog, attRecompute,
  getEmployees, getShifts, getOpenShifts, forceCloseShift,
} from '../../services/api';

const TABS = ['Live', 'Records', 'Leaves', 'Holidays', 'OT Rules', 'Corrections', 'Reports'];

const STATUS_COLORS = {
  present: '#27AE60', absent: '#E74C3C', late: '#F39C12',
  half_day: '#E67E22', on_leave: '#3498DB', holiday: '#9B59B6',
  weekend: '#95A5A6', on_leave_holiday: '#8E44AD',
};

const fmt = (mins) => {
  if (!mins && mins !== 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fmtTime = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fmtDate = (d) => {
  if (!d) return '—';
  const dateOnly = (d + '').slice(0, 10);
  return new Date(dateOnly + 'T00:00:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const todayISO = () => new Date().toISOString().split('T')[0];

export default function Attendance() {
  const { theme: T } = useTheme();
  const { user, hasPermission } = useAuth();
  const isManager = hasPermission('employees');

  const [tab, setTab]             = useState('Live');
  const [clockStatus, setClockStatus] = useState(null);
  const [todayData, setTodayData] = useState({ employees: [], summary: {} });
  const [daily, setDaily]         = useState([]);
  const [leaves, setLeaves]       = useState([]);
  const [holidays, setHolidays]   = useState([]);
  const [otRules, setOTRules]     = useState([]);
  const [corrections, setCorrections] = useState([]);
  const [summary, setSummary]     = useState({ employees: [] });
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts]       = useState([]);
  const [openShifts, setOpenShifts] = useState([]);

  // Filters
  const [dailyFilter, setDailyFilter]   = useState({ date: todayISO(), employee_id: '' });
  const [leaveFilter, setLeaveFilter]   = useState({ status: '', employee_id: '' });
  const [corrFilter, setCorrFilter]     = useState({ status: 'pending' });
  const [summaryFilter, setSummaryFilter] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1, employee_id: '' });

  // Modals
  const [leaveModal, setLeaveModal]     = useState(null); // null | 'new' | leave obj
  const [holidayModal, setHolidayModal] = useState(null);
  const [otModal, setOTModal]           = useState(null);
  const [corrModal, setCorrModal]       = useState(null);
  const [manualModal, setManualModal]   = useState(false);

  const [loading, setLoading] = useState(false);

  // ── Load helpers ──────────────────────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try { const r = await attGetStatus(); setClockStatus(r.data); } catch {}
  }, []);

  const loadToday = useCallback(async () => {
    try { const r = await attGetTodayOverview(); setTodayData(r.data || { employees: [], summary: {} }); } catch {}
  }, []);

  const loadDaily = useCallback(async () => {
    try { const r = await attGetDaily(dailyFilter); setDaily(r.data || []); } catch {}
  }, [dailyFilter]);

  const loadLeaves = useCallback(async () => {
    try { const r = await attGetLeaves(leaveFilter); setLeaves(r.data || []); } catch {}
  }, [leaveFilter]);

  const loadHolidays = useCallback(async () => {
    try { const r = await attGetHolidays(); setHolidays(r.data || []); } catch {}
  }, []);

  const loadOTRules = useCallback(async () => {
    try { const r = await attGetOTRules(); setOTRules(r.data || []); } catch {}
  }, []);

  const loadCorrections = useCallback(async () => {
    try { const r = await attGetCorrections(corrFilter); setCorrections(r.data || []); } catch {}
  }, [corrFilter]);

  const loadSummary = useCallback(async () => {
    try { const r = await attGetMonthlySummary(summaryFilter); setSummary(r.data || { employees: [] }); } catch {}
  }, [summaryFilter]);

  useEffect(() => {
    if (isManager) {
      getEmployees().then(r => setEmployees(r.data || [])).catch(() => {});
      getShifts().then(r => setShifts(r.data || [])).catch(() => {});
    }
  }, [isManager]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const loadOpenShifts = useCallback(async () => {
    if (!isManager) return;
    try { const r = await getOpenShifts(); setOpenShifts(r.data || []); } catch {}
  }, [isManager]);

  useEffect(() => {
    if (tab === 'Live')        { loadStatus(); loadToday(); }
    if (tab === 'Records')     { loadDaily(); loadOpenShifts(); }
    if (tab === 'Leaves')      { loadLeaves(); }
    if (tab === 'Holidays')    { loadHolidays(); }
    if (tab === 'OT Rules')    { loadOTRules(); }
    if (tab === 'Corrections') { loadCorrections(); }
    if (tab === 'Reports')     { loadSummary(); }
  }, [tab]);

  // ── Clock actions ─────────────────────────────────────────────────────────
  const handleClockIn = async () => {
    setLoading(true);
    try {
      await attClockIn({ source: 'web' });
      toast.success('Clocked in!');
      loadStatus(); loadToday();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleClockOut = async () => {
    setLoading(true);
    try {
      await attClockOut({ source: 'web' });
      toast.success('Clocked out!');
      loadStatus(); loadToday();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleRowClockIn = async (empId) => {
    try {
      await attClockIn({ employee_id: empId, source: 'web' });
      toast.success('Clocked in!');
      loadDaily(); loadStatus();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleRowClockOut = async (empId) => {
    try {
      await attClockOut({ employee_id: empId, source: 'web' });
      toast.success('Clocked out!');
      loadDaily(); loadStatus();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const handleForceCloseShift = async (shiftId) => {
    try {
      await forceCloseShift(shiftId);
      toast.success('Shift closed!');
      loadOpenShifts(); loadDaily();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  // ── Styles ────────────────────────────────────────────────────────────────
  const card  = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 20 };
  const inp   = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 12px', color: T.text, fontSize: 13, fontFamily: "'Inter',sans-serif", outline: 'none', width: '100%' };
  const btn   = (bg = T.accent, col = '#000') => ({ background: bg, color: col, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Inter',sans-serif" });
  const label = { fontSize: 11, fontWeight: 700, color: T.textMid, letterSpacing: 0.5, marginBottom: 4 };

  // ── TAB: Live ─────────────────────────────────────────────────────────────
  const renderLive = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Clock widget */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 48 }}>🕐</div>
        <div style={{ flex: 1 }}>
          <div style={{ color: T.text, fontWeight: 800, fontSize: 18, marginBottom: 4 }}>
            {clockStatus?.clocked_in ? 'You\'re clocked in' : 'Not clocked in'}
          </div>
          {clockStatus?.clock_in_at && (
            <div style={{ color: T.textMid, fontSize: 13 }}>
              Since {fmtTime(clockStatus.clock_in_at)} · {fmt(clockStatus.worked_minutes)} worked today
            </div>
          )}
        </div>
        {!clockStatus?.clocked_in ? (
          <button style={btn('#27AE60', '#fff')} onClick={handleClockIn} disabled={loading}>
            {loading ? '…' : '▶ Clock In'}
          </button>
        ) : (
          <button style={btn('#E74C3C', '#fff')} onClick={handleClockOut} disabled={loading}>
            {loading ? '…' : '⏹ Clock Out'}
          </button>
        )}
      </div>

      {/* Today's overview (manager sees all) */}
      {isManager && (
        <>
          {/* Summary pills */}
          {todayData.summary && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'Total',    value: todayData.summary.total    || 0, color: T.textMid },
                { label: 'Present',  value: todayData.summary.present  || 0, color: '#27AE60' },
                { label: 'Absent',   value: todayData.summary.absent   || 0, color: '#E74C3C' },
                { label: 'Late',     value: todayData.summary.late     || 0, color: '#F39C12' },
                { label: 'On Leave', value: todayData.summary.on_leave || 0, color: '#3498DB' },
              ].map(s => (
                <div key={s.label} style={{ ...card, padding: '10px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: T.textMid, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          <div style={card}>
            <div style={{ fontWeight: 800, color: T.text, marginBottom: 16 }}>Today's Overview</div>
            {(todayData.employees || []).length === 0 ? (
              <div style={{ color: T.textMid, fontSize: 13 }}>No attendance data yet for today.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: T.textMid }}>
                      {['Employee', 'Status', 'Clock In', 'Clock Out', 'Worked', 'Late', 'OT'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(todayData.employees || []).map(row => (
                      <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: '8px 10px', color: T.text, fontWeight: 600 }}>{row.full_name}</td>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ background: (STATUS_COLORS[row.status] || T.accent) + '22', color: STATUS_COLORS[row.status] || T.accent, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                            {row.status?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '8px 10px', color: T.textMid }}>{fmtTime(row.clock_in_at)}</td>
                        <td style={{ padding: '8px 10px', color: T.textMid }}>{fmtTime(row.clock_out_at)}</td>
                        <td style={{ padding: '8px 10px', color: T.text }}>{fmt(row.worked_minutes)}</td>
                        <td style={{ padding: '8px 10px', color: row.late_minutes > 0 ? '#E74C3C' : T.textMid }}>{fmt(row.late_minutes)}</td>
                        <td style={{ padding: '8px 10px', color: row.ot_minutes > 0 ? '#27AE60' : T.textMid }}>{fmt(row.ot_minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Manual log entry for managers */}
      {isManager && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button style={btn(T.surface, T.text)} onClick={() => setManualModal(true)}>+ Manual Entry</button>
          <button style={btn(T.surface, T.text)} onClick={async () => {
            try { await attRecompute({ date: todayISO() }); toast.success('Recomputed'); loadToday(); }
            catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
          }}>↻ Recompute Today</button>
        </div>
      )}
    </div>
  );

  // ── TAB: Records ──────────────────────────────────────────────────────────
  const renderRecords = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Open shifts from previous days */}
      {isManager && openShifts.length > 0 && (
        <div style={{ ...card, border: `1px solid #E74C3C55`, background: '#E74C3C11' }}>
          <div style={{ fontWeight: 700, color: '#E74C3C', fontSize: 13, marginBottom: 10 }}>
            ⚠ {openShifts.length} shift{openShifts.length > 1 ? 's' : ''} still open from previous period
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {openShifts.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: T.card, borderRadius: 8, padding: '8px 12px', border: `1px solid ${T.border}` }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{s.employee_name}</span>
                  <span style={{ color: T.textMid, fontSize: 12, marginLeft: 8 }}>
                    {s.shift_name} · {fmtDate(s.date)} · {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}
                  </span>
                  <span style={{ marginLeft: 8, background: '#F39C1222', color: '#F39C12', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{s.status}</span>
                </div>
                <button onClick={() => handleForceCloseShift(s.id)} style={{ ...btn('#E74C3C', '#fff'), padding: '5px 12px', fontSize: 12 }}>Force Close</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={label}>Date</div>
          <input type="date" style={{ ...inp, width: 160 }} value={dailyFilter.date}
            onChange={e => setDailyFilter(f => ({ ...f, date: e.target.value }))} />
        </div>
        {isManager && (
          <div>
            <div style={label}>Employee</div>
            <select style={{ ...inp, width: 180 }} value={dailyFilter.employee_id}
              onChange={e => setDailyFilter(f => ({ ...f, employee_id: e.target.value }))}>
              <option value="">All Employees</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
            </select>
          </div>
        )}
        <button style={btn()} onClick={loadDaily}>Search</button>
      </div>

      <div style={card}>
        {daily.length === 0 ? (
          <div style={{ color: T.textMid, fontSize: 13 }}>No records found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ color: T.textMid }}>
                  {['Date', isManager ? 'Employee' : null, 'Status', 'Clock In', 'Clock Out', 'Worked', 'Break', 'Late', 'Early Exit', 'OT', 'Notes', 'Actions'].filter(Boolean).map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {daily.map(row => {
                  const canClockIn  = !row.clock_in_at;
                  const canClockOut = row.clock_in_at && !row.clock_out_at;
                  return (
                    <tr key={row.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: '8px 10px', color: T.textMid }}>{fmtDate(row.attendance_date)}</td>
                      {isManager && <td style={{ padding: '8px 10px', color: T.text, fontWeight: 600 }}>{row.full_name}</td>}
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ background: STATUS_COLORS[row.status] + '22', color: STATUS_COLORS[row.status], borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                          {row.status?.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px', color: T.textMid }}>{fmtTime(row.clock_in_at)}</td>
                      <td style={{ padding: '8px 10px', color: T.textMid }}>{fmtTime(row.clock_out_at)}</td>
                      <td style={{ padding: '8px 10px', color: T.text }}>{fmt(row.worked_minutes)}</td>
                      <td style={{ padding: '8px 10px', color: T.textMid }}>{fmt(row.break_minutes)}</td>
                      <td style={{ padding: '8px 10px', color: row.late_minutes > 0 ? '#E74C3C' : T.textMid }}>{fmt(row.late_minutes)}</td>
                      <td style={{ padding: '8px 10px', color: row.early_exit_minutes > 0 ? '#E67E22' : T.textMid }}>{fmt(row.early_exit_minutes)}</td>
                      <td style={{ padding: '8px 10px', color: row.ot_minutes > 0 ? '#27AE60' : T.textMid }}>{fmt(row.ot_minutes)}</td>
                      <td style={{ padding: '8px 10px', color: T.textMid, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.notes || '—'}</td>
                      <td style={{ padding: '8px 10px' }}>
                        {canClockIn && (
                          <button onClick={() => handleRowClockIn(row.employee_id)}
                            style={{ ...btn('#27AE60', '#fff'), padding: '4px 10px', fontSize: 11 }}>
                            Clock In
                          </button>
                        )}
                        {canClockOut && (
                          <button onClick={() => handleRowClockOut(row.employee_id)}
                            style={{ ...btn('#E74C3C', '#fff'), padding: '4px 10px', fontSize: 11 }}>
                            Clock Out
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  // ── TAB: Leaves ───────────────────────────────────────────────────────────
  const LeaveForm = ({ initial, onSave, onClose }) => {
    const [f, setF] = useState(initial || { employee_id: user?.id || '', leave_type: 'annual', start_date: todayISO(), end_date: todayISO(), duration_type: 'full', reason: '' });
    const h = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isManager && (
          <div>
            <div style={label}>Employee</div>
            <select style={inp} value={f.employee_id} onChange={h('employee_id')}>
              <option value="">Select…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={label}>Leave Type</div>
            <select style={inp} value={f.leave_type} onChange={h('leave_type')}>
              {['annual','sick','unpaid','emergency','compensatory'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div style={label}>Duration</div>
            <select style={inp} value={f.duration_type} onChange={h('duration_type')}>
              <option value="full">Full Day</option>
              <option value="half_am">Half AM</option>
              <option value="half_pm">Half PM</option>
            </select>
          </div>
          <div>
            <div style={label}>Start Date</div>
            <input type="date" style={inp} value={f.start_date} onChange={h('start_date')} />
          </div>
          <div>
            <div style={label}>End Date</div>
            <input type="date" style={inp} value={f.end_date} onChange={h('end_date')} />
          </div>
        </div>
        <div>
          <div style={label}>Reason</div>
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={f.reason} onChange={h('reason')} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btn(T.surface, T.text)} onClick={onClose}>Cancel</button>
          <button style={btn()} onClick={() => onSave(f)}>Save</button>
        </div>
      </div>
    );
  };

  const renderLeaves = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={label}>Status</div>
            <select style={{ ...inp, width: 140 }} value={leaveFilter.status} onChange={e => setLeaveFilter(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              {['pending','approved','rejected','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {isManager && (
            <div>
              <div style={label}>Employee</div>
              <select style={{ ...inp, width: 180 }} value={leaveFilter.employee_id} onChange={e => setLeaveFilter(f => ({ ...f, employee_id: e.target.value }))}>
                <option value="">All</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
            </div>
          )}
          <button style={btn()} onClick={loadLeaves}>Search</button>
        </div>
        <button style={btn('#27AE60', '#fff')} onClick={() => setLeaveModal('new')}>+ Request Leave</button>
      </div>

      <div style={card}>
        {leaves.length === 0 ? (
          <div style={{ color: T.textMid, fontSize: 13 }}>No leave requests found.</div>
        ) : leaves.map(lv => (
          <div key={lv.id} style={{ borderBottom: `1px solid ${T.border}`, padding: '12px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              {isManager && <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{lv.full_name}</div>}
              <div style={{ color: T.text, fontSize: 13 }}>{lv.leave_type} · {fmtDate(lv.start_date)} → {fmtDate(lv.end_date)}</div>
              <div style={{ color: T.textMid, fontSize: 12, marginTop: 2 }}>{lv.reason || '—'}</div>
            </div>
            <span style={{ background: ({ pending: '#F39C12', approved: '#27AE60', rejected: '#E74C3C', cancelled: '#95A5A6' }[lv.status] || T.accent) + '22', color: ({ pending: '#F39C12', approved: '#27AE60', rejected: '#E74C3C', cancelled: '#95A5A6' }[lv.status] || T.accent), borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
              {lv.status}
            </span>
            {isManager && lv.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btn('#27AE60', '#fff')} onClick={async () => {
                  try { await attUpdateLeave(lv.id, { status: 'approved' }); toast.success('Approved'); loadLeaves(); }
                  catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
                }}>Approve</button>
                <button style={btn('#E74C3C', '#fff')} onClick={async () => {
                  const note = window.prompt('Rejection reason (optional):');
                  try { await attUpdateLeave(lv.id, { status: 'rejected', rejection_note: note || '' }); toast.success('Rejected'); loadLeaves(); }
                  catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
                }}>Reject</button>
              </div>
            )}
            {lv.status === 'pending' && !isManager && (
              <button style={btn('#E74C3C', '#fff')} onClick={async () => {
                try { await attUpdateLeave(lv.id, { status: 'cancelled' }); toast.success('Cancelled'); loadLeaves(); }
                catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
              }}>Cancel</button>
            )}
          </div>
        ))}
      </div>

      {leaveModal && (
        <Modal title={leaveModal === 'new' ? 'Request Leave' : 'Edit Leave'} onClose={() => setLeaveModal(null)} T={T}>
          <LeaveForm initial={leaveModal !== 'new' ? leaveModal : null} onClose={() => setLeaveModal(null)}
            onSave={async (f) => {
              try {
                if (leaveModal === 'new') await attCreateLeave(f);
                else await attUpdateLeave(leaveModal.id, f);
                toast.success('Saved'); setLeaveModal(null); loadLeaves();
              } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
            }} />
        </Modal>
      )}
    </div>
  );

  // ── TAB: Holidays ─────────────────────────────────────────────────────────
  const HolidayForm = ({ initial, onSave, onClose }) => {
    const [f, setF] = useState(initial || { name: '', date: todayISO(), type: 'full', is_paid: true, notes: '' });
    const h = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><div style={label}>Name</div><input style={inp} value={f.name} onChange={h('name')} placeholder="e.g. Eid ul-Adha" /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><div style={label}>Date</div><input type="date" style={inp} value={f.date} onChange={h('date')} /></div>
          <div>
            <div style={label}>Type</div>
            <select style={inp} value={f.type} onChange={h('type')}>
              <option value="full">Full Day</option>
              <option value="half">Half Day</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={f.is_paid} onChange={e => setF(p => ({ ...p, is_paid: e.target.checked }))} />
          <span style={{ color: T.text, fontSize: 13 }}>Paid holiday</span>
        </div>
        <div><div style={label}>Notes</div><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.notes || ''} onChange={h('notes')} /></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btn(T.surface, T.text)} onClick={onClose}>Cancel</button>
          <button style={btn()} onClick={() => onSave(f)}>Save</button>
        </div>
      </div>
    );
  };

  const renderHolidays = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isManager && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={btn('#27AE60', '#fff')} onClick={() => setHolidayModal('new')}>+ Add Holiday</button>
        </div>
      )}
      <div style={card}>
        {holidays.length === 0 ? (
          <div style={{ color: T.textMid, fontSize: 13 }}>No holidays configured.</div>
        ) : holidays.map(h => (
          <div key={h.id} style={{ borderBottom: `1px solid ${T.border}`, padding: '12px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{h.name}</div>
              <div style={{ color: T.textMid, fontSize: 12 }}>{fmtDate(h.date)} · {h.type} day · {h.is_paid ? 'Paid' : 'Unpaid'}</div>
              {h.notes && <div style={{ color: T.textMid, fontSize: 12, marginTop: 2 }}>{h.notes}</div>}
            </div>
            {isManager && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btn(T.surface, T.text)} onClick={() => setHolidayModal(h)}>Edit</button>
                <button style={btn('#E74C3C', '#fff')} onClick={async () => {
                  if (!window.confirm('Delete this holiday?')) return;
                  try { await attDeleteHoliday(h.id); toast.success('Deleted'); loadHolidays(); }
                  catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
                }}>Delete</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {holidayModal && (
        <Modal title={holidayModal === 'new' ? 'Add Holiday' : 'Edit Holiday'} onClose={() => setHolidayModal(null)} T={T}>
          <HolidayForm initial={holidayModal !== 'new' ? holidayModal : null} onClose={() => setHolidayModal(null)}
            onSave={async (f) => {
              try {
                if (holidayModal === 'new') await attCreateHoliday(f);
                else await attUpdateHoliday(holidayModal.id, f);
                toast.success('Saved'); setHolidayModal(null); loadHolidays();
              } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
            }} />
        </Modal>
      )}
    </div>
  );

  // ── TAB: OT Rules ─────────────────────────────────────────────────────────
  const OTForm = ({ initial, onSave, onClose }) => {
    const [f, setF] = useState(initial || { name: 'Default', daily_regular_hours: 8, ot_multiplier: 1.5, holiday_multiplier: 2.0, ot_threshold_min: 30, ot_rounding_min: 15, is_default: false });
    const h = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><div style={label}>Rule Name</div><input style={inp} value={f.name} onChange={h('name')} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><div style={label}>Regular Hours/Day</div><input type="number" style={inp} value={f.daily_regular_hours} onChange={h('daily_regular_hours')} step="0.5" /></div>
          <div><div style={label}>OT Multiplier</div><input type="number" style={inp} value={f.ot_multiplier} onChange={h('ot_multiplier')} step="0.25" /></div>
          <div><div style={label}>Holiday Multiplier</div><input type="number" style={inp} value={f.holiday_multiplier} onChange={h('holiday_multiplier')} step="0.25" /></div>
          <div><div style={label}>OT Threshold (min)</div><input type="number" style={inp} value={f.ot_threshold_min} onChange={h('ot_threshold_min')} /></div>
          <div><div style={label}>OT Rounding (min)</div><input type="number" style={inp} value={f.ot_rounding_min} onChange={h('ot_rounding_min')} /></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={!!f.is_default} onChange={e => setF(p => ({ ...p, is_default: e.target.checked }))} />
          <span style={{ color: T.text, fontSize: 13 }}>Set as default rule</span>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btn(T.surface, T.text)} onClick={onClose}>Cancel</button>
          <button style={btn()} onClick={() => onSave(f)}>Save</button>
        </div>
      </div>
    );
  };

  const renderOTRules = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {isManager && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button style={btn('#27AE60', '#fff')} onClick={() => setOTModal('new')}>+ Add OT Rule</button>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
        {otRules.length === 0 ? (
          <div style={{ ...card, color: T.textMid, fontSize: 13 }}>No OT rules configured.</div>
        ) : otRules.map(rule => (
          <div key={rule.id} style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: T.text, fontSize: 15 }}>{rule.name}</div>
              {rule.is_default && <span style={{ background: T.accent + '22', color: T.accent, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>Default</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: T.textMid }}>
              <div>Regular: <b style={{ color: T.text }}>{rule.daily_regular_hours}h/day</b></div>
              <div>OT Rate: <b style={{ color: T.text }}>{rule.ot_multiplier}×</b></div>
              <div>Holiday: <b style={{ color: T.text }}>{rule.holiday_multiplier}×</b></div>
              <div>Threshold: <b style={{ color: T.text }}>{rule.ot_threshold_min}min</b></div>
              <div>Rounding: <b style={{ color: T.text }}>{rule.ot_rounding_min}min</b></div>
            </div>
            {isManager && (
              <button style={{ ...btn(T.surface, T.text), marginTop: 12, width: '100%' }} onClick={() => setOTModal(rule)}>Edit</button>
            )}
          </div>
        ))}
      </div>

      {otModal && (
        <Modal title={otModal === 'new' ? 'Add OT Rule' : 'Edit OT Rule'} onClose={() => setOTModal(null)} T={T}>
          <OTForm initial={otModal !== 'new' ? otModal : null} onClose={() => setOTModal(null)}
            onSave={async (f) => {
              try {
                if (otModal === 'new') await attCreateOTRule(f);
                else await attUpdateOTRule(otModal.id, f);
                toast.success('Saved'); setOTModal(null); loadOTRules();
              } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
            }} />
        </Modal>
      )}
    </div>
  );

  // ── TAB: Corrections ──────────────────────────────────────────────────────
  const CorrForm = ({ initial, onSave, onClose }) => {
    const [f, setF] = useState(initial || { employee_id: '', attendance_date: todayISO(), corrected_clock_in: '', corrected_clock_out: '', corrected_status: '', reason: '' });
    const h = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isManager && (
          <div>
            <div style={label}>Employee</div>
            <select style={inp} value={f.employee_id} onChange={h('employee_id')}>
              <option value="">Select…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          </div>
        )}
        <div>
          <div style={label}>Attendance Date</div>
          <input type="date" style={inp} value={f.attendance_date} onChange={h('attendance_date')} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={label}>Corrected Clock In</div>
            <input type="datetime-local" style={inp} value={f.corrected_clock_in} onChange={h('corrected_clock_in')} />
          </div>
          <div>
            <div style={label}>Corrected Clock Out</div>
            <input type="datetime-local" style={inp} value={f.corrected_clock_out} onChange={h('corrected_clock_out')} />
          </div>
        </div>
        <div>
          <div style={label}>Corrected Status (optional)</div>
          <select style={inp} value={f.corrected_status || ''} onChange={h('corrected_status')}>
            <option value="">— unchanged —</option>
            {['present','absent','late','half_day','on_leave','holiday','weekend'].map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={label}>Reason *</div>
          <textarea style={{ ...inp, minHeight: 70, resize: 'vertical' }} value={f.reason} onChange={h('reason')} placeholder="Required" />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={btn(T.surface, T.text)} onClick={onClose}>Cancel</button>
          <button style={btn()} onClick={() => onSave(f)}>Submit</button>
        </div>
      </div>
    );
  };

  const renderCorrections = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <div style={label}>Status Filter</div>
          <select style={{ ...inp, width: 160 }} value={corrFilter.status} onChange={e => { setCorrFilter(f => ({ ...f, status: e.target.value })); }}>
            <option value="">All</option>
            {['pending','approved','rejected'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={btn()} onClick={loadCorrections}>Search</button>
          <button style={btn('#27AE60', '#fff')} onClick={() => setCorrModal('new')}>+ New Correction</button>
        </div>
      </div>

      <div style={card}>
        {corrections.length === 0 ? (
          <div style={{ color: T.textMid, fontSize: 13 }}>No correction requests found.</div>
        ) : corrections.map(c => (
          <div key={c.id} style={{ borderBottom: `1px solid ${T.border}`, padding: '12px 0', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              {isManager && <div style={{ fontWeight: 700, color: T.text, fontSize: 13 }}>{c.full_name}</div>}
              <div style={{ color: T.text, fontSize: 13 }}>{fmtDate(c.attendance_date)}</div>
              <div style={{ color: T.textMid, fontSize: 12, marginTop: 2 }}>
                {c.corrected_clock_in ? `In: ${fmtTime(c.corrected_clock_in)}` : ''} {c.corrected_clock_out ? `Out: ${fmtTime(c.corrected_clock_out)}` : ''}
              </div>
              <div style={{ color: T.textMid, fontSize: 12 }}>{c.reason}</div>
              {c.rejection_note && <div style={{ color: '#E74C3C', fontSize: 12 }}>Rejected: {c.rejection_note}</div>}
            </div>
            <span style={{ background: ({ pending: '#F39C12', approved: '#27AE60', rejected: '#E74C3C' }[c.status] || T.accent) + '22', color: ({ pending: '#F39C12', approved: '#27AE60', rejected: '#E74C3C' }[c.status] || T.accent), borderRadius: 6, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
              {c.status}
            </span>
            {isManager && c.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btn('#27AE60', '#fff')} onClick={async () => {
                  try { await attUpdateCorrection(c.id, { status: 'approved' }); toast.success('Approved'); loadCorrections(); }
                  catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
                }}>Approve</button>
                <button style={btn('#E74C3C', '#fff')} onClick={async () => {
                  const note = window.prompt('Rejection reason:') || '';
                  try { await attUpdateCorrection(c.id, { status: 'rejected', rejection_note: note }); toast.success('Rejected'); loadCorrections(); }
                  catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
                }}>Reject</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {corrModal && (
        <Modal title="Request Attendance Correction" onClose={() => setCorrModal(null)} T={T}>
          <CorrForm initial={null} onClose={() => setCorrModal(null)}
            onSave={async (f) => {
              try {
                await attCreateCorrection(f);
                toast.success('Submitted'); setCorrModal(null); loadCorrections();
              } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
            }} />
        </Modal>
      )}
    </div>
  );

  // ── TAB: Reports ──────────────────────────────────────────────────────────
  const renderReports = () => {
    const rows = summary.employees || [];
    const totalWorked = rows.reduce((s, r) => s + Number(r.total_worked_minutes || 0), 0);
    const totalOT     = rows.reduce((s, r) => s + Number(r.total_ot_minutes || 0), 0);
    const totalLate   = rows.reduce((s, r) => s + Number(r.late_days || 0), 0);
    const totalAbsent = rows.reduce((s, r) => s + Number(r.absent_days || 0), 0);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div style={label}>Year</div>
            <input type="number" style={{ ...inp, width: 90 }} value={summaryFilter.year}
              onChange={e => setSummaryFilter(f => ({ ...f, year: e.target.value }))} />
          </div>
          <div>
            <div style={label}>Month</div>
            <select style={{ ...inp, width: 130 }} value={summaryFilter.month}
              onChange={e => setSummaryFilter(f => ({ ...f, month: e.target.value }))}>
              {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
                <option key={i+1} value={i+1}>{m}</option>
              ))}
            </select>
          </div>
          {isManager && (
            <div>
              <div style={label}>Employee</div>
              <select style={{ ...inp, width: 180 }} value={summaryFilter.employee_id}
                onChange={e => setSummaryFilter(f => ({ ...f, employee_id: e.target.value }))}>
                <option value="">All Employees</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
              </select>
            </div>
          )}
          <button style={btn()} onClick={loadSummary}>Load Report</button>
        </div>

        {rows.length > 0 && (
          <>
            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {[
                { label: 'Total Worked', value: fmt(totalWorked), color: '#27AE60' },
                { label: 'Total OT', value: fmt(totalOT), color: T.accent },
                { label: 'Late Days', value: totalLate, color: '#E74C3C' },
                { label: 'Absent Days', value: totalAbsent, color: '#95A5A6' },
              ].map(s => (
                <div key={s.label} style={{ ...card, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: T.textMid, marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Per-employee table */}
            <div style={card}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ color: T.textMid }}>
                      {['Employee', 'Present', 'Absent', 'Late', 'Half Day', 'On Leave', 'Worked', 'OT'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.employee_id} style={{ borderBottom: `1px solid ${T.border}` }}>
                        <td style={{ padding: '8px 10px', color: T.text, fontWeight: 600 }}>{row.full_name}</td>
                        <td style={{ padding: '8px 10px', color: '#27AE60' }}>{row.present_days || 0}</td>
                        <td style={{ padding: '8px 10px', color: '#E74C3C' }}>{row.absent_days || 0}</td>
                        <td style={{ padding: '8px 10px', color: '#F39C12' }}>{row.late_days || 0}</td>
                        <td style={{ padding: '8px 10px', color: T.textMid }}>{row.half_days || 0}</td>
                        <td style={{ padding: '8px 10px', color: '#3498DB' }}>{row.leave_days || 0}</td>
                        <td style={{ padding: '8px 10px', color: T.text }}>{fmt(row.total_worked_minutes)}</td>
                        <td style={{ padding: '8px 10px', color: row.total_ot_minutes > 0 ? T.accent : T.textMid }}>{fmt(row.total_ot_minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        {rows.length === 0 && (
          <div style={{ ...card, color: T.textMid, fontSize: 13 }}>Select a month and click Load Report.</div>
        )}
      </div>
    );
  };

  // ── Manual entry modal ────────────────────────────────────────────────────
  const ManualEntryModal = ({ onClose }) => {
    const [f, setF] = useState({ employee_id: '', log_type: 'clock_in', punched_at: '', attendance_date: todayISO(), notes: '' });
    const h = k => e => setF(p => ({ ...p, [k]: e.target.value }));
    return (
      <Modal title="Manual Log Entry" onClose={onClose} T={T}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {isManager && (
            <div>
              <div style={label}>Employee</div>
              <select style={inp} value={f.employee_id} onChange={h('employee_id')}>
                <option value="">Select…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={label}>Log Type</div>
              <select style={inp} value={f.log_type} onChange={h('log_type')}>
                <option value="clock_in">Clock In</option>
                <option value="clock_out">Clock Out</option>
                <option value="break_start">Break Start</option>
                <option value="break_end">Break End</option>
              </select>
            </div>
            <div>
              <div style={label}>Attendance Date</div>
              <input type="date" style={inp} value={f.attendance_date} onChange={h('attendance_date')} />
            </div>
          </div>
          <div>
            <div style={label}>Punched At</div>
            <input type="datetime-local" style={inp} value={f.punched_at} onChange={h('punched_at')} />
          </div>
          <div>
            <div style={label}>Notes</div>
            <input style={inp} value={f.notes} onChange={h('notes')} placeholder="Reason for manual entry" />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button style={btn(T.surface, T.text)} onClick={onClose}>Cancel</button>
            <button style={btn()} onClick={async () => {
              try {
                await attCreateLog({ ...f, source: 'manual' });
                toast.success('Log added');
                onClose(); loadToday();
              } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
            }}>Save</button>
          </div>
        </div>
      </Modal>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 24, fontFamily: "'Inter',sans-serif", color: T.text, maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: T.text }}>🕐 Attendance</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: T.textMid }}>Time tracking, leaves, overtime & reports</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '10px 18px',
            fontSize: 13, fontWeight: 700, fontFamily: "'Inter',sans-serif",
            color: tab === t ? T.accent : T.textMid,
            borderBottom: tab === t ? `2px solid ${T.accent}` : '2px solid transparent',
            marginBottom: -1, transition: 'color 0.2s',
          }}>{t}</button>
        ))}
      </div>

      {tab === 'Live'        && renderLive()}
      {tab === 'Records'     && renderRecords()}
      {tab === 'Leaves'      && renderLeaves()}
      {tab === 'Holidays'    && renderHolidays()}
      {tab === 'OT Rules'    && renderOTRules()}
      {tab === 'Corrections' && renderCorrections()}
      {tab === 'Reports'     && renderReports()}

      {manualModal && <ManualEntryModal onClose={() => setManualModal(false)} />}
    </div>
  );
}

// ── Shared Modal ──────────────────────────────────────────────────────────────
function Modal({ title, children, onClose, T }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 28, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.text }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: T.textMid }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
