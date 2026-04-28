const db = require('../config/db');

const DEFAULT_TIMEZONE = 'Asia/Karachi';

const localDateString = (date = new Date(), timeZone = null) => {
  const d = date instanceof Date ? date : new Date(date);
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(d).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
};

const DEFAULT_TAX_RATES = [
  { id: 'gst', name: 'Sales Tax (GST)', rate: 8, applies_to: 'all', enabled: true },
];

async function getRestaurantTimezone(client, restaurantId) {
  const result = await client.query(`SELECT settings->>'timezone' AS timezone FROM restaurants WHERE id=$1`, [restaurantId]);
  return result.rows[0]?.timezone || DEFAULT_TIMEZONE;
}

// ─── Auto-journalize a paid order ─────────────────────────────────────────────
async function autoJournalizeOrder(restaurantId, order) {
  // Get order items with category info
  const itemsRes = await db.query(
    `SELECT oi.total_price, mi.category_id, c.name AS category_name
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     LEFT JOIN categories c ON c.id = mi.category_id
     WHERE oi.order_id = $1 AND oi.status <> 'cancelled'`,
    [order.id]
  );

  // Get GL sales mappings for this restaurant
  const mappingRes = await db.query(
    `SELECT category_id, revenue_account_id FROM gl_sales_mappings WHERE restaurant_id=$1`,
    [restaurantId]
  );
  const mappingMap = {};
  for (const m of mappingRes.rows) {
    mappingMap[m.category_id] = m.revenue_account_id;
  }

  // Get payment method account
  const payMethod = order.payment_method || 'cash';
  const payMapRes = await db.query(
    `SELECT account_id FROM gl_payment_mappings WHERE restaurant_id=$1 AND payment_method=$2`,
    [restaurantId, payMethod]
  );
  // Fall back to default payment mapping if specific one not found
  let payAccountId = payMapRes.rows[0]?.account_id;
  if (!payAccountId) {
    const defPay = await db.query(
      `SELECT account_id FROM gl_payment_mappings WHERE restaurant_id=$1 AND payment_method='default'`,
      [restaurantId]
    );
    payAccountId = defPay.rows[0]?.account_id;
  }

  // Group revenue by account
  const revenueByAccount = {};
  for (const item of itemsRes.rows) {
    const accId = mappingMap[item.category_id];
    if (!accId) continue; // no mapping, skip
    revenueByAccount[accId] = (revenueByAccount[accId] || 0) + Number(item.total_price);
  }

  const creditLines = Object.entries(revenueByAccount).filter(([, amt]) => amt > 0);

  // Need at least one credit line and a debit (payment) account
  if (!creditLines.length || !payAccountId) return;

  const totalRevenue = creditLines.reduce((s, [, amt]) => s + amt, 0);

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const entry = await client.query(
      `INSERT INTO journal_entries(restaurant_id, description, entry_date, reference, created_by)
       VALUES($1, $2, $3, $4, NULL) RETURNING id`,
      [restaurantId, `Sales — Order #${order.order_number}`, order.created_at, `ORD-${order.order_number}`]
    );
    const entryId = entry.rows[0].id;
    // Debit: payment account
    await client.query(
      `INSERT INTO journal_lines(entry_id, account_id, debit, credit) VALUES($1,$2,$3,0)`,
      [entryId, payAccountId, totalRevenue]
    );
    // Credit: revenue accounts
    for (const [accId, amt] of creditLines) {
      await client.query(
        `INSERT INTO journal_lines(entry_id, account_id, debit, credit) VALUES($1,$2,0,$3)`,
        [entryId, accId, amt]
      );
    }
    // Tag order with GL entry
    await client.query(
      `UPDATE orders SET gl_entry_id=$1 WHERE id=$2`, [entryId, order.id]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally { client.release(); }
}

async function refreshShiftClosingCash(client, shiftSessionId) {
  if (!shiftSessionId) return null;
  const sessionRes = await client.query(
    `SELECT id, opening_balance, shift_date
     FROM shift_sessions
     WHERE id=$1
     LIMIT 1`,
    [shiftSessionId]
  );
  if (!sessionRes.rows.length) return null;

  const session = sessionRes.rows[0];
  const cashRes = await client.query(
    `SELECT COALESCE(SUM(total_amount),0) AS cash_sales
     FROM orders
     WHERE shift_session_id=$1
       AND payment_method='cash'
       AND payment_status='paid'`,
    [session.id]
  );
  const cashSales = Number(cashRes.rows[0].cash_sales || 0);
  const closingCash = Number(session.opening_balance || 0) + cashSales;
  await client.query(
    `UPDATE shift_sessions SET closing_cash=$1, updated_at=NOW() WHERE id=$2`,
    [closingCash, session.id]
  );
  return { closing_cash: closingCash, cash_sales: cashSales, shift_date: session.shift_date };
}

function numeric(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundMoney(value) {
  return Math.round(numeric(value) * 100) / 100;
}

async function getOrderWithItems(client, restaurantId, orderId) {
  const result = await client.query(
    `SELECT o.*,
            dt.label as table_label,
            e.full_name as server_name,
            w.full_name as waiter_name,
            s.shift_number, s.shift_name,
            s.start_time as shift_start, s.end_time as shift_end,
            COALESCE(
              json_agg(json_build_object(
                'id', oi.id, 'menu_item_id', oi.menu_item_id, 'name', oi.name,
                'quantity', oi.quantity, 'unit_price', oi.unit_price,
                'total_price', oi.total_price, 'status', oi.status,
                'notes', oi.notes
              ) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL),
              '[]'::json
            ) as items
     FROM orders o
     LEFT JOIN dining_tables dt ON o.table_id = dt.id
     LEFT JOIN employees e ON o.employee_id = e.id
     LEFT JOIN employees w ON o.waiter_id = w.id
     LEFT JOIN shifts s ON o.shift_id = s.id
     LEFT JOIN order_items oi ON o.id = oi.order_id AND oi.status <> 'cancelled'
     WHERE o.id = $1 AND o.restaurant_id = $2
     GROUP BY o.id, dt.label, e.full_name, w.full_name, s.shift_number, s.shift_name, s.start_time, s.end_time`,
    [orderId, restaurantId]
  );
  return result.rows[0] || null;
}

async function recalculateOrderTotals(client, order) {
  const activeRes = await client.query(
    `SELECT menu_item_id, name, quantity, unit_price, total_price, notes
     FROM order_items
     WHERE order_id=$1 AND status <> 'cancelled'
     ORDER BY created_at`,
    [order.id]
  );

  const totals = await calculateOrderTotals(
    client,
    order.restaurant_id,
    activeRes.rows.map(item => ({
      menu_item_id: item.menu_item_id,
      name: item.name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      notes: item.notes,
    })),
    order.order_type,
    order.discount_amount
  );

  const updateRes = await client.query(
    `UPDATE orders
     SET subtotal=$1, discount_amount=$2, tax_amount=$3, total_amount=$4, updated_at=NOW()
     WHERE id=$5
     RETURNING *`,
    [totals.subtotal, totals.discount, totals.taxAmount, totals.totalAmount, order.id]
  );

  return updateRes.rows[0];
}

async function createAdjustment(client, restaurantId, order, type, reason, employeeId, amounts = {}, metadata = {}) {
  const result = await client.query(
    `INSERT INTO order_adjustments(
       restaurant_id, order_id, adjustment_number, type, reason, status,
       original_subtotal, replacement_subtotal, refund_amount, additional_amount,
       net_amount, tax_adjustment, total_adjustment, original_payment_method,
       created_by, metadata
     )
     VALUES(
       $1,$2,
       'RET-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(nextval('order_adjustment_number_seq')::text, 5, '0'),
       $3,$4,'completed',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14
     )
     RETURNING *`,
    [
      restaurantId,
      order.id,
      type,
      reason,
      numeric(amounts.original_subtotal),
      numeric(amounts.replacement_subtotal),
      numeric(amounts.refund_amount),
      numeric(amounts.additional_amount),
      numeric(amounts.net_amount),
      numeric(amounts.tax_adjustment),
      numeric(amounts.total_adjustment),
      order.payment_method || null,
      employeeId || null,
      JSON.stringify(metadata || {}),
    ]
  );
  return result.rows[0];
}

function isOnlineOrder(order) {
  return order?.source === 'online'
    || order?.order_type === 'online'
    || !!order?.platform
    || !!order?.platform_order_id;
}

function canAutoRefund(settings) {
  const gateway = settings?.payment_gateway || {};
  return gateway.refund_api_enabled === true
    && !!gateway.provider
    && !!gateway.api_key;
}

async function createFullCancellationAdjustment(client, restaurantId, order, reason, employeeId, metadata = {}) {
  const activeItems = await client.query(
    `SELECT * FROM order_items WHERE order_id=$1 AND status <> 'cancelled' ORDER BY created_at`,
    [order.id]
  );

  const adjustment = await createAdjustment(client, restaurantId, order, 'full_cancellation', reason, employeeId, {
    original_subtotal: order.subtotal,
    replacement_subtotal: 0,
    refund_amount: order.payment_status === 'paid' ? order.total_amount : 0,
    additional_amount: 0,
    net_amount: -numeric(order.subtotal),
    tax_adjustment: -numeric(order.tax_amount),
    total_adjustment: -numeric(order.total_amount),
  }, {
    cancelled_order_number: order.order_number,
    ...metadata,
  });

  for (const item of activeItems.rows) {
    await client.query(
      `INSERT INTO order_adjustment_items(
         adjustment_id, order_item_id, menu_item_id, name, action, quantity, unit_price, total_amount, notes
       )
       VALUES($1,$2,$3,$4,'return',$5,$6,$7,$8)`,
      [
        adjustment.id,
        item.id,
        item.menu_item_id,
        item.name,
        item.quantity,
        item.unit_price,
        -numeric(item.total_price),
        `Full order cancellation: ${reason}`,
      ]
    );
  }

  await client.query(`UPDATE order_items SET status='cancelled' WHERE order_id=$1 AND status <> 'cancelled'`, [order.id]);
  return adjustment;
}

async function calculateOrderTotals(client, restaurantId, items, orderType, discountAmount) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + numeric(item.unit_price) * numeric(item.quantity, 1), 0));
  const discount = Math.min(numeric(discountAmount), subtotal);
  const settingsRes = await client.query(`SELECT settings FROM restaurants WHERE id=$1`, [restaurantId]);
  const settings = settingsRes.rows[0]?.settings || {};
  const taxRates = (Array.isArray(settings.tax_rates) ? settings.tax_rates : DEFAULT_TAX_RATES)
    .filter(rate => rate?.enabled !== false)
    .filter(rate => ['all', orderType].includes(rate.applies_to || 'all'))
    .map(rate => ({ ...rate, rate: numeric(rate.rate) }))
    .filter(rate => rate.rate > 0);

  if (!taxRates.length || !items.length) {
    return { subtotal, discount, taxAmount: 0, totalAmount: roundMoney(subtotal - discount), taxBreakdown: [] };
  }

  const menuIds = [...new Set(items.map(item => item.menu_item_id).filter(Boolean))];
  const taxFlags = {};
  if (menuIds.length) {
    const flagRes = await client.query(
      `SELECT id, COALESCE(tax_applicable, false) AS tax_applicable, COALESCE(tax_included, true) AS tax_included
       FROM menu_items
       WHERE restaurant_id=$1 AND id = ANY($2::uuid[])`,
      [restaurantId, menuIds]
    );
    for (const row of flagRes.rows) taxFlags[row.id] = row;
  }

  const combinedRate = taxRates.reduce((sum, rate) => sum + rate.rate, 0) / 100;
  const discountRatio = subtotal > 0 ? discount / subtotal : 0;
  const taxBreakdown = taxRates.map(rate => ({ ...rate, amount: 0 }));
  let includedTax = 0;
  let exclusiveTax = 0;

  for (const item of items) {
    const flags = item.menu_item_id ? taxFlags[item.menu_item_id] : null;
    const taxApplicable = flags ? flags.tax_applicable !== false : item.tax_applicable === true;
    if (!taxApplicable) continue;

    const taxIncluded = flags ? flags.tax_included === true : item.tax_included === true;
    const lineTotal = numeric(item.unit_price) * numeric(item.quantity, 1);
    const discountedLine = lineTotal * (1 - discountRatio);
    if (discountedLine <= 0) continue;

    taxRates.forEach((rate, index) => {
      const rateDecimal = numeric(rate.rate) / 100;
      const amount = taxIncluded
        ? discountedLine * (rateDecimal / (1 + combinedRate))
        : discountedLine * rateDecimal;
      taxBreakdown[index].amount += amount;
      if (taxIncluded) includedTax += amount;
      else exclusiveTax += amount;
    });
  }

  return {
    subtotal,
    discount,
    taxAmount: roundMoney(includedTax + exclusiveTax),
    totalAmount: roundMoney(subtotal - discount + exclusiveTax),
    taxBreakdown: taxBreakdown.map(t => ({ ...t, amount: roundMoney(t.amount) })).filter(t => t.amount > 0),
  };
}

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
              w.full_name as waiter_name,
              s.shift_number, s.shift_name,
              s.start_time as shift_start, s.end_time as shift_end,
              json_agg(json_build_object(
                'id', oi.id, 'menu_item_id', oi.menu_item_id, 'name', oi.name, 'quantity', oi.quantity,
                'unit_price', oi.unit_price, 'total_price', oi.total_price,
                'status', oi.status, 'notes', oi.notes
              ) ORDER BY oi.created_at) as items
       FROM orders o
       LEFT JOIN dining_tables dt ON o.table_id = dt.id
       LEFT JOIN employees e ON o.employee_id = e.id
       LEFT JOIN employees w ON o.waiter_id = w.id
       LEFT JOIN shifts s ON o.shift_id = s.id
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE ${where.join(' AND ')}
       GROUP BY o.id, dt.label, e.full_name, w.full_name, s.shift_number, s.shift_name, s.start_time, s.end_time
       ORDER BY o.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// GET /api/orders/table/:tableId/active
