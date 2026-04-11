import React, { useState, useEffect, useCallback } from 'react';
import { getMyShifts, startMyShift, continueMyShift, closeMyShift } from '../../services/api';
import { Card, Badge, Spinner, Btn, T, useT } from '../shared/UI';
import toast from 'react-hot-toast';

const STATUS_COLOR = {
  scheduled:  '#6B7280',
  active:     null, // will use T.green
  in_process: null, // will use T.accent
  completed:  null, // will use T.blue
  absent:     null, // will use T.red
};

const STATUS_LABEL = {
  scheduled:  'Scheduled',
  active:     'Active',
  in_process: 'In Progress',
  completed:  'Completed',
  absent:     'Absent',
};

function ShiftCard({ shift, acting, onStart, onContinue, onClose, isToday }) {
  const color = shift.status === 'active' ? T.green
    : shift.status === 'in_process' ? T.accent
    : shift.status === 'completed' ? T.blue
    : shift.status === 'absent' ? T.red
    : T.textMid;

  const now = new Date().toTimeString().slice(0, 5);
  const shiftEnded = isToday && now > (shift.end_time?.slice(0, 5) || '23:59');

  return (
    <Card style={{ marginBottom: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      {/* Date block */}
      <div style={{ minWidth: 52, textAlign: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: 'monospace', lineHeight: 1 }}>
          {new Date(shift.date + 'T00:00:00').getDate()}
        </div>
        <div style={{ fontSize: 10, color: T.textMid, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {new Date(shift.date + 'T00:00:00').toLocaleDateString('en', { month: 'short' })}
        </div>
      </div>

      <div style={{ width: 1, height: 36, background: T.border, flexShrink: 0 }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
          #{shift.shift_number} · {shift.shift_name}
        </div>
        <div style={{ fontSize: 12, color: T.textMid, marginTop: 2 }}>
          {shift.start_time?.slice(0, 5)} – {shift.end_time?.slice(0, 5)}
          {shift.status === 'in_process' && (
            <span style={{ marginLeft: 8, color: T.accent, fontWeight: 700, fontSize: 11 }}>OVERTIME</span>
          )}
        </div>
        {shift.notes && (
          <div style={{ fontSize: 11, color: T.textDim, marginTop: 2 }}>{shift.notes}</div>
        )}
      </div>

      {/* Status */}
      <Badge color={color}>{STATUS_LABEL[shift.status] || shift.status}</Badge>

      {/* Actions — only for today's non-completed shifts */}
      {isToday && shift.status !== 'completed' && shift.status !== 'absent' && (
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {shift.status === 'scheduled' && (
            <Btn size="sm" disabled={acting}
              style={{ background: T.green, color: '#fff', border: 'none' }}
              onClick={() => onStart(shift.id)}>
              ▶ Start Shift
            </Btn>
          )}
          {shift.status === 'active' && shiftEnded && (
            <>
              <Btn size="sm" disabled={acting}
                style={{ background: T.accent, color: '#000', border: 'none' }}
                onClick={() => onContinue(shift.id)}>
                ⏩ Continue
              </Btn>
              <Btn size="sm" disabled={acting}
                style={{ background: T.red, color: '#fff', border: 'none' }}
                onClick={() => onClose(shift.id)}>
                ⏹ Close
              </Btn>
            </>
          )}
          {shift.status === 'active' && !shiftEnded && (
            <Btn size="sm" disabled={acting}
              style={{ background: T.red, color: '#fff', border: 'none' }}
              onClick={() => onClose(shift.id)}>
              ⏹ Close Shift
            </Btn>
          )}
          {shift.status === 'in_process' && (
            <Btn size="sm" disabled={acting}
              style={{ background: T.red, color: '#fff', border: 'none' }}
              onClick={() => onClose(shift.id)}>
              ⏹ Close Shift
            </Btn>
          )}
        </div>
      )}
    </Card>
  );
}

export default function MyShift() {
  useT();
  const [shifts,  setShifts]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(false);

  const load = useCallback(() => {
    getMyShifts()
      .then(r => setShifts(r.data))
      .catch(() => toast.error('Failed to load shifts'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleStart = async (id) => {
    setActing(true);
    try { await startMyShift(id); toast.success('Shift started!'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to start shift'); }
    finally { setActing(false); }
  };

  const handleContinue = async (id) => {
    setActing(true);
    try { await continueMyShift(id); toast.success('Continuing in overtime'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setActing(false); }
  };

  const handleClose = async (id) => {
    setActing(true);
    try { await closeMyShift(id); toast.success('Shift closed'); load(); }
    catch (e) { toast.error(e.response?.data?.error || 'Failed to close shift'); }
    finally { setActing(false); }
  };

  if (loading) return <Spinner />;

  const today = new Date().toISOString().slice(0, 10);
  const todayShifts = shifts.filter(s => s.date === today);
  const history     = shifts.filter(s => s.date !== today);

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>My Shifts</h1>
      <p style={{ color: T.textMid, fontSize: 13, marginBottom: 24 }}>
        Manage your work shifts and view history
      </p>

      {/* Today */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: T.textMid, fontWeight: 700, marginBottom: 12 }}>
          Today
        </div>
        {todayShifts.length === 0 ? (
          <Card style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
            <div style={{ color: T.textMid, fontSize: 14 }}>No shift scheduled for today</div>
            <div style={{ color: T.textDim, fontSize: 12, marginTop: 6 }}>Contact your manager to schedule a shift</div>
          </Card>
        ) : (
          todayShifts.map(s => (
            <ShiftCard key={s.id} shift={s} acting={acting}
              onStart={handleStart} onContinue={handleContinue} onClose={handleClose} isToday />
          ))
        )}
      </div>

      {/* History */}
      <div>
        <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: T.textMid, fontWeight: 700, marginBottom: 12 }}>
          Shift History
        </div>
        {history.length === 0 ? (
          <div style={{ color: T.textDim, fontSize: 13, padding: '16px 0' }}>No previous shifts found</div>
        ) : (
          history.map(s => (
            <ShiftCard key={s.id} shift={s} acting={acting}
              onStart={handleStart} onContinue={handleContinue} onClose={handleClose} isToday={false} />
          ))
        )}
      </div>
    </div>
  );
}
