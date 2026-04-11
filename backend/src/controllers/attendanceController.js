// ═══════════════════════════════════════════════════════════════════════════════
// attendanceController.js  — Time & Attendance Module (Premium Add-on)
// ═══════════════════════════════════════════════════════════════════════════════
const db = require('../config/db');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Convert HH:MM string to minutes since midnight */
const timeToMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/** Determine attendance_date for a punch, accounting for night shifts.
 *  Returns a DATE string 'YYYY-MM-DD'. */
async function resolveAttendanceDate(client, restaurantId, employeeId, punchedAt) {
  const now = punchedAt || new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const yesterdayStr = new Date(now - 86400000).toISOString().slice(0, 10);

  // Look for today's and yesterday's shifts
  const shiftRes = await client.query(
    `SELECT * FROM shifts
     WHERE employee_id=$1 AND restaurant_id=$2 AND date IN ($3,$4)
     AND status IN ('scheduled','active')
     ORDER BY date DESC`,
    [employeeId, restaurantId, todayStr, yesterdayStr]
  );

  for (const shift of shiftRes.rows) {
    const startMin = timeToMin(shift.start_time);
    const endMin   = timeToMin(shift.end_time);
    const isNight  = endMin < startMin; // crosses midnight

    const shiftDate = new Date(shift.date + 'T00:00:00Z');
    const shiftStart = new Date(shiftDate.getTime() + startMin * 60000);
    const shiftEnd   = isNight
      ? new Date(shiftDate.getTime() + (24 * 60 + endMin) * 60000)
      : new Date(shiftDate.getTime() + endMin * 60000);

    // Add 2h tolerance on both sides
    if (now >= new Date(shiftStart.getTime() - 7200000) &&
        now <= new Date(shiftEnd.getTime() + 7200000)) {
      return shift.date; // attendance_date = shift's date
    }
  }

  return todayStr; // fallback
}

/** Core computation engine — one employee, one date.
 *  Re-inserts/updates daily_attendance. Must be called inside a transaction. */
