const db = require('../config/db');

// GET /api/orders?status=pending  OR  ?status=pending,preparing,ready
exports.getOrders = async (req, res) => {
  try {
    const { restaurantId, id: userId, permissions = [] } = req.user;
    const isManager = permissions.includes('settings');
    const { status, order_type, date } = req.query;

    let where = ['o.restaurant_id = $1'];
    const params = [restaurantId];
    let idx = 2;

    // Non-managers only see their own orders
    if (!isManager) {
      where.push(`o.employee_id = $${idx++}`);
      params.push(userId);
    }

    if (status) {
      // Support comma-separated values e.g. "pending,preparing,ready"
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        where.push(`o.status = $${idx++}`);
        params.push(statuses[0]);
      } else {
        where.push(`o.status = ANY($${idx++}::text[])`);
        params.push(statuses);
      }
    }
    if (order_type) { where.push(`o.order_type = $${idx++}`); params.push(order_type); }
    if (date) { where.push(`DATE(o.created_at) = $${idx++}`); params.push(date); }

    const result = await db.query(
      `SELECT o.*,
              dt.label as table_label,
              e.full_name as server_name,
              s.shift_number, s.shift_name,
              s.start_time as shift_start, s.end_time as shift_end,
              json_agg(json_build_object(
                'id', oi.id, 'name', oi.name, 'quantity', oi.quantity,
                'unit_price', oi.unit_price, 'total_price', oi.total_price,
                'status', oi.status, 'notes', oi.notes
              ) ORDER BY oi.created_at) as items
       FROM orders o
       LEFT JOIN dining_tables dt ON o.table_id = dt.id
       LEFT JOIN employees e ON o.employee_id = e.id
       LEFT JOIN shifts s ON o.shift_id = s.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE ${where.join(' AND ')}
       GROUP BY o.id, dt.label, e.full_name, s.shift_number, s.shift_name, s.start_time, s.end_time
       ORDER BY o.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// POST /api/orders
exports.createOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: employeeId } = req.user;
    const { table_id, order_type = 'dine_in', items, guest_count = 1,
      customer_name, customer_phone, customer_address, customer_lat, customer_lng,
      rider_id, notes, source = 'pos', discount_amount } = req.body;

    if (!items || !items.length) return res.status(400).json({ error: 'Items required' });

    // ── Shift + Attendance validation (all POS users, no exceptions) ───────────
    let shiftId = null;
    if (source === 'pos') {
      const today   = new Date().toISOString().slice(0, 10);
      const nowTime = new Date().toTimeString().slice(0, 5);

      // Find any active or in_process shift for today (employee may have multiple)
      const shiftRes = await client.query(
        `SELECT id, shift_number, shift_name, start_time, end_time, status
         FROM shifts WHERE restaurant_id=$1 AND employee_id=$2 AND date=$3
           AND status IN ('active','in_process')
         ORDER BY status DESC, start_time LIMIT 1`,
        [restaurantId, employeeId, today]
      );

      if (!shiftRes.rows.length) {
        // Check why — give specific message
        const anyRes = await client.query(
          `SELECT status, start_time, end_time FROM shifts
           WHERE restaurant_id=$1 AND employee_id=$2 AND date=$3
           ORDER BY start_time`,
          [restaurantId, employeeId, today]
        );
        if (!anyRes.rows.length) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'No shift scheduled for you today. Contact your manager.' });
        }
        const scheduledNow = anyRes.rows.find(s => s.status === 'scheduled' && nowTime >= s.start_time.slice(0,5) && nowTime <= s.end_time.slice(0,5));
        if (scheduledNow) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Please start your shift before placing orders.' });
        }
        const allAbsent = anyRes.rows.every(s => s.status === 'absent');
        if (allAbsent) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'You are marked absent. Cannot place orders.' });
        }
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'No active shift right now. Start a scheduled shift or contact your manager.' });
      }

      const shift = shiftRes.rows[0];

      // ── Attendance clock-in check ──────────────────────────────────────────
      const attendRes = await client.query(
        `SELECT log_type FROM attendance_logs
         WHERE restaurant_id=$1 AND employee_id=$2
           AND punched_at >= NOW() - INTERVAL '36 hours'
         ORDER BY punched_at DESC LIMIT 1`,
        [restaurantId, employeeId]
      );
      const lastPunch = attendRes.rows[0];
      if (!lastPunch || lastPunch.log_type !== 'clock_in') {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: 'You must be clocked in to place orders.' });
      }

      shiftId = shift.id;
    }

    // Generate order number
    const count = await client.query(
      `SELECT COUNT(*) FROM orders WHERE restaurant_id = $1`, [restaurantId]
    );
    const orderNumber = `ORD-${String(parseInt(count.rows[0].count) + 1001).padStart(4, '0')}`;

    const subtotal   = items.reduce((s, i) => s + (i.unit_price * i.quantity), 0);
    const discAmt    = Math.min(parseFloat(discount_amount) || 0, subtotal);
    const taxAmount  = Math.round((subtotal - discAmt) * 0.08 * 100) / 100;
    const totalAmount = subtotal - discAmt + taxAmount;

    const deliveryAddress = customer_address
      ? JSON.stringify({ address: customer_address })
      : null;

    const orderRes = await client.query(
      `INSERT INTO orders(restaurant_id, table_id, employee_id, shift_id, order_number, order_type,
                          status, source, guest_count, subtotal, discount_amount, tax_amount, total_amount,
                          customer_name, customer_phone, customer_lat, customer_lng,
                          delivery_address, rider_id, notes)
       VALUES($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [restaurantId, table_id || null, employeeId, shiftId, orderNumber, order_type, source,
        guest_count, subtotal, discAmt, taxAmount, totalAmount,
        customer_name || null, customer_phone || null,
        customer_lat || null, customer_lng || null,
        deliveryAddress, rider_id || null, notes || null]
    );
    const order = orderRes.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items(order_id, menu_item_id, name, quantity, unit_price, total_price, notes)
         VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, item.menu_item_id || null, item.name, item.quantity,
        item.unit_price, item.unit_price * item.quantity, item.notes || null]
      );
    }

    if (table_id) {
      await client.query(`UPDATE dining_tables SET status='occupied' WHERE id=$1`, [table_id]);
    }

    await client.query('COMMIT');

    // Broadcast to all sockets in this restaurant room
    const io = req.app.get('io');
    if (io) {
      io.to(restaurantId).emit('new_order', { orderId: order.id, orderNumber });
    }

    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// PATCH /api/orders/:id/status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { id } = req.params;
    const { status, payment_method } = req.body;

    const valid = ['pending', 'confirmed', 'preparing', 'ready', 'served', 'paid', 'cancelled'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    // Resolve payment_status in JS to avoid PostgreSQL parameter type ambiguity
    const newPaymentStatus = status === 'paid' ? 'paid' : null;

    const result = await db.query(
      `UPDATE orders
       SET status         = $1,
           preparing_at   = CASE WHEN $1::text='preparing' AND preparing_at IS NULL THEN NOW() ELSE preparing_at END,
           ready_at       = CASE WHEN $1::text='ready'     AND ready_at     IS NULL THEN NOW() ELSE ready_at     END,
           served_at      = CASE WHEN $1::text='served'    AND served_at    IS NULL THEN NOW() ELSE served_at    END,
           payment_status = COALESCE($4::text, payment_status),
           payment_method = COALESCE($5::text, payment_method)
       WHERE id = $2 AND restaurant_id = $3
       RETURNING *`,
      [status, id, restaurantId, newPaymentStatus, (status === 'paid' && payment_method) ? payment_method : null]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });

    if (status === 'ready') {
      await db.query(
        `INSERT INTO notifications(restaurant_id, type, title, message, severity, reference_id, reference_type)
         VALUES($1,'order_ready','✅ Order Ready',
                'Order ' || $2 || ' is ready for service.','info',$3,'order')`,
        [restaurantId, result.rows[0].order_number, id]
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.to(restaurantId).emit('order_updated', { orderId: id, status, tableId: result.rows[0].table_id });

      // Notify riders when a delivery order is ready for pickup
      if (status === 'ready' && result.rows[0].order_type === 'delivery') {
        io.to(restaurantId).emit('delivery_order_ready', {
          orderId: id,
          orderNumber: result.rows[0].order_number,
          assignedRiderId: result.rows[0].rider_id || null,
        });
      }
    }

    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// GET /api/reports/performance
exports.getPerformanceMatrix = async (req, res) => {
  try {
    const { restaurantId, id: userId, permissions = [] } = req.user;
    const isManager = permissions.includes('settings');
    const empFilter = isManager ? '' : `AND employee_id='${userId}'`;
    const from = req.query.from || new Date().toISOString().slice(0, 10);
    const to = req.query.to || from;

    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('served','paid'))                                         AS total_completed,
         ROUND(AVG(EXTRACT(EPOCH FROM (preparing_at - created_at)) / 60)
               FILTER (WHERE preparing_at IS NOT NULL))                                              AS avg_pending_min,
         ROUND(AVG(EXTRACT(EPOCH FROM (ready_at - preparing_at)) / 60)
               FILTER (WHERE ready_at IS NOT NULL AND preparing_at IS NOT NULL))                     AS avg_cooking_min,
         ROUND(AVG(EXTRACT(EPOCH FROM (served_at - ready_at)) / 60)
               FILTER (WHERE served_at IS NOT NULL AND ready_at IS NOT NULL))                        AS avg_delivery_min,
         ROUND(AVG(EXTRACT(EPOCH FROM (updated_at - served_at)) / 60)
               FILTER (WHERE status='paid' AND served_at IS NOT NULL))                               AS avg_billing_min,
         ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(served_at, updated_at) - created_at)) / 60)
               FILTER (WHERE status IN ('served','paid')))                                           AS avg_total_min,
         -- By date for trend
         json_agg(json_build_object(
           'date',       DATE(created_at),
           'orders',     day_count,
           'avg_total',  ROUND(day_avg)
         ) ORDER BY DATE(created_at)) AS daily_trend
       FROM orders,
            LATERAL (
              SELECT COUNT(*) as day_count,
                     AVG(EXTRACT(EPOCH FROM (COALESCE(served_at, updated_at) - created_at))/60) as day_avg
              FROM orders o2
              WHERE o2.restaurant_id=$1
                AND DATE(o2.created_at) = DATE(orders.created_at)
                AND o2.status IN ('served','paid')
            ) day_stats
       WHERE restaurant_id=$1
         AND DATE(created_at) BETWEEN $2 AND $3 ${empFilter}`,
      [restaurantId, from, to]
    );

    // daily trend — de-duplicate since the lateral join multiplied rows
    const row = result.rows[0] || {};
    // Get clean daily trend separately
    const trend = await db.query(
      `SELECT DATE(created_at) as date,
              COUNT(*) as orders,
              ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(served_at, updated_at) - created_at))/60)) as avg_total_min
       FROM orders
       WHERE restaurant_id=$1 AND DATE(created_at) BETWEEN $2 AND $3
         AND status IN ('served','paid') ${empFilter}
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at)`,
      [restaurantId, from, to]
    );

    res.json({
      total_completed: parseInt(row.total_completed) || 0,
      avg_pending_min: parseFloat(row.avg_pending_min) || null,
      avg_cooking_min: parseFloat(row.avg_cooking_min) || null,
      avg_delivery_min: parseFloat(row.avg_delivery_min) || null,
      avg_billing_min: parseFloat(row.avg_billing_min) || null,
      avg_total_min: parseFloat(row.avg_total_min) || null,
      daily_trend: trend.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// GET /api/dashboard/stats
exports.getDashboardStats = async (req, res) => {
  try {
    const { restaurantId, id: userId, permissions = [] } = req.user;
    const isManager = permissions.includes('settings');
    const today = new Date().toISOString().slice(0, 10);

    const empFilter = isManager ? '' : `AND employee_id='${userId}'`;

    const [revenue, orders, tables, alerts] = await Promise.all([
      db.query(
        `SELECT COALESCE(SUM(total_amount),0) as total, COUNT(*) as count
         FROM orders WHERE restaurant_id=$1 AND DATE(created_at)=$2 AND payment_status='paid' ${empFilter}`,
        [restaurantId, today]
      ),
      db.query(
        `SELECT status, COUNT(*) as count FROM orders
         WHERE restaurant_id=$1 AND DATE(created_at)=$2 ${empFilter} GROUP BY status`,
        [restaurantId, today]
      ),
      db.query(
        `SELECT status, COUNT(*) as count FROM dining_tables
         WHERE restaurant_id=$1 GROUP BY status`,
        [restaurantId]
      ),
      db.query(
        `SELECT COUNT(*) as count FROM notifications
         WHERE restaurant_id=$1 AND is_read=FALSE`,
        [restaurantId]
      ),
    ]);

    res.json({
      revenue: { total: parseFloat(revenue.rows[0].total), orderCount: parseInt(revenue.rows[0].count) },
      orders: orders.rows,
      tables: tables.rows,
      unreadAlerts: parseInt(alerts.rows[0].count),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ─────────────────────────────────────────────────────────────────────────────
// REPORTS API
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/reports/sales  — daily/weekly/monthly sales breakdown
exports.getSalesReport = async (req, res) => {
  try {
    const { restaurantId, id: userId, permissions = [] } = req.user;
    const isManager = permissions.includes('settings');
    const empFilter = isManager ? '' : `AND employee_id='${userId}'`;
    const { period = 'daily', from, to, group_by = 'day' } = req.query;

    // Determine date range
    let dateFrom, dateTo;
    const now = new Date();
    if (from && to) {
      dateFrom = from; dateTo = to;
    } else if (period === 'daily') {
      dateFrom = dateTo = now.toISOString().slice(0, 10);
    } else if (period === 'weekly') {
      const d = new Date(now); d.setDate(d.getDate() - 6);
      dateFrom = d.toISOString().slice(0, 10);
      dateTo = now.toISOString().slice(0, 10);
    } else if (period === 'monthly') {
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      dateTo = now.toISOString().slice(0, 10);
    } else if (period === 'yearly') {
      dateFrom = `${now.getFullYear()}-01-01`;
      dateTo = now.toISOString().slice(0, 10);
    }

    const [summary, byPeriod, byType, byHour, topItems, byPayment] = await Promise.all([
      // Overall summary
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('cancelled'))          AS total_orders,
          COUNT(*) FILTER (WHERE payment_status='paid')                AS paid_orders,
          COUNT(*) FILTER (WHERE status='cancelled')                   AS cancelled_orders,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_status='paid'), 0)    AS total_revenue,
          COALESCE(SUM(subtotal)    FILTER (WHERE payment_status='paid'), 0)     AS total_subtotal,
          COALESCE(SUM(tax_amount)  FILTER (WHERE payment_status='paid'), 0)     AS total_tax,
          COALESCE(SUM(discount_amount) FILTER (WHERE payment_status='paid'), 0) AS total_discount,
          COALESCE(AVG(total_amount) FILTER (WHERE payment_status='paid'), 0)    AS avg_order_value,
          COALESCE(SUM(guest_count) FILTER (WHERE payment_status='paid'), 0)     AS total_guests
        FROM orders
        WHERE restaurant_id=$1 AND DATE(created_at) BETWEEN $2 AND $3 ${empFilter}`,
        [restaurantId, dateFrom, dateTo]
      ),
      // Revenue by day/week
      db.query(`
        SELECT
          DATE(created_at)::text            AS period,
          COUNT(*) FILTER (WHERE payment_status='paid')             AS orders,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_status='paid'), 0) AS revenue,
          COALESCE(AVG(total_amount) FILTER (WHERE payment_status='paid'), 0) AS avg_value
        FROM orders
        WHERE restaurant_id=$1 AND DATE(created_at) BETWEEN $2 AND $3 ${empFilter}
        GROUP BY DATE(created_at) ORDER BY DATE(created_at)`,
        [restaurantId, dateFrom, dateTo]
      ),
      // By order type
      db.query(`
        SELECT order_type,
          COUNT(*) FILTER (WHERE payment_status='paid') AS orders,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_status='paid'),0) AS revenue
        FROM orders
        WHERE restaurant_id=$1 AND DATE(created_at) BETWEEN $2 AND $3
          AND payment_status='paid' ${empFilter}
        GROUP BY order_type ORDER BY revenue DESC`,
        [restaurantId, dateFrom, dateTo]
      ),
      // By hour of day
      db.query(`
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour,
          COUNT(*) AS orders,
          COALESCE(SUM(total_amount) FILTER (WHERE payment_status='paid'),0) AS revenue
        FROM orders
        WHERE restaurant_id=$1 AND DATE(created_at) BETWEEN $2 AND $3 ${empFilter}
        GROUP BY hour ORDER BY hour`,
        [restaurantId, dateFrom, dateTo]
      ),
      // Top selling items
      db.query(`
        SELECT oi.name, oi.menu_item_id,
          SUM(oi.quantity)              AS qty_sold,
          SUM(oi.total_price)           AS total_revenue,
          AVG(oi.unit_price)            AS avg_price,
          mi.category_id,
          c.name                        AS category_name
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        LEFT JOIN categories c  ON mi.category_id = c.id
        WHERE o.restaurant_id=$1 AND DATE(o.created_at) BETWEEN $2 AND $3
          AND o.status NOT IN ('cancelled') ${empFilter.replace('employee_id', 'o.employee_id')}
        GROUP BY oi.name, oi.menu_item_id, mi.category_id, c.name
        ORDER BY qty_sold DESC LIMIT 15`,
        [restaurantId, dateFrom, dateTo]
      ),
      // By payment method
      db.query(`
        SELECT COALESCE(payment_method,'Unknown') AS method,
          COUNT(*) AS orders,
          COALESCE(SUM(total_amount),0) AS revenue
        FROM orders
        WHERE restaurant_id=$1 AND DATE(created_at) BETWEEN $2 AND $3
          AND payment_status='paid' ${empFilter}
        GROUP BY payment_method ORDER BY revenue DESC`,
        [restaurantId, dateFrom, dateTo]
      ),
    ]);

    res.json({
      period, dateFrom, dateTo,
      summary: summary.rows[0],
      byPeriod: byPeriod.rows,
      byType: byType.rows,
      byHour: byHour.rows,
      topItems: topItems.rows,
      byPayment: byPayment.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// GET /api/reports/employees  — employee performance
exports.getEmployeeReport = async (req, res) => {
  try {
    const { restaurantId, id: userId, permissions = [] } = req.user;
    const isManager = permissions.includes('settings');
    const { from, to, employee_id } = req.query;
    const now = new Date();
    const dateFrom = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const dateTo = to || now.toISOString().slice(0, 10);

    // Non-managers are locked to their own data; managers can filter by employee_id or see all
    const resolvedEmpId = isManager ? (employee_id || null) : userId;
    const empWhere = resolvedEmpId ? `AND e.id='${resolvedEmpId}'::uuid` : '';

    const [performance, shiftStats, topSellers] = await Promise.all([
      // Per-employee order performance
      db.query(`
        SELECT
          e.id, e.full_name, e.email, r.name AS role_name,
          COUNT(o.id)                                                    AS total_orders,
          COUNT(o.id) FILTER (WHERE o.payment_status='paid')             AS paid_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.payment_status='paid'), 0) AS total_revenue,
          COALESCE(AVG(o.total_amount) FILTER (WHERE o.payment_status='paid'), 0) AS avg_order_value,
          COALESCE(SUM(o.guest_count)  FILTER (WHERE o.payment_status='paid'), 0) AS total_guests,
          COUNT(o.id) FILTER (WHERE o.status='cancelled')                AS cancelled_orders
        FROM employees e
        LEFT JOIN roles r ON e.role_id = r.id
        LEFT JOIN orders o ON o.employee_id = e.id
          AND DATE(o.created_at) BETWEEN $2 AND $3
        WHERE e.restaurant_id=$1 ${empWhere}
        GROUP BY e.id, e.full_name, e.email, r.name
        ORDER BY total_revenue DESC`,
        [restaurantId, dateFrom, dateTo]
      ),
      // Shift attendance stats
      db.query(`
        SELECT
          e.id, e.full_name,
          COUNT(s.id)                                           AS total_shifts,
          COUNT(s.id) FILTER (WHERE s.status='completed')      AS completed_shifts,
          COUNT(s.id) FILTER (WHERE s.status='absent')         AS absent_shifts,
          COUNT(s.id) FILTER (WHERE s.status='scheduled')      AS scheduled_shifts,
          ROUND(
            COUNT(s.id) FILTER (WHERE s.status='completed')::numeric /
            NULLIF(COUNT(s.id) FILTER (WHERE s.status IN ('completed','absent')), 0) * 100
          , 1) AS attendance_pct
        FROM employees e
        LEFT JOIN shifts s ON s.employee_id = e.id
          AND s.date BETWEEN $2 AND $3
        WHERE e.restaurant_id=$1 ${empWhere}
        GROUP BY e.id, e.full_name
        ORDER BY attendance_pct DESC NULLS LAST`,
        [restaurantId, dateFrom, dateTo]
      ),
      // Top selling employees (by items sold)
      db.query(`
        SELECT e.id, e.full_name,
          COUNT(oi.id)        AS items_sold,
          SUM(oi.quantity)    AS qty_sold,
          SUM(oi.total_price) AS items_revenue
        FROM employees e
        JOIN orders o ON o.employee_id = e.id AND DATE(o.created_at) BETWEEN $2 AND $3
        JOIN order_items oi ON oi.order_id = o.id
        WHERE e.restaurant_id=$1 AND o.status NOT IN ('cancelled') ${empWhere}
        GROUP BY e.id, e.full_name
        ORDER BY items_revenue DESC`,
        [restaurantId, dateFrom, dateTo]
      ),
    ]);

    // Merge all employee data
    const empMap = {};
    performance.rows.forEach(r => { empMap[r.id] = { ...r }; });
    shiftStats.rows.forEach(r => {
      if (empMap[r.id]) Object.assign(empMap[r.id], {
        total_shifts: r.total_shifts, completed_shifts: r.completed_shifts,
        absent_shifts: r.absent_shifts, attendance_pct: r.attendance_pct,
      });
    });
    topSellers.rows.forEach(r => {
      if (empMap[r.id]) Object.assign(empMap[r.id], {
        items_sold: r.items_sold, qty_sold: r.qty_sold, items_revenue: r.items_revenue,
      });
    });

    res.json({
      dateFrom, dateTo,
      employees: Object.values(empMap),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// GET /api/reports/menu  — menu item performance
exports.getMenuReport = async (req, res) => {
  try {
    const { restaurantId, id: userId, permissions = [] } = req.user;
    const isManager = permissions.includes('settings');
    const empFilter = isManager ? '' : `AND o.employee_id='${userId}'`;
    const { from, to } = req.query;
    const now = new Date();
    const dateFrom = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const dateTo = to || now.toISOString().slice(0, 10);

    const [items, byCategory, trending] = await Promise.all([
      // All items performance
      db.query(`
        SELECT
          mi.id, mi.name, mi.price, mi.cost, mi.image_url,
          c.name AS category_name,
          COALESCE(SUM(oi.quantity), 0)             AS qty_sold,
          COALESCE(SUM(oi.total_price), 0)          AS total_revenue,
          COALESCE(COUNT(DISTINCT o.id), 0)         AS order_count,
          COALESCE(AVG(oi.unit_price), mi.price)    AS avg_price,
          COALESCE(SUM(oi.quantity * mi.cost), 0)   AS estimated_cost,
          COALESCE(SUM(oi.total_price) - SUM(oi.quantity * mi.cost), 0) AS gross_profit
        FROM menu_items mi
        LEFT JOIN categories c   ON mi.category_id = c.id
        LEFT JOIN order_items oi ON oi.menu_item_id = mi.id
        LEFT JOIN orders o       ON oi.order_id = o.id
          AND DATE(o.created_at) BETWEEN $2 AND $3
          AND o.status NOT IN ('cancelled') ${empFilter}
        WHERE mi.restaurant_id=$1
        GROUP BY mi.id, mi.name, mi.price, mi.cost, mi.image_url, c.name
        ORDER BY qty_sold DESC`,
        [restaurantId, dateFrom, dateTo]
      ),
      // By category
      db.query(`
        SELECT c.name AS category,
          COUNT(DISTINCT mi.id)       AS item_count,
          COALESCE(SUM(oi.quantity), 0)        AS qty_sold,
          COALESCE(SUM(oi.total_price), 0)     AS revenue
        FROM categories c
        LEFT JOIN menu_items mi ON mi.category_id = c.id AND mi.restaurant_id=$1
        LEFT JOIN order_items oi ON oi.menu_item_id = mi.id
        LEFT JOIN orders o ON oi.order_id = o.id
          AND DATE(o.created_at) BETWEEN $2 AND $3
          AND o.status NOT IN ('cancelled') ${empFilter}
        WHERE c.restaurant_id=$1
        GROUP BY c.name ORDER BY revenue DESC`,
        [restaurantId, dateFrom, dateTo]
      ),
      // Daily trend for top 5 items
      db.query(`
        SELECT DATE(o.created_at)::text AS day, oi.name,
          SUM(oi.quantity) AS qty
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.restaurant_id=$1 AND DATE(o.created_at) BETWEEN $2 AND $3
          AND o.status NOT IN ('cancelled') ${empFilter}
          AND oi.name IN (
            SELECT oi2.name FROM order_items oi2
            JOIN orders o2 ON oi2.order_id=o2.id
            WHERE o2.restaurant_id=$1 AND DATE(o2.created_at) BETWEEN $2 AND $3
              AND o2.status NOT IN ('cancelled') ${empFilter.replace('o.employee_id', 'o2.employee_id')}
            GROUP BY oi2.name ORDER BY SUM(oi2.quantity) DESC LIMIT 5
          )
        GROUP BY DATE(o.created_at), oi.name ORDER BY day, qty DESC`,
        [restaurantId, dateFrom, dateTo]
      ),
    ]);

    res.json({
      dateFrom, dateTo,
      items: items.rows,
      byCategory: byCategory.rows,
      trending: trending.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};