exports.getActiveTableOrder = async (req, res) => {
  try {
    const { restaurantId, id: userId, permissions = [] } = req.user;
    const isManager = permissions.includes('settings');
    const { tableId } = req.params;

    const params = [restaurantId, tableId];
    const ownFilter = isManager ? '' : 'AND o.employee_id = $3';
    if (!isManager) params.push(userId);

    const orderRes = await db.query(
      `SELECT o.id
       FROM orders o
       WHERE o.restaurant_id=$1
         AND o.table_id=$2
         AND o.status NOT IN ('paid','cancelled')
         AND o.payment_status <> 'refunded'
         ${ownFilter}
       ORDER BY o.created_at DESC
       LIMIT 1`,
      params
    );

    if (!orderRes.rows.length) return res.status(404).json({ error: 'No active order for this table' });

    const order = await getOrderWithItems(db, restaurantId, orderRes.rows[0].id);
    res.json(order);
  } catch (err) {
    console.error('getActiveTableOrder error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/orders
exports.createOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: employeeId } = req.user;
    const { table_id, order_type = 'dine_in', items, guest_count = 1,
      customer_name, customer_phone, customer_address, customer_lat, customer_lng,
      rider_id, waiter_id, notes, source = 'pos', discount_amount } = req.body;

    if (!items || !items.length) return res.status(400).json({ error: 'Items required' });

    // ── Shift + Attendance validation (all POS users, no exceptions) ───────────
    let shiftId = null;
    let shiftSessionId = null;
    if (source === 'pos') {
      const timeZone = await getRestaurantTimezone(client, restaurantId);
      const today = localDateString(new Date(), timeZone);
      // Find the employee's latest open session. A real open session can belong
      // to an overnight/continued shift, so do not require shift_date = today.
      const shiftRes = await client.query(
        `SELECT s.id, s.shift_number, s.shift_name, s.start_time, s.end_time,
                sess.status, sess.shift_date AS date, sess.id AS session_id
         FROM shift_sessions sess
         JOIN shifts s ON sess.shift_id=s.id
         WHERE sess.restaurant_id=$1 AND sess.employee_id=$2
           AND sess.status IN ('active','in_process')
         ORDER BY CASE WHEN sess.shift_date=$3::date THEN 0 ELSE 1 END,
                  sess.opened_at DESC NULLS LAST,
                  sess.created_at DESC,
                  s.start_time
         LIMIT 1`,
        [restaurantId, employeeId, today]
      );

      if (!shiftRes.rows.length) {
        // Check why — give specific message
        const anyRes = await client.query(
          `SELECT s.status, s.start_time, s.end_time
           FROM shifts s
           WHERE s.restaurant_id=$1 AND s.employee_id=$2
             AND COALESCE(s.date_from, s.date) <= $3::date
             AND COALESCE(s.date_to, s.date) >= $3::date
             AND EXTRACT(ISODOW FROM $3::date)::INT = ANY(COALESCE(s.working_days, ARRAY[EXTRACT(ISODOW FROM COALESCE(s.date_from, s.date))::INT]))
           ORDER BY start_time`,
          [restaurantId, employeeId, today]
        );
        if (!anyRes.rows.length) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'No shift scheduled for you today. Contact your manager.' });
        }
        if (anyRes.rows.some(s => s.status === 'scheduled')) {
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
      shiftSessionId = shift.session_id;
    }

    // Generate order number — use MAX of ORD-* series to avoid duplicates after cancellations
    const numRes = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 5) AS INTEGER)), 1000) AS last_num
       FROM orders WHERE restaurant_id = $1 AND order_number ~ '^ORD-[0-9]+$'`, [restaurantId]
    );
    const orderNumber = `ORD-${numRes.rows[0].last_num + 1}`;

    const totals = await calculateOrderTotals(client, restaurantId, items, order_type, discount_amount);
    const subtotal = totals.subtotal;
    const discAmt = totals.discount;
    const taxAmount = totals.taxAmount;
    const totalAmount = totals.totalAmount;
    const taxBreakdownNote = totals.taxBreakdown.length
      ? `Tax: ${totals.taxBreakdown.map(t => `${t.name || 'Tax'} ${numeric(t.rate)}% = ${numeric(t.amount).toFixed(2)}`).join(', ')}`
      : null;

    const deliveryAddress = customer_address
      ? JSON.stringify({ address: customer_address })
      : null;

    const orderRes = await client.query(
      `INSERT INTO orders(restaurant_id, table_id, employee_id, shift_id, shift_session_id, order_number, order_type,
                          status, source, guest_count, subtotal, discount_amount, tax_amount, total_amount,
                          customer_name, customer_phone, customer_lat, customer_lng,
                          delivery_address, rider_id, waiter_id, notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [restaurantId, table_id || null, employeeId, shiftId, shiftSessionId, orderNumber, order_type, source,
        guest_count, subtotal, discAmt, taxAmount, totalAmount,
        customer_name || null, customer_phone || null,
        customer_lat || null, customer_lng || null,
        deliveryAddress, rider_id || null, waiter_id || null,
        [notes, taxBreakdownNote].filter(Boolean).join('\n') || null]
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
    console.error('createOrder error:', err.message, err.detail || '');
    res.status(500).json({ error: err.message || 'Server error' });
  } finally { client.release(); }
};