async function computeDaily(client, restaurantId, employeeId, dateStr, force = false) {
  // 1. Context
  const [shiftRes, leaveRes, holRes, otRes] = await Promise.all([
    client.query(
      `SELECT * FROM shifts WHERE employee_id=$1 AND restaurant_id=$2 AND date=$3
       AND status IN ('scheduled','active','completed') ORDER BY created_at DESC LIMIT 1`,
      [employeeId, restaurantId, dateStr]
    ),
    client.query(
      `SELECT * FROM leaves WHERE employee_id=$1 AND status='approved'
       AND start_date<=$2 AND end_date>=$2`,
      [employeeId, dateStr]
    ),
    client.query(
      `SELECT * FROM att_holidays WHERE restaurant_id=$1 AND date=$2`,
      [restaurantId, dateStr]
    ),
    client.query(
      `SELECT * FROM overtime_rules WHERE restaurant_id=$1 AND is_default=TRUE LIMIT 1`,
      [restaurantId]
    ),
  ]);

  const shift   = shiftRes.rows[0]   || null;
  const leave   = leaveRes.rows[0]   || null;
  const holiday = holRes.rows[0]     || null;
  const otRule  = otRes.rows[0]      || { daily_regular_hours: 8, ot_multiplier: 1.5,
                                           holiday_multiplier: 2.0, ot_threshold_min: 30,
                                           ot_rounding_min: 15, id: null };

  // 2. Raw logs for this date
  const logs = (await client.query(
    `SELECT * FROM attendance_logs
     WHERE employee_id=$1 AND attendance_date=$2 AND is_voided=FALSE
     ORDER BY punched_at ASC`,
    [employeeId, dateStr]
  )).rows;

  // 3. Status priority: on_leave_holiday > on_leave > holiday > computed
  let status = 'absent';
  let clockInAt = null, clockOutAt = null;
  let workedMin = 0, breakMin = 0, lateMin = 0, earlyExitMin = 0, otMin = 0;
  let scheduledMin = null;

  if (leave && holiday) {
    status = 'on_leave_holiday';
  } else if (leave) {
    status = 'on_leave';
  } else if (holiday && logs.filter(l => l.log_type === 'clock_in').length === 0) {
    status = 'holiday';
  } else {
    // 4. Parse log sessions
    const ins  = logs.filter(l => l.log_type === 'clock_in');
    const outs = logs.filter(l => l.log_type === 'clock_out');
    const brkStarts = logs.filter(l => l.log_type === 'break_start');
    const brkEnds   = logs.filter(l => l.log_type === 'break_end');

    if (ins.length > 0) {
      clockInAt  = new Date(ins[0].punched_at);
      clockOutAt = outs.length > 0 ? new Date(outs[outs.length - 1].punched_at) : null;

      // Accumulate break time
      for (let i = 0; i < brkStarts.length; i++) {
        const bStart = new Date(brkStarts[i].punched_at);
        const bEnd   = brkEnds[i] ? new Date(brkEnds[i].punched_at) : null;
        if (bEnd && bEnd > bStart) {
          breakMin += Math.round((bEnd - bStart) / 60000);
        }
      }

      if (clockOutAt) {
        const gross = Math.round((clockOutAt - clockInAt) / 60000);
        workedMin = Math.max(0, gross - breakMin);
      }

      // 5. Shift-based calculations
      if (shift) {
        const startMin = timeToMin(shift.start_time);
        const endMin   = timeToMin(shift.end_time);
        const isNight  = endMin < startMin;
        const shiftBase = new Date(shift.date + 'T00:00:00Z');
        const schedStart = new Date(shiftBase.getTime() + startMin * 60000);
        const schedEnd   = isNight
          ? new Date(shiftBase.getTime() + (24 * 60 + endMin) * 60000)
          : new Date(shiftBase.getTime() + endMin * 60000);

        scheduledMin = isNight ? (24 * 60 - startMin + endMin) : (endMin - startMin);

        lateMin = Math.max(0, Math.round((clockInAt - schedStart) / 60000));
        if (clockOutAt) {
          earlyExitMin = Math.max(0, Math.round((schedEnd - clockOutAt) / 60000));
        }
      }

      // 6. Status
      if (!clockOutAt) {
        status = 'present'; // still clocked in
      } else if (scheduledMin && workedMin < scheduledMin * 0.5) {
        status = 'half_day';
      } else if (lateMin > 15) {
        status = 'late';
      } else if (holiday) {
        status = 'holiday'; // worked on holiday
      } else {
        status = 'present';
      }

      // 7. OT calculation
      const regularMin = otRule.daily_regular_hours * 60;
      const rawOt = Math.max(0, workedMin - regularMin);
      if (rawOt >= otRule.ot_threshold_min) {
        const rounding = otRule.ot_rounding_min || 1;
        otMin = Math.floor(rawOt / rounding) * rounding;
      }
      // Holiday: all hours are OT-rated in payroll (multiplier), not double-counted here
    }
  }

  // 8. Upsert (skip corrected rows unless forced)
  await client.query(
    `INSERT INTO daily_attendance(
       restaurant_id, employee_id, shift_id, attendance_date,
       clock_in_at, clock_out_at, scheduled_minutes, worked_minutes,
       break_minutes, late_minutes, early_exit_minutes, ot_minutes,
       status, leave_id, holiday_id, ot_rule_id, computed_at
     ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
     ON CONFLICT(employee_id, attendance_date) DO UPDATE SET
       shift_id=$3, clock_in_at=$5, clock_out_at=$6, scheduled_minutes=$7,
       worked_minutes=$8, break_minutes=$9, late_minutes=$10,
       early_exit_minutes=$11, ot_minutes=$12, status=$13,
       leave_id=$14, holiday_id=$15, ot_rule_id=$16, computed_at=NOW(),
       updated_at=NOW()
     WHERE daily_attendance.is_corrected = FALSE OR $17 = TRUE`,
    [
      restaurantId, employeeId, shift?.id || null, dateStr,
      clockInAt, clockOutAt, scheduledMin, workedMin,
      breakMin, lateMin, earlyExitMin, otMin,
      status, leave?.id || null, holiday?.id || null, otRule.id,
      force,
    ]
  );
}