// POST /api/orders/:id/items
exports.addOrderItems = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId } = req.user;
    const { id } = req.params;
    const { items, notes } = req.body;

    if (!items || !items.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Items required' });
    }

    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`,
      [id, restaurantId]
    );
    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];
    if (['paid', 'cancelled'].includes(order.status) || order.payment_status === 'refunded') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only active orders can accept new items' });
    }

    const addedItems = [];
    for (const item of items) {
      const qty = Math.max(1, parseInt(item.quantity || 1, 10));
      const unitPrice = roundMoney(item.unit_price);
      const result = await client.query(
        `INSERT INTO order_items(order_id, menu_item_id, name, quantity, unit_price, total_price, notes)
         VALUES($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          id,
          item.menu_item_id || null,
          item.name,
          qty,
          unitPrice,
          roundMoney(unitPrice * qty),
          item.notes || null,
        ]
      );
      addedItems.push(result.rows[0]);
    }

    const noteText = typeof notes === 'string' ? notes.trim() : '';
    const orderForTotals = noteText && noteText !== (order.notes || '')
      ? (await client.query(
          `UPDATE orders SET notes=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
          [noteText, id]
        )).rows[0]
      : order;

    const updatedOrder = await recalculateOrderTotals(client, orderForTotals);
    const fullOrder = await getOrderWithItems(client, restaurantId, updatedOrder.id);

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) io.to(restaurantId).emit('order_updated', { orderId: id, status: fullOrder.status, tableId: fullOrder.table_id });

    res.status(201).json({ order: fullOrder, added_items: addedItems });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('addOrderItems error:', err.message, err.detail || '');
    res.status(500).json({ error: err.message || 'Server error' });
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

    // Auto-journalize when order is paid
    if (status === 'paid' && !result.rows[0].gl_entry_id) {
      try {
        await autoJournalizeOrder(restaurantId, result.rows[0]);
      } catch (glErr) {
        console.warn('GL auto-journal skipped:', glErr.message);
      }
    }

    if (status === 'paid' && result.rows[0].payment_method === 'cash' && result.rows[0].shift_session_id) {
      try {
        await refreshShiftClosingCash(db, result.rows[0].shift_session_id);
      } catch (shiftErr) {
        console.warn('Shift closing cash refresh skipped:', shiftErr.message);
      }
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

// POST /api/orders/:id/replace-item
exports.replaceOrderItem = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: employeeId } = req.user;
    const { id } = req.params;
    const {
      order_item_id,
      replacement_menu_item_id,
      replacement_name,
      quantity,
      unit_price,
      reason,
    } = req.body;

    if (!order_item_id || !replacement_menu_item_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Original item and replacement item are required' });
    }
    if (!reason || !String(reason).trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Return reason is required' });
    }

    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`,
      [id, restaurantId]
    );
    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRes.rows[0];
    if (['paid', 'cancelled'].includes(order.status) || order.payment_status === 'refunded') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only active table orders can be replaced from POS' });
    }

    const itemRes = await client.query(
      `SELECT * FROM order_items
       WHERE id=$1 AND order_id=$2 AND status <> 'cancelled'
       FOR UPDATE`,
      [order_item_id, id]
    );
    if (!itemRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order item not found or already returned' });
    }
    const oldItem = itemRes.rows[0];

    const menuRes = await client.query(
      `SELECT id, name, price
       FROM menu_items
       WHERE id=$1
         AND restaurant_id=$2
         AND COALESCE(is_available, true)=true
         AND COALESCE(status, 'active') <> 'inactive'
       LIMIT 1`,
      [replacement_menu_item_id, restaurantId]
    );
    if (!menuRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Replacement menu item not found' });
    }
    const menuItem = menuRes.rows[0];

    const qty = Math.max(1, parseInt(quantity || oldItem.quantity || 1, 10));
    const oldTotal = roundMoney(numeric(oldItem.unit_price) * qty);
    const newUnitPrice = roundMoney(unit_price ?? menuItem.price);
    const newTotal = roundMoney(newUnitPrice * qty);
    const net = roundMoney(newTotal - oldTotal);

    const oldTaxable = Math.max(0, numeric(order.subtotal) - numeric(order.discount_amount));
    const taxRate = oldTaxable > 0 ? numeric(order.tax_amount) / oldTaxable : 0.08;
    const taxAdjustment = roundMoney(net * taxRate);
    const totalAdjustment = roundMoney(net + taxAdjustment);

    const adjustment = await createAdjustment(client, restaurantId, order, 'item_replacement', reason, employeeId, {
      original_subtotal: oldTotal,
      replacement_subtotal: newTotal,
      refund_amount: totalAdjustment < 0 ? Math.abs(totalAdjustment) : 0,
      additional_amount: totalAdjustment > 0 ? totalAdjustment : 0,
      net_amount: net,
      tax_adjustment: taxAdjustment,
      total_adjustment: totalAdjustment,
    }, {
      original_order_item_id: oldItem.id,
      replacement_menu_item_id,
    });

    await client.query(
      `INSERT INTO order_adjustment_items(
         adjustment_id, order_item_id, menu_item_id, name, action, quantity, unit_price, total_amount, notes
       )
       VALUES($1,$2,$3,$4,'return',$5,$6,$7,$8)`,
      [
        adjustment.id,
        oldItem.id,
        oldItem.menu_item_id,
        oldItem.name,
        qty,
        oldItem.unit_price,
        -oldTotal,
        `Replacement return: ${reason}`,
      ]
    );

    await client.query(
      `UPDATE order_items SET status='cancelled' WHERE id=$1`,
      [oldItem.id]
    );

    const newItemRes = await client.query(
      `INSERT INTO order_items(order_id, menu_item_id, name, quantity, unit_price, total_price, notes)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        id,
        replacement_menu_item_id,
        replacement_name || menuItem.name,
        qty,
        newUnitPrice,
        newTotal,
        `Replacement for ${oldItem.name}`,
      ]
    );

    await client.query(
      `INSERT INTO order_adjustment_items(
         adjustment_id, order_item_id, menu_item_id, name, action, quantity, unit_price, total_amount, notes
       )
       VALUES($1,$2,$3,$4,'sale',$5,$6,$7,$8)`,
      [
        adjustment.id,
        newItemRes.rows[0].id,
        replacement_menu_item_id,
        replacement_name || menuItem.name,
        qty,
        newUnitPrice,
        newTotal,
        `Replacement sale: ${reason}`,
      ]
    );

    const updatedOrder = await recalculateOrderTotals(client, order);
    const fullOrder = await getOrderWithItems(client, restaurantId, updatedOrder.id);

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) io.to(restaurantId).emit('order_updated', { orderId: id, status: fullOrder.status, tableId: fullOrder.table_id });

    res.json({ order: fullOrder, adjustment, net_amount: net, tax_adjustment: taxAdjustment, total_adjustment: totalAdjustment });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('replaceOrderItem error:', err.message, err.detail || '');
    res.status(500).json({ error: err.message || 'Server error' });
  } finally { client.release(); }
};

// POST /api/orders/:id/return-item
exports.returnOrderItem = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: employeeId } = req.user;
    const { id } = req.params;
    const { order_item_id, reason } = req.body;

    if (!order_item_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order item is required' });
    }
    if (!reason || !String(reason).trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Return reason is required' });
    }

    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`,
      [id, restaurantId]
    );
    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRes.rows[0];
    if (order.status === 'cancelled' || order.payment_status === 'refunded') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order is already cancelled or refunded' });
    }

    const itemRes = await client.query(
      `SELECT * FROM order_items
       WHERE id=$1 AND order_id=$2 AND status <> 'cancelled'
       FOR UPDATE`,
      [order_item_id, id]
    );
    if (!itemRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order item not found or already returned' });
    }
    const item = itemRes.rows[0];
    const itemTotal = roundMoney(numeric(item.total_price));

    const oldTaxable = Math.max(0, numeric(order.subtotal) - numeric(order.discount_amount));
    const taxRate = oldTaxable > 0 ? numeric(order.tax_amount) / oldTaxable : 0.08;
    const taxAdjustment = roundMoney(-itemTotal * taxRate);
    const totalAdjustment = roundMoney(-itemTotal + taxAdjustment);

    const adjustment = await createAdjustment(client, restaurantId, order, 'item_return', reason, employeeId, {
      original_subtotal: itemTotal,
      replacement_subtotal: 0,
      refund_amount: totalAdjustment < 0 ? Math.abs(totalAdjustment) : 0,
      additional_amount: 0,
      net_amount: -itemTotal,
      tax_adjustment: taxAdjustment,
      total_adjustment: totalAdjustment,
    }, {
      returned_order_item_id: item.id,
    });

    await client.query(
      `INSERT INTO order_adjustment_items(
         adjustment_id, order_item_id, menu_item_id, name, action, quantity, unit_price, total_amount, notes
       )
       VALUES($1,$2,$3,$4,'return',$5,$6,$7,$8)`,
      [
        adjustment.id,
        item.id,
        item.menu_item_id,
        item.name,
        item.quantity,
        item.unit_price,
        -itemTotal,
        `Item return: ${reason}`,
      ]
    );

    await client.query(`UPDATE order_items SET status='cancelled' WHERE id=$1`, [item.id]);

    const remainingRes = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM order_items
       WHERE order_id=$1 AND status <> 'cancelled'`,
      [id]
    );

    let updatedOrder;
    if (remainingRes.rows[0].count === 0) {
      const updatedRes = await client.query(
        `UPDATE orders
         SET status='cancelled',
             payment_status=CASE WHEN payment_status='paid' THEN 'refunded' ELSE payment_status END,
             updated_at=NOW()
         WHERE id=$1
         RETURNING *`,
        [id]
      );
      updatedOrder = updatedRes.rows[0];
      if (updatedOrder.table_id) {
        await client.query(`UPDATE dining_tables SET status='vacant' WHERE id=$1`, [updatedOrder.table_id]);
      }
    } else {
      updatedOrder = await recalculateOrderTotals(client, order);
    }

    const fullOrder = await getOrderWithItems(client, restaurantId, updatedOrder.id);

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) io.to(restaurantId).emit('order_updated', { orderId: id, status: fullOrder.status, tableId: fullOrder.table_id });

    res.json({ order: fullOrder, adjustment, net_amount: -itemTotal, tax_adjustment: taxAdjustment, total_adjustment: totalAdjustment });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('returnOrderItem error:', err.message, err.detail || '');
    res.status(500).json({ error: err.message || 'Server error' });
  } finally { client.release(); }
};

// POST /api/orders/:id/cancel-return
exports.cancelOrderReturn = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: employeeId } = req.user;
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !String(reason).trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`,
      [id, restaurantId]
    );
    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRes.rows[0];
    if (order.status === 'cancelled' || order.payment_status === 'refunded') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Order is already cancelled or refunded' });
    }

    const adjustment = await createFullCancellationAdjustment(client, restaurantId, order, reason, employeeId);
    const updatedRes = await client.query(
      `UPDATE orders
       SET status='cancelled',
           payment_status=CASE WHEN payment_status='paid' THEN 'refunded' ELSE payment_status END,
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [id]
    );

    if (updatedRes.rows[0].table_id) {
      await client.query(`UPDATE dining_tables SET status='vacant' WHERE id=$1`, [updatedRes.rows[0].table_id]);
    }

    await client.query('COMMIT');

    const io = req.app.get('io');
    if (io) io.to(restaurantId).emit('order_updated', { orderId: id, status: 'cancelled', tableId: updatedRes.rows[0].table_id });

    res.json({ order: updatedRes.rows[0], adjustment });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('cancelOrderReturn error:', err.message, err.detail || '');
    res.status(500).json({ error: err.message || 'Server error' });
  } finally { client.release(); }
};

// POST /api/orders/:id/cancel-online
exports.cancelOnlineOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: employeeId } = req.user;
    const canManageRefunds = req.user?.isSuperAdmin || (req.user?.permissions || []).includes('settings');
    const { id } = req.params;
    const { reason } = req.body;

    if (!canManageRefunds) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only admins can cancel online orders' });
    }

    if (!reason || !String(reason).trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE`,
      [id, restaurantId]
    );
    if (!orderRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRes.rows[0];
    if (!isOnlineOrder(order)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only online orders can be cancelled here' });
    }

    const cancellableStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'picked', 'out_for_delivery'];
    if (!cancellableStatuses.includes(order.status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only incomplete online orders can be cancelled' });
    }

    const settingsRes = await client.query(
      `SELECT settings FROM restaurants WHERE id=$1`,
      [restaurantId]
    );
    const settings = settingsRes.rows[0]?.settings || {};
    const autoRefundEnabled = canAutoRefund(settings);
    const refundAmount = roundMoney(order.payment_status === 'paid' ? numeric(order.total_amount) : 0);
    const nextPaymentStatus = refundAmount > 0
      ? (autoRefundEnabled ? 'refund_pending' : 'refund_pending')
      : order.payment_status;
    const refundStatus = refundAmount > 0
      ? (autoRefundEnabled ? 'refund_pending' : 'manual_refund_required')
      : 'not_required';
    const requiredAction = refundAmount > 0 && !autoRefundEnabled ? 'manual_refund_required' : null;
    const gatewayProvider = settings?.payment_gateway?.provider || null;

    const adjustment = await createFullCancellationAdjustment(
      client,
      restaurantId,
      order,
      reason,
      employeeId,
      {
        workflow: 'online_admin_cancel',
        refund_status: refundStatus,
        refund_amount: refundAmount,
        refund_required_action: requiredAction,
        payment_gateway_provider: gatewayProvider,
        auto_refund_enabled: autoRefundEnabled,
      }
    );

    const updatedRes = await client.query(
      `UPDATE orders
       SET status=$2,
           payment_status=$3,
           refund_status=$4,
           refund_amount=$5,
           refund_reason=$6,
           refund_required_action=$7,
           refund_gateway_provider=$8,
           refund_requested_at=CASE WHEN $5 > 0 THEN NOW() ELSE refund_requested_at END,
           refund_updated_at=NOW(),
           updated_at=NOW()
       WHERE id=$1
       RETURNING *`,
      [
        id,
        'cancelled',
        nextPaymentStatus,
        refundStatus,
        refundAmount,
        String(reason).trim(),
        requiredAction,
        gatewayProvider,
      ]
    );

    await client.query('COMMIT');

    const updatedOrder = updatedRes.rows[0];
    const io = req.app.get('io');
    if (io) {
      io.to(restaurantId).emit('order_updated', { orderId: id, status: 'cancelled', tableId: updatedOrder.table_id || null });
    }

    res.json({
      order: updatedOrder,
      adjustment,
      refund: {
        amount: refundAmount,
        payment_status: updatedOrder.payment_status,
        refund_status: updatedOrder.refund_status,
        required_action: updatedOrder.refund_required_action,
        gateway_provider: updatedOrder.refund_gateway_provider,
        auto_refund_enabled: autoRefundEnabled,
      },
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('cancelOnlineOrder error:', err.message, err.detail || '');
    res.status(500).json({ error: err.message || 'Server error' });
  } finally { client.release(); }
};

// POST /api/orders/:id/complete-online-refund
exports.completeOnlineRefund = async (req, res) => {
  try {
    const { restaurantId, id: employeeId } = req.user;
    const canManageRefunds = req.user?.isSuperAdmin || (req.user?.permissions || []).includes('settings');
    const { id } = req.params;
    const { refund_reference, note } = req.body;

    if (!canManageRefunds) {
      return res.status(403).json({ error: 'Only admins can complete refunds' });
    }

    const result = await db.query(
      `UPDATE orders
       SET payment_status='refunded',
           refund_status='refunded',
           refund_reference=COALESCE($4, refund_reference),
           refund_note=COALESCE($5, refund_note),
           refunded_at=NOW(),
           refunded_by=$3,
           refund_updated_at=NOW(),
           updated_at=NOW()
       WHERE id=$1
         AND restaurant_id=$2
         AND status='cancelled'
         AND refund_status IN ('refund_pending','manual_refund_required','refund_failed')
       RETURNING *`,
      [
        id,
        restaurantId,
        employeeId,
        refund_reference ? String(refund_reference).trim() : null,
        note ? String(note).trim() : null,
      ]
    );

    if (!result.rows.length) {
      return res.status(400).json({ error: 'Only cancelled online orders with pending refunds can be marked refunded' });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(restaurantId).emit('order_updated', { orderId: id, status: result.rows[0].status, tableId: result.rows[0].table_id || null });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('completeOnlineRefund error:', err.message, err.detail || '');
    res.status(500).json({ error: err.message || 'Server error' });
  }
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
          COALESCE(SUM(guest_count) FILTER (WHERE payment_status='paid'), 0)     AS total_guests,
          (
            SELECT COUNT(*)
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            WHERE oa.restaurant_id=$1
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
          ) AS returned_items,
          (
            SELECT COALESCE(ABS(SUM(oai.total_amount)), 0)
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            WHERE oa.restaurant_id=$1
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
          ) AS return_amount
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
          COALESCE(SUM(oi.quantity) FILTER (WHERE oi.status <> 'cancelled'), 0)     AS qty_sold,
          COALESCE(SUM(oi.total_price) FILTER (WHERE oi.status <> 'cancelled'), 0)  AS total_revenue,
          COALESCE((
            SELECT SUM(oai.quantity)
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            WHERE oa.restaurant_id=$1
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
              AND (oai.menu_item_id = oi.menu_item_id OR (oai.menu_item_id IS NULL AND oai.name = oi.name))
          ), 0) AS returned_qty,
          COALESCE((
            SELECT ABS(SUM(oai.total_amount))
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            WHERE oa.restaurant_id=$1
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
              AND (oai.menu_item_id = oi.menu_item_id OR (oai.menu_item_id IS NULL AND oai.name = oi.name))
          ), 0) AS returned_amount,
          AVG(oi.unit_price) FILTER (WHERE oi.status <> 'cancelled') AS avg_price,
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
          COUNT(o.id) FILTER (WHERE o.status='cancelled')                AS cancelled_orders,
          COALESCE((
            SELECT COUNT(*)
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            WHERE oa.restaurant_id=$1
              AND oa.created_by = e.id
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
          ), 0) AS returned_items,
          COALESCE((
            SELECT ABS(SUM(oai.total_amount))
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            WHERE oa.restaurant_id=$1
              AND oa.created_by = e.id
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
          ), 0) AS return_amount
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
          AND oi.status <> 'cancelled'
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
          COALESCE(SUM(oi.quantity) FILTER (WHERE o.id IS NOT NULL AND oi.status <> 'cancelled'), 0)    AS qty_sold,
          COALESCE(SUM(oi.total_price) FILTER (WHERE o.id IS NOT NULL AND oi.status <> 'cancelled'), 0) AS total_revenue,
          COALESCE((
            SELECT SUM(oai.quantity)
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            WHERE oa.restaurant_id=$1
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
              AND oai.menu_item_id = mi.id
          ), 0) AS returned_qty,
          COALESCE((
            SELECT ABS(SUM(oai.total_amount))
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            WHERE oa.restaurant_id=$1
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
              AND oai.menu_item_id = mi.id
          ), 0) AS returned_amount,
          COALESCE(COUNT(DISTINCT o.id), 0)         AS order_count,
          COALESCE(AVG(oi.unit_price), mi.price)    AS avg_price,
          COALESCE(SUM(oi.quantity * mi.cost) FILTER (WHERE o.id IS NOT NULL AND oi.status <> 'cancelled'), 0)   AS estimated_cost,
          COALESCE(SUM(oi.total_price) FILTER (WHERE o.id IS NOT NULL AND oi.status <> 'cancelled') - SUM(oi.quantity * mi.cost) FILTER (WHERE o.id IS NOT NULL AND oi.status <> 'cancelled'), 0) AS gross_profit
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
          COALESCE(SUM(oi.quantity) FILTER (WHERE o.id IS NOT NULL AND oi.status <> 'cancelled'), 0)        AS qty_sold,
          COALESCE(SUM(oi.total_price) FILTER (WHERE o.id IS NOT NULL AND oi.status <> 'cancelled'), 0)     AS revenue,
          COALESCE((
            SELECT SUM(oai.quantity)
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            JOIN menu_items rmi ON rmi.id = oai.menu_item_id
            WHERE oa.restaurant_id=$1
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
              AND rmi.category_id = c.id
          ), 0) AS returned_qty,
          COALESCE((
            SELECT ABS(SUM(oai.total_amount))
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            JOIN menu_items rmi ON rmi.id = oai.menu_item_id
            WHERE oa.restaurant_id=$1
              AND DATE(oa.created_at) BETWEEN $2 AND $3
              AND oai.action='return'
              AND rmi.category_id = c.id
          ), 0) AS returned_amount
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
          AND oi.status <> 'cancelled'
          AND oi.name IN (
            SELECT oi2.name FROM order_items oi2
            JOIN orders o2 ON oi2.order_id=o2.id
            WHERE o2.restaurant_id=$1 AND DATE(o2.created_at) BETWEEN $2 AND $3
              AND o2.status NOT IN ('cancelled') ${empFilter.replace('o.employee_id', 'o2.employee_id')}
              AND oi2.status <> 'cancelled'
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

// ── GET /api/reports/shift-sales ───────────────────────────────────────────────
exports.getShiftSalesReport = async (req, res) => {
  try {
    const { restaurantId, id: userId, permissions = [] } = req.user;
    const isManager = permissions.includes('settings');
    const { from, to, employee_id, shift_name, order_type } = req.query;

    const now = new Date();
    const dateFrom = from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const dateTo   = to   || now.toISOString().slice(0, 10);
    const resolvedEmpId = isManager ? (employee_id || null) : userId;

    // Build parameterised conditions
    const params = [restaurantId, dateFrom, dateTo];
    let idx = 4;
    const shiftConds = [
      `s.restaurant_id = $1`,
      `COALESCE(sess.shift_date, s.date) >= $2::date`,
      `COALESCE(sess.shift_date, s.date) <= $3::date`
    ];
    const orderJoinConds = [
      `o.restaurant_id = s.restaurant_id`,
      `o.employee_id = s.employee_id`,
      `(
        (sess.id IS NOT NULL AND o.shift_session_id = sess.id)
        OR (
          sess.id IS NULL
          AND o.shift_session_id IS NULL
          AND o.shift_id = s.id
          AND DATE(o.created_at) = COALESCE(sess.shift_date, s.date)
        )
      )`
    ];

    if (resolvedEmpId) {
      shiftConds.push(`s.employee_id = $${idx++}::uuid`);
      params.push(resolvedEmpId);
    }
    if (shift_name) {
      shiftConds.push(`s.shift_name = $${idx++}`);
      params.push(shift_name);
    }
    if (order_type) {
      orderJoinConds.push(`o.order_type = $${idx++}`);
      params.push(order_type);
    }

    const [shiftsRes, employeesRes, shiftNamesRes] = await Promise.all([
      db.query(`
        SELECT
          s.id                                    AS shift_id,
          sess.id                                 AS shift_session_id,
          s.shift_name,
          COALESCE(sess.shift_date, s.date)       AS shift_date,
          TO_CHAR(s.start_time, 'HH24:MI')        AS start_time,
          TO_CHAR(s.end_time,   'HH24:MI')        AS end_time,
          COALESCE(sess.status, s.status)         AS shift_status,
          sess.opened_at,
          sess.closed_at,
          e.id                                    AS employee_id,
          e.full_name                             AS employee_name,
          r.name                                  AS role_name,
          COALESCE(sess.opening_balance, s.opening_balance, 0) AS opening_balance,

          COUNT(o.id)       FILTER (WHERE o.status NOT IN ('cancelled'))                         AS order_count,
          COALESCE(SUM(o.total_amount)    FILTER (WHERE o.status NOT IN ('cancelled')), 0)       AS revenue,
          COALESCE(SUM(o.subtotal)        FILTER (WHERE o.status NOT IN ('cancelled')), 0)       AS subtotal,
          COALESCE(SUM(o.tax_amount)      FILTER (WHERE o.status NOT IN ('cancelled')), 0)       AS tax,
          COALESCE(SUM(o.discount_amount) FILTER (WHERE o.status NOT IN ('cancelled')), 0)       AS discount,
          COALESCE(AVG(o.total_amount)    FILTER (WHERE o.status NOT IN ('cancelled')), 0)       AS avg_order_value,
          COALESCE(SUM(o.guest_count)     FILTER (WHERE o.status NOT IN ('cancelled')), 0)       AS guest_count,
          COUNT(o.id)       FILTER (WHERE o.status = 'cancelled')                                AS cancelled_count,
          COALESCE((
            SELECT COUNT(*)
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            JOIN orders ro ON ro.id = oa.order_id
            WHERE oa.restaurant_id = s.restaurant_id
              AND ro.employee_id = e.id
              AND DATE(oa.created_at) = COALESCE(sess.shift_date, s.date)
              AND oai.action='return'
          ), 0) AS returned_items,
          COALESCE((
            SELECT ABS(SUM(oai.total_amount))
            FROM order_adjustment_items oai
            JOIN order_adjustments oa ON oa.id = oai.adjustment_id
            JOIN orders ro ON ro.id = oa.order_id
            WHERE oa.restaurant_id = s.restaurant_id
              AND ro.employee_id = e.id
              AND DATE(oa.created_at) = COALESCE(sess.shift_date, s.date)
              AND oai.action='return'
          ), 0) AS return_amount,

          COUNT(o.id) FILTER (WHERE o.status NOT IN ('cancelled') AND o.order_type = 'dine_in')   AS dine_in_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.order_type = 'dine_in'),  0) AS dine_in_revenue,
          COUNT(o.id) FILTER (WHERE o.status NOT IN ('cancelled') AND o.order_type = 'takeaway')  AS takeaway_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.order_type = 'takeaway'), 0) AS takeaway_revenue,
          COUNT(o.id) FILTER (WHERE o.status NOT IN ('cancelled') AND o.order_type = 'delivery')  AS delivery_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.order_type = 'delivery'), 0) AS delivery_revenue,
          COUNT(o.id) FILTER (WHERE o.status NOT IN ('cancelled') AND o.order_type = 'online')    AS online_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.order_type = 'online'),   0) AS online_revenue,

          COUNT(o.id) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_method = 'cash')  AS cash_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_method = 'cash'),  0) AS cash_revenue,
          COUNT(o.id) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_method = 'card')  AS card_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_method = 'card'),  0) AS card_revenue,
          COUNT(o.id) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_method NOT IN ('cash','card') AND o.payment_method IS NOT NULL) AS other_pay_orders,
          COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_method NOT IN ('cash','card') AND o.payment_method IS NOT NULL), 0) AS other_pay_revenue,
          COALESCE(sess.opening_balance, s.opening_balance, 0) + COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_status='paid' AND o.payment_method = 'cash'), 0) AS closing_balance,
          COALESCE(sess.opening_balance, s.opening_balance, 0) + COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_status='paid' AND o.payment_method = 'cash'), 0) AS expected_closing,
          sess.cashier_collection AS cashier_collection,
          CASE
            WHEN sess.cashier_collection IS NULL THEN NULL
            ELSE sess.cashier_collection
              - (COALESCE(sess.opening_balance, s.opening_balance, 0) + COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled') AND o.payment_status='paid' AND o.payment_method = 'cash'), 0))
          END AS variance
        FROM shifts s
        LEFT JOIN employees e ON e.id = s.employee_id AND e.restaurant_id = s.restaurant_id
        LEFT JOIN roles r ON r.id = e.role_id
        LEFT JOIN shift_sessions sess ON sess.shift_id=s.id
        LEFT JOIN orders o ON ${orderJoinConds.join(' AND ')}
        WHERE ${shiftConds.join(' AND ')}
        GROUP BY s.id, s.shift_name, s.date, s.start_time, s.end_time, s.status,
                 s.opening_balance, sess.id, sess.shift_date, sess.status, sess.opening_balance, sess.closing_cash, sess.cashier_collection, sess.opened_at, sess.closed_at,
                 e.id, e.full_name, r.name
        ORDER BY COALESCE(sess.shift_date, s.date) DESC,
                 COALESCE(sess.opened_at, COALESCE(sess.shift_date, s.date)::timestamp) DESC,
                 s.start_time,
                 e.full_name
      `, params),

      db.query(`
        SELECT DISTINCT e.id, e.full_name, r.name AS role_name
        FROM shifts s
        LEFT JOIN shift_sessions sess ON sess.shift_id=s.id
        JOIN employees e ON e.id = s.employee_id AND e.restaurant_id = $1
        LEFT JOIN roles r ON r.id = e.role_id
        WHERE s.restaurant_id = $1
          AND COALESCE(sess.shift_date, s.date, s.date_from) >= $2::date
          AND COALESCE(sess.shift_date, s.date, s.date_from) <= $3::date
        ORDER BY e.full_name
      `, [restaurantId, dateFrom, dateTo]),

      db.query(`
        SELECT DISTINCT shift_name FROM shifts
        WHERE restaurant_id = $1 AND shift_name IS NOT NULL
          AND COALESCE(date_from, date) <= $3::date
          AND COALESCE(date_to, date) >= $2::date
        ORDER BY shift_name
      `, [restaurantId, dateFrom, dateTo]),
    ]);

    const shifts = shiftsRes.rows;
    const summary = shifts.reduce(
      (acc, s) => {
        acc.total_shifts++;
        acc.total_orders  += Number(s.order_count || 0);
        acc.total_revenue += Number(s.revenue     || 0);
        acc.total_guests  += Number(s.guest_count || 0);
        acc.cancelled     += Number(s.cancelled_count || 0);
        return acc;
      },
      { total_shifts: 0, total_orders: 0, total_revenue: 0, total_guests: 0, cancelled: 0 }
    );
    summary.avg_orders_per_shift  = summary.total_shifts > 0 ? summary.total_orders  / summary.total_shifts : 0;
    summary.avg_revenue_per_shift = summary.total_shifts > 0 ? summary.total_revenue / summary.total_shifts : 0;

    res.json({
      dateFrom, dateTo,
      summary,
      shifts,
      employees:  employeesRes.rows,
      shiftNames: shiftNamesRes.rows.map(r => r.shift_name).filter(Boolean),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message || 'Server error' }); }
};