// ── Exported helper — recompute one employee/date (used by other controllers) ─
exports.recomputeEmployee = async (restaurantId, employeeId, dateStr) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await computeDaily(client, restaurantId, employeeId, dateStr, true);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('recomputeEmployee error:', err);
  } finally { client.release(); }
};

// ── Clock-in ───────────────────────────────────────────────────────────────────
exports.clockIn = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const empId = req.body.employee_id || req.user.id;
    const now = new Date();

    // Ensure no open clock_in already
    const open = await client.query(
      `SELECT id FROM attendance_logs
       WHERE employee_id=$1 AND log_type='clock_in' AND is_voided=FALSE
         AND attendance_date=(SELECT MAX(attendance_date) FROM attendance_logs
                              WHERE employee_id=$1 AND log_type='clock_in' AND is_voided=FALSE)
       AND NOT EXISTS (
         SELECT 1 FROM attendance_logs lo2
         WHERE lo2.employee_id=$1 AND lo2.log_type='clock_out' AND lo2.is_voided=FALSE
           AND lo2.punched_at > attendance_logs.punched_at
       ) LIMIT 1`,
      [empId]
    );
    if (open.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Already clocked in. Clock out first.' });
    }

    const attendanceDate = await resolveAttendanceDate(client, rid, empId, now);

    // Find matching shift
    const shiftRes = await client.query(
      `SELECT id FROM shifts WHERE employee_id=$1 AND restaurant_id=$2 AND date=$3
       AND status IN ('scheduled','active') LIMIT 1`,
      [empId, rid, attendanceDate]
    );
    const shiftId = shiftRes.rows[0]?.id || null;

    const log = await client.query(
      `INSERT INTO attendance_logs(restaurant_id, employee_id, shift_id, log_type,
         punched_at, attendance_date, source, latitude, longitude, notes, created_by)
       VALUES($1,$2,$3,'clock_in',$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [rid, empId, shiftId, now, attendanceDate,
       req.body.source || 'web', req.body.latitude || null,
       req.body.longitude || null, req.body.notes || null, req.user.id]
    );

    await computeDaily(client, rid, empId, attendanceDate);
    await client.query('COMMIT');
    res.json({ log: log.rows[0], attendance_date: attendanceDate });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── Clock-out ──────────────────────────────────────────────────────────────────
exports.clockOut = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const empId = req.body.employee_id || req.user.id;
    const now = new Date();

    // Find the last open clock_in
    const openLog = await client.query(
      `SELECT al.* FROM attendance_logs al
       WHERE al.employee_id=$1 AND al.log_type='clock_in' AND al.is_voided=FALSE
         AND NOT EXISTS (
           SELECT 1 FROM attendance_logs co
           WHERE co.employee_id=$1 AND co.log_type='clock_out' AND co.is_voided=FALSE
             AND co.punched_at > al.punched_at
         )
       ORDER BY al.punched_at DESC LIMIT 1`,
      [empId]
    );
    if (!openLog.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Not clocked in.' });
    }

    const attendanceDate = openLog.rows[0].attendance_date;
    const shiftId = openLog.rows[0].shift_id;

    const log = await client.query(
      `INSERT INTO attendance_logs(restaurant_id, employee_id, shift_id, log_type,
         punched_at, attendance_date, source, latitude, longitude, notes, created_by)
       VALUES($1,$2,$3,'clock_out',$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [rid, empId, shiftId, now, attendanceDate,
       req.body.source || 'web', req.body.latitude || null,
       req.body.longitude || null, req.body.notes || null, req.user.id]
    );

    await computeDaily(client, rid, empId, attendanceDate);
    await client.query('COMMIT');
    res.json({ log: log.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── Live status for current user ───────────────────────────────────────────────
exports.getStatus = async (req, res) => {
  try {
    const empId = req.user.id;
    // Last non-voided log
    const last = await db.query(
      `SELECT log_type, punched_at, attendance_date FROM attendance_logs
       WHERE employee_id=$1 AND is_voided=FALSE
       ORDER BY punched_at DESC LIMIT 1`,
      [empId]
    );
    const lastLog = last.rows[0] || null;
    const isClockedIn = lastLog?.log_type === 'clock_in' || lastLog?.log_type === 'break_end';
    const isOnBreak   = lastLog?.log_type === 'break_start';

    // Today's daily_attendance row
    const todayStr = new Date().toISOString().slice(0, 10);
    const daily = await db.query(
      `SELECT * FROM daily_attendance WHERE employee_id=$1 AND attendance_date=$2`,
      [empId, todayStr]
    );

    res.json({
      is_clocked_in: isClockedIn,
      is_on_break: isOnBreak,
      last_log: lastLog,
      today: daily.rows[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get raw logs ───────────────────────────────────────────────────────────────
exports.getLogs = async (req, res) => {
  try {
    const { employee_id, date_from, date_to, log_type } = req.query;
    const rid = req.user.restaurantId;
    const today = new Date().toISOString().slice(0, 10);

    const result = await db.query(
      `SELECT al.*, e.full_name as employee_name, e.avatar_url
       FROM attendance_logs al
       JOIN employees e ON al.employee_id = e.id
       WHERE al.restaurant_id=$1
         AND ($2::uuid IS NULL OR al.employee_id=$2::uuid)
         AND al.attendance_date >= COALESCE($3::date, $6::date)
         AND al.attendance_date <= COALESCE($4::date, $6::date)
         AND ($5::text IS NULL OR al.log_type=$5)
       ORDER BY al.punched_at DESC
       LIMIT 500`,
      [rid, employee_id || null, date_from || null, date_to || null, log_type || null, today]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Manual punch (manager) ─────────────────────────────────────────────────────
exports.createLog = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { employee_id, log_type, punched_at, notes } = req.body;
    const rid = req.user.restaurantId;
    const ts = punched_at ? new Date(punched_at) : new Date();
    const attendanceDate = await resolveAttendanceDate(client, rid, employee_id, ts);

    const log = await client.query(
      `INSERT INTO attendance_logs(restaurant_id, employee_id, log_type, punched_at,
         attendance_date, source, notes, created_by)
       VALUES($1,$2,$3,$4,$5,'manual',$6,$7) RETURNING *`,
      [rid, employee_id, log_type, ts, attendanceDate, notes || null, req.user.id]
    );
    await computeDaily(client, rid, employee_id, attendanceDate);
    await client.query('COMMIT');
    res.status(201).json(log.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── Void a log ─────────────────────────────────────────────────────────────────
exports.voidLog = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const result = await client.query(
      `UPDATE attendance_logs SET is_voided=TRUE, voided_by=$1, voided_at=NOW()
       WHERE id=$2 AND restaurant_id=$3 RETURNING *`,
      [req.user.id, req.params.id, rid]
    );
    if (!result.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Log not found' }); }
    const log = result.rows[0];
    await computeDaily(client, rid, log.employee_id, log.attendance_date);
    await client.query('COMMIT');
    res.json(log);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── Daily attendance grid ─────────────────────────────────────────────────────
exports.getDailyAttendance = async (req, res) => {
  try {
    const { date, date_from, date_to, employee_id, status } = req.query;
    const rid = req.user.restaurantId;
    const today = new Date().toISOString().slice(0, 10);
    const from = date_from || date || today;
    const to   = date_to   || date || today;

    const result = await db.query(
      `SELECT da.*, e.full_name, e.avatar_url, r.name as role_name,
              s.shift_name, s.start_time, s.end_time
       FROM daily_attendance da
       JOIN employees e ON da.employee_id = e.id
       LEFT JOIN roles r ON e.role_id = r.id
       LEFT JOIN shifts s ON da.shift_id = s.id
       WHERE da.restaurant_id=$1
         AND da.attendance_date >= $2 AND da.attendance_date <= $3
         AND ($4::uuid IS NULL OR da.employee_id=$4::uuid)
         AND ($5::text IS NULL OR da.status=$5)
       ORDER BY da.attendance_date DESC, e.full_name`,
      [rid, from, to, employee_id || null, status || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Today's live overview (all employees) ─────────────────────────────────────
exports.getTodayOverview = async (req, res) => {
  try {
    const rid = req.user.restaurantId;
    const today = new Date().toISOString().slice(0, 10);

    // All employees + their today record (LEFT JOIN so absent employees show too)
    const result = await db.query(
      `SELECT e.id, e.full_name, e.avatar_url, r.name as role_name,
              da.status, da.clock_in_at, da.clock_out_at,
              da.worked_minutes, da.late_minutes, da.ot_minutes,
              s.shift_name, s.start_time, s.end_time,
              -- Real-time: check if employee has an open clock-in today (no matching clock-out after it)
              (SELECT al.punched_at FROM attendance_logs al
               WHERE al.employee_id = e.id AND al.log_type = 'clock_in' AND al.is_voided = FALSE
                 AND al.attendance_date = $2
                 AND NOT EXISTS (
                   SELECT 1 FROM attendance_logs co
                   WHERE co.employee_id = e.id AND co.log_type = 'clock_out'
                     AND co.is_voided = FALSE AND co.punched_at > al.punched_at
                 )
               ORDER BY al.punched_at DESC LIMIT 1
              ) AS live_clock_in_at
       FROM employees e
       LEFT JOIN roles r ON e.role_id = r.id
       LEFT JOIN daily_attendance da ON da.employee_id = e.id AND da.attendance_date=$2
       LEFT JOIN shifts s ON da.shift_id = s.id
       WHERE e.restaurant_id=$1 AND e.status='active'
       ORDER BY e.full_name`,
      [rid, today]
    );

    const rows = result.rows.map(r => {
      // If daily_attendance says absent/null but there's a live open clock-in → override to present
      let status = r.status || 'absent';
      const clockInAt = r.clock_in_at || r.live_clock_in_at;
      if (r.live_clock_in_at && status === 'absent') {
        status = 'present';
      }
      return { ...r, status, clock_in_at: clockInAt };
    });
    const summary = {
      total:   rows.length,
      present: rows.filter(r => ['present','late'].includes(r.status)).length,
      absent:  rows.filter(r => r.status === 'absent').length,
      late:    rows.filter(r => r.status === 'late').length,
      on_leave:rows.filter(r => ['on_leave','on_leave_holiday'].includes(r.status)).length,
      holiday: rows.filter(r => r.status === 'holiday').length,
    };

    res.json({ employees: rows, summary, date: today });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Trigger recompute ─────────────────────────────────────────────────────────
exports.recompute = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { date_from, date_to, employee_id } = req.body;
    const rid = req.user.restaurantId;
    const from = date_from || new Date().toISOString().slice(0, 10);
    const to   = date_to   || from;

    const employees = await client.query(
      `SELECT id FROM employees WHERE restaurant_id=$1 AND status='active'
       AND ($2::uuid IS NULL OR id=$2::uuid)`,
      [rid, employee_id || null]
    );

    // Generate date range
    const dates = [];
    const cur = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    for (const emp of employees.rows) {
      for (const d of dates) {
        await computeDaily(client, rid, emp.id, d, true);
      }
    }

    await client.query('COMMIT');
    res.json({ recomputed: employees.rows.length * dates.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── Leaves ────────────────────────────────────────────────────────────────────
exports.getLeaves = async (req, res) => {
  try {
    const { employee_id, status, date_from, date_to } = req.query;
    const rid = req.user.restaurantId;
    const result = await db.query(
      `SELECT l.*, e.full_name as employee_name, e.avatar_url,
              a.full_name as approved_by_name
       FROM leaves l
       JOIN employees e ON l.employee_id = e.id
       LEFT JOIN employees a ON l.approved_by = a.id
       WHERE l.restaurant_id=$1
         AND ($2::uuid IS NULL OR l.employee_id=$2::uuid)
         AND ($3::text IS NULL OR l.status=$3)
         AND ($4::date IS NULL OR l.start_date>=$4::date)
         AND ($5::date IS NULL OR l.end_date<=$5::date)
       ORDER BY l.created_at DESC`,
      [rid, employee_id || null, status || null, date_from || null, date_to || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createLeave = async (req, res) => {
  try {
    const { employee_id, leave_type, start_date, end_date, duration_type, reason } = req.body;
    const rid = req.user.restaurantId;
    const empId = employee_id || req.user.id;

    // Business days count (simple: end - start + 1 days)
    const ms = new Date(end_date) - new Date(start_date);
    const days = Math.floor(ms / 86400000) + 1;

    const result = await db.query(
      `INSERT INTO leaves(restaurant_id, employee_id, leave_type, start_date, end_date,
         duration_type, reason, status)
       VALUES($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING *`,
      [rid, empId, leave_type, start_date, end_date, duration_type || 'full', reason || null]
    );
    res.status(201).json({ ...result.rows[0], days_requested: days });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateLeave = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { status, rejection_note } = req.body;
    const rid = req.user.restaurantId;

    const result = await client.query(
      `UPDATE leaves SET status=$1, approved_by=$2, approved_at=NOW(),
         rejection_note=COALESCE($3, rejection_note), updated_at=NOW()
       WHERE id=$4 AND restaurant_id=$5 RETURNING *`,
      [status, req.user.id, rejection_note || null, req.params.id, rid]
    );
    if (!result.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Leave not found' }); }

    // Recompute affected dates
    const leave = result.rows[0];
    if (['approved','rejected'].includes(status)) {
      const employees = [leave.employee_id];
      const cur = new Date(leave.start_date + 'T00:00:00Z');
      const end = new Date(leave.end_date + 'T00:00:00Z');
      while (cur <= end) {
        await computeDaily(client, rid, leave.employee_id, cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── Holidays ──────────────────────────────────────────────────────────────────
exports.getHolidays = async (req, res) => {
  try {
    const { year } = req.query;
    const rid = req.user.restaurantId;
    const y = year || new Date().getFullYear();
    const result = await db.query(
      `SELECT * FROM att_holidays WHERE restaurant_id=$1
       AND EXTRACT(YEAR FROM date) = $2 ORDER BY date`,
      [rid, y]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createHoliday = async (req, res) => {
  try {
    const { name, date, type, is_paid, notes } = req.body;
    const rid = req.user.restaurantId;
    const result = await db.query(
      `INSERT INTO att_holidays(restaurant_id, name, date, type, is_paid, notes)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [rid, name, date, type || 'full', is_paid !== false, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Holiday already exists for that date' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateHoliday = async (req, res) => {
  try {
    const { name, type, is_paid, notes } = req.body;
    const result = await db.query(
      `UPDATE att_holidays SET name=COALESCE($1,name), type=COALESCE($2,type),
         is_paid=COALESCE($3,is_paid), notes=COALESCE($4,notes)
       WHERE id=$5 AND restaurant_id=$6 RETURNING *`,
      [name || null, type || null, is_paid ?? null, notes || null, req.params.id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Holiday not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteHoliday = async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM att_holidays WHERE id=$1 AND restaurant_id=$2 RETURNING *`,
      [req.params.id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Holiday not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Overtime Rules ────────────────────────────────────────────────────────────
exports.getOTRules = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM overtime_rules WHERE restaurant_id=$1 ORDER BY is_default DESC, name`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createOTRule = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { name, daily_regular_hours, ot_multiplier, holiday_multiplier,
            ot_threshold_min, ot_rounding_min, is_default } = req.body;
    const rid = req.user.restaurantId;

    if (is_default) {
      await client.query(
        `UPDATE overtime_rules SET is_default=FALSE WHERE restaurant_id=$1`, [rid]
      );
    }
    const result = await client.query(
      `INSERT INTO overtime_rules(restaurant_id, name, daily_regular_hours, ot_multiplier,
         holiday_multiplier, ot_threshold_min, ot_rounding_min, is_default)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [rid, name || 'Default', daily_regular_hours || 8, ot_multiplier || 1.5,
       holiday_multiplier || 2.0, ot_threshold_min || 30, ot_rounding_min || 15,
       is_default || false]
    );
    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

exports.updateOTRule = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const { name, daily_regular_hours, ot_multiplier, holiday_multiplier,
            ot_threshold_min, ot_rounding_min, is_default } = req.body;

    if (is_default) {
      await client.query(
        `UPDATE overtime_rules SET is_default=FALSE WHERE restaurant_id=$1 AND id!=$2`,
        [rid, req.params.id]
      );
    }
    const result = await client.query(
      `UPDATE overtime_rules SET
         name=COALESCE($1,name), daily_regular_hours=COALESCE($2,daily_regular_hours),
         ot_multiplier=COALESCE($3,ot_multiplier), holiday_multiplier=COALESCE($4,holiday_multiplier),
         ot_threshold_min=COALESCE($5,ot_threshold_min), ot_rounding_min=COALESCE($6,ot_rounding_min),
         is_default=COALESCE($7,is_default), updated_at=NOW()
       WHERE id=$8 AND restaurant_id=$9 RETURNING *`,
      [name||null, daily_regular_hours||null, ot_multiplier||null, holiday_multiplier||null,
       ot_threshold_min||null, ot_rounding_min||null, is_default ?? null,
       req.params.id, rid]
    );
    if (!result.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Rule not found' }); }
    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── Corrections ───────────────────────────────────────────────────────────────
exports.getCorrections = async (req, res) => {
  try {
    const { status, employee_id } = req.query;
    const result = await db.query(
      `SELECT ac.*, e.full_name as employee_name, a.full_name as approved_by_name
       FROM attendance_corrections ac
       JOIN employees e ON ac.employee_id = e.id
       LEFT JOIN employees a ON ac.approved_by = a.id
       WHERE ac.restaurant_id=$1
         AND ($2::text IS NULL OR ac.status=$2)
         AND ($3::uuid IS NULL OR ac.employee_id=$3::uuid)
       ORDER BY ac.created_at DESC`,
      [req.user.restaurantId, status || null, employee_id || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createCorrection = async (req, res) => {
  try {
    const { attendance_date, corrected_clock_in, corrected_clock_out, reason } = req.body;
    const rid = req.user.restaurantId;
    const empId = req.body.employee_id || req.user.id;

    // Get current daily record
    const daily = await db.query(
      `SELECT * FROM daily_attendance WHERE employee_id=$1 AND attendance_date=$2`,
      [empId, attendance_date]
    );
    const d = daily.rows[0];

    const result = await db.query(
      `INSERT INTO attendance_corrections(restaurant_id, daily_attendance_id, employee_id,
         requested_by, attendance_date, original_clock_in, original_clock_out,
         corrected_clock_in, corrected_clock_out, original_status, reason)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [rid, d?.id || null, empId, req.user.id, attendance_date,
       d?.clock_in_at || null, d?.clock_out_at || null,
       corrected_clock_in || null, corrected_clock_out || null,
       d?.status || null, reason]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateCorrection = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { status, rejection_note } = req.body;
    const rid = req.user.restaurantId;

    const corr = await client.query(
      `UPDATE attendance_corrections SET status=$1, approved_by=$2, approved_at=NOW(),
         rejection_note=COALESCE($3, rejection_note), updated_at=NOW()
       WHERE id=$4 AND restaurant_id=$5 RETURNING *`,
      [status, req.user.id, rejection_note || null, req.params.id, rid]
    );
    if (!corr.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Correction not found' }); }

    if (status === 'approved') {
      const c = corr.rows[0];
      // Apply correction: insert/update logs
      if (c.corrected_clock_in) {
        await client.query(
          `INSERT INTO attendance_logs(restaurant_id, employee_id, log_type, punched_at,
             attendance_date, source, notes, created_by)
           VALUES($1,$2,'clock_in',$3,$4,'manual','Correction approved',$5)
           ON CONFLICT DO NOTHING`,
          [rid, c.employee_id, c.corrected_clock_in, c.attendance_date, req.user.id]
        );
      }
      if (c.corrected_clock_out) {
        await client.query(
          `INSERT INTO attendance_logs(restaurant_id, employee_id, log_type, punched_at,
             attendance_date, source, notes, created_by)
           VALUES($1,$2,'clock_out',$3,$4,'manual','Correction approved',$5)
           ON CONFLICT DO NOTHING`,
          [rid, c.employee_id, c.corrected_clock_out, c.attendance_date, req.user.id]
        );
      }
      await computeDaily(client, rid, c.employee_id, c.attendance_date, true);

      // Mark the daily row as corrected
      await client.query(
        `UPDATE daily_attendance SET is_corrected=TRUE WHERE employee_id=$1 AND attendance_date=$2`,
        [c.employee_id, c.attendance_date]
      );
    }

    await client.query('COMMIT');
    res.json(corr.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── Monthly Summary Report ────────────────────────────────────────────────────
exports.getMonthlySummary = async (req, res) => {
  try {
    const { date_from, date_to, employee_id } = req.query;
    const rid = req.user.restaurantId;
    const today = new Date().toISOString().slice(0, 10);
    const from = date_from || today.slice(0, 8) + '01';
    const to   = date_to   || today;

    const result = await db.query(
      `SELECT e.id, e.full_name, e.salary, r.name as role_name,
              COUNT(da.id) FILTER (WHERE da.status IN ('present','late')) AS present_days,
              COUNT(da.id) FILTER (WHERE da.status = 'absent')            AS absent_days,
              COUNT(da.id) FILTER (WHERE da.status = 'late')              AS late_days,
              COUNT(da.id) FILTER (WHERE da.status IN ('on_leave','on_leave_holiday')) AS leave_days,
              COUNT(da.id) FILTER (WHERE da.status = 'holiday')           AS holiday_days,
              COALESCE(SUM(da.worked_minutes),0)   AS total_worked_minutes,
              COALESCE(SUM(da.ot_minutes),0)       AS total_ot_minutes,
              COALESCE(SUM(da.late_minutes),0)     AS total_late_minutes
       FROM employees e
       LEFT JOIN roles r ON e.role_id = r.id
       LEFT JOIN daily_attendance da ON da.employee_id = e.id
         AND da.attendance_date >= $2 AND da.attendance_date <= $3
         AND da.restaurant_id = $1
       WHERE e.restaurant_id=$1 AND e.status='active'
         AND ($4::uuid IS NULL OR e.id=$4::uuid)
       GROUP BY e.id, e.full_name, e.salary, r.name
       ORDER BY e.full_name`,
      [rid, from, to, employee_id || null]
    );

    // Add payroll calculations
    const rows = result.rows.map(r => {
      const workedHours  = (r.total_worked_minutes || 0) / 60;
      const otHours      = (r.total_ot_minutes || 0) / 60;
      const dailySalary  = r.salary ? r.salary / 30 : 0;
      const regularPay   = dailySalary * Number(r.present_days || 0);
      const otPay        = r.salary ? (r.salary / (30 * 8)) * otHours * 1.5 : 0;
      return {
        ...r,
        worked_hours: Math.round(workedHours * 10) / 10,
        ot_hours: Math.round(otHours * 10) / 10,
        regular_pay: Math.round(regularPay),
        ot_pay: Math.round(otPay),
        total_pay: Math.round(regularPay + otPay),
      };
    });

    res.json({ from, to, employees: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
