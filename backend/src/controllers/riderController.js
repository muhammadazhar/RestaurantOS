const db = require('../config/db');

// ═══════════════════════════════════════════════════════════════════════════════
// PHONE ORDER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/rider/employees  — list active employees with rider role for assignment
exports.getRiders = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const result = await db.query(
      `SELECT e.id, e.full_name, e.phone, e.avatar_url, r.name as role_name,
              COUNT(o.id) FILTER (WHERE o.status IN ('confirmed','preparing','ready','picked','out_for_delivery')) as active_orders
       FROM employees e
       LEFT JOIN roles r ON e.role_id = r.id
       LEFT JOIN orders o ON o.rider_id = e.id AND DATE(o.created_at) = CURRENT_DATE
       WHERE e.restaurant_id = $1 AND e.status = 'active'
         AND (r.name ILIKE '%rider%' OR r.name ILIKE '%driver%' OR r.name ILIKE '%delivery%')
       GROUP BY e.id, e.full_name, e.phone, e.avatar_url, r.name
       ORDER BY e.full_name`,
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// POST /api/rider/phone-orders  — create a phone delivery order
exports.createPhoneOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: employeeId } = req.user;
    const {
      customer_name, customer_phone, customer_address,
      customer_lat, customer_lng,
      items, discount_amount = 0, notes, rider_id
    } = req.body;

    if (!customer_name || !customer_phone) return res.status(400).json({ error: 'Customer name and phone required' });
    if (!items || !items.length) return res.status(400).json({ error: 'Order items required' });

    // Generate order number
    const countRes = await client.query(
      `SELECT COUNT(*) FROM orders WHERE restaurant_id = $1 AND DATE(created_at) = CURRENT_DATE`,
      [restaurantId]
    );
    const seq = parseInt(countRes.rows[0].count) + 1;
    const today = new Date();
    const orderNumber = `PH${today.getFullYear().toString().slice(-2)}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}-${String(seq).padStart(4,'0')}`;

    // Calculate totals
    let subtotal = 0;
    const resolvedItems = [];
    for (const item of items) {
      const menuRes = await client.query(
        `SELECT id, name, price FROM menu_items WHERE id = $1 AND restaurant_id = $2 AND is_available = true`,
        [item.menu_item_id, restaurantId]
      );
      if (!menuRes.rows.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Item not found: ${item.menu_item_id}` }); }
      const mi = menuRes.rows[0];
      const qty = parseInt(item.quantity) || 1;
      const unit_price = parseFloat(item.unit_price || mi.price);
      const total_price = unit_price * qty;
      subtotal += total_price;
      resolvedItems.push({ menu_item_id: mi.id, name: mi.name, quantity: qty, unit_price, total_price, notes: item.notes || null });
    }

    const settingsRes = await client.query(`SELECT tax_rate FROM restaurants WHERE id = $1`, [restaurantId]);
    const taxRate = parseFloat(settingsRes.rows[0]?.tax_rate || 0);
    const tax_amount = parseFloat(((subtotal - discount_amount) * taxRate / 100).toFixed(2));
    const total_amount = parseFloat((subtotal - discount_amount + tax_amount).toFixed(2));

    const delivery_address = customer_address ? { address: customer_address } : null;

    const orderRes = await client.query(
      `INSERT INTO orders (
        restaurant_id, employee_id, rider_id,
        order_number, order_type, source, status, payment_status,
        customer_name, customer_phone, customer_lat, customer_lng,
        delivery_address, subtotal, tax_amount, discount_amount, total_amount,
        notes, guest_count
      ) VALUES ($1,$2,$3,$4,'delivery','phone','pending','unpaid',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,1)
      RETURNING *`,
      [
        restaurantId, employeeId, rider_id || null,
        orderNumber,
        customer_name, customer_phone,
        customer_lat || null, customer_lng || null,
        delivery_address ? JSON.stringify(delivery_address) : null,
        subtotal, tax_amount, discount_amount, total_amount,
        notes || null
      ]
    );
    const order = orderRes.rows[0];

    for (const item of resolvedItems) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, name, quantity, unit_price, total_price, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [order.id, item.menu_item_id, item.name, item.quantity, item.unit_price, item.total_price, item.notes]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(order);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// GET /api/rider/phone-orders  — all phone delivery orders (for manager/POS view)
exports.getPhoneOrders = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { date, status } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    let where = [
      `o.restaurant_id = $1`,
      `o.order_type = 'delivery'`,
      `o.source = 'phone'`,
      `DATE(o.created_at) = $2`,
    ];
    const params = [restaurantId, targetDate];
    let idx = 3;

    if (status && status !== 'all') {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      where.push(`o.status = ANY($${idx++}::text[])`);
      params.push(statuses);
    }

    const result = await db.query(
      `SELECT o.*,
              e.full_name as rider_name,
              e.phone as rider_mobile,
              json_agg(json_build_object(
                'id', oi.id, 'name', oi.name, 'quantity', oi.quantity,
                'unit_price', oi.unit_price, 'total_price', oi.total_price
              ) ORDER BY oi.created_at) as items
       FROM orders o
       LEFT JOIN employees e ON e.id = o.rider_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE ${where.join(' AND ')}
       GROUP BY o.id, e.full_name, e.phone
       ORDER BY o.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /api/rider/orders/:id/assign  — assign a rider to an existing order
exports.assignRider = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { id } = req.params;
    const { rider_id } = req.body;

    const result = await db.query(
      `UPDATE orders SET rider_id = $1, updated_at = NOW()
       WHERE id = $2 AND restaurant_id = $3
       RETURNING *`,
      [rider_id || null, id, restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RIDER POOL — available orders any rider can claim
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/rider/available-orders  — phone delivery orders open for claiming
exports.getAvailableOrders = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const result = await db.query(
      `SELECT o.*,
              e.full_name as rider_name,
              json_agg(json_build_object(
                'id', oi.id, 'name', oi.name, 'quantity', oi.quantity,
                'unit_price', oi.unit_price, 'total_price', oi.total_price
              ) ORDER BY oi.created_at) as items
       FROM orders o
       LEFT JOIN employees e ON e.id = o.rider_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.restaurant_id = $1
         AND o.order_type = 'delivery'
         AND o.source = 'phone'
         AND o.status NOT IN ('delivered','paid','cancelled')
         AND (
           o.rider_id IS NULL
           OR (o.assignment_expires_at IS NOT NULL AND o.assignment_expires_at < NOW() AND o.picked_at IS NULL)
         )
       GROUP BY o.id, e.full_name
       ORDER BY o.created_at ASC`,
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// POST /api/rider/orders/:id/claim  — rider atomically claims an available order
exports.claimOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: riderId } = req.user;
    const { id } = req.params;

    // Get restaurant's timeout setting
    const settRes = await client.query(
      `SELECT pickup_timeout_minutes FROM restaurants WHERE id = $1`, [restaurantId]
    );
    const timeoutMin = parseInt(settRes.rows[0]?.pickup_timeout_minutes) || 10;

    // Atomic claim: only succeed if order is still unclaimed or expired
    const result = await client.query(
      `UPDATE orders
       SET rider_id               = $1,
           status                 = 'confirmed',
           assignment_expires_at  = NOW() + ($2 || ' minutes')::interval,
           updated_at             = NOW()
       WHERE id = $3
         AND restaurant_id = $4
         AND status NOT IN ('picked','delivered','paid','cancelled')
         AND (
           rider_id IS NULL
           OR (assignment_expires_at IS NOT NULL AND assignment_expires_at < NOW() AND picked_at IS NULL)
         )
       RETURNING *`,
      [riderId, timeoutMin, id, restaurantId]
    );

    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Order already claimed by another rider' });
    }

    await client.query('COMMIT');
    res.json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RIDER DASHBOARD — orders assigned to the logged-in rider
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/rider/my-orders  — get orders assigned to logged-in rider
exports.getMyOrders = async (req, res) => {
  try {
    const { restaurantId, id: riderId } = req.user;
    const { date, status } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    let where = [`o.restaurant_id = $1`, `o.rider_id = $2`, `DATE(o.created_at) = $3`];
    const params = [restaurantId, riderId, targetDate];
    let idx = 4;

    if (status) {
      const statuses = status.split(',').map(s => s.trim()).filter(Boolean);
      where.push(`o.status = ANY($${idx++}::text[])`);
      params.push(statuses);
    }

    const result = await db.query(
      `SELECT o.*,
              EXTRACT(EPOCH FROM (o.assignment_expires_at - NOW()))::int as seconds_until_expiry,
              json_agg(json_build_object(
                'id', oi.id, 'name', oi.name, 'quantity', oi.quantity,
                'unit_price', oi.unit_price, 'total_price', oi.total_price
              ) ORDER BY oi.created_at) as items,
              rc.status as collection_status,
              rc.total_collected, rc.payment_method as collection_method
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN rider_collections rc ON rc.order_id = o.id
       WHERE ${where.join(' AND ')}
         AND o.status NOT IN ('delivered','cancelled')
       GROUP BY o.id, rc.status, rc.total_collected, rc.payment_method
       ORDER BY o.created_at ASC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /api/rider/orders/:id/pick  — rider marks order as collected from restaurant
exports.pickOrder = async (req, res) => {
  try {
    const { restaurantId, id: riderId } = req.user;
    const { id } = req.params;

    const result = await db.query(
      `UPDATE orders
       SET status = 'picked', picked_at = NOW(),
           assignment_expires_at = NULL,
           updated_at = NOW()
       WHERE id = $1 AND restaurant_id = $2 AND rider_id = $3
         AND status IN ('pending','confirmed','preparing','ready')
       RETURNING *`,
      [id, restaurantId, riderId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found or cannot be collected' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// COLLECTION — rider collects payment from customer
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/rider/collections  — record payment collected at customer door
exports.collectPayment = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: riderId } = req.user;
    const {
      order_id, payment_method = 'cash',
      cash_amount = 0, card_amount = 0,
      tendered_amount = 0, notes
    } = req.body;

    // Verify order belongs to this rider
    const orderRes = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2 AND rider_id = $3`,
      [order_id, restaurantId, riderId]
    );
    if (!orderRes.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
    const order = orderRes.rows[0];

    const total_collected = parseFloat(cash_amount) + parseFloat(card_amount);
    const change_amount   = Math.max(0, parseFloat(tendered_amount) - parseFloat(order.total_amount));

    // Upsert collection record
    const collRes = await client.query(
      `INSERT INTO rider_collections
         (restaurant_id, order_id, rider_id, cash_amount, card_amount,
          total_collected, tendered_amount, change_amount, payment_method,
          status, collected_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',NOW(),$10)
       ON CONFLICT (order_id) DO UPDATE SET
         cash_amount     = EXCLUDED.cash_amount,
         card_amount     = EXCLUDED.card_amount,
         total_collected = EXCLUDED.total_collected,
         tendered_amount = EXCLUDED.tendered_amount,
         change_amount   = EXCLUDED.change_amount,
         payment_method  = EXCLUDED.payment_method,
         notes           = EXCLUDED.notes,
         collected_at    = NOW(),
         updated_at      = NOW()
       RETURNING *`,
      [restaurantId, order_id, riderId,
       cash_amount, card_amount, total_collected,
       tendered_amount, change_amount, payment_method, notes || null]
    );

    // Mark order as delivered and payment paid
    await client.query(
      `UPDATE orders
       SET status = 'delivered', payment_status = 'paid',
           payment_method = $1, delivered_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [payment_method, order_id]
    );

    await client.query('COMMIT');
    res.json(collRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// CASHIER COLLECTION SCREEN
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/rider/cashier/summary  — all riders with today's collection summary
exports.getCashierSummary = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const result = await db.query(
      `SELECT
         e.id as rider_id,
         e.full_name as rider_name,
         e.phone as rider_phone,
         e.avatar_url,
         COUNT(o.id)                                                         as total_orders,
         COUNT(o.id) FILTER (WHERE o.status = 'delivered')                  as delivered_count,
         COUNT(o.id) FILTER (WHERE o.status IN ('picked','out_for_delivery')) as active_count,
         COALESCE(SUM(rc.total_collected) FILTER (WHERE rc.status = 'pending'),0)    as pending_amount,
         COALESCE(SUM(rc.total_collected) FILTER (WHERE rc.status = 'submitted'),0)  as submitted_amount,
         COALESCE(SUM(rc.total_collected),0)                                          as total_collected,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'),0)        as expected_amount,
         cc.id                  as cashier_collection_id,
         cc.status              as cashier_status,
         cc.submitted_amount    as cashier_submitted,
         cc.shortage_amount,
         cc.extra_amount,
         cc.collected_at
       FROM employees e
       LEFT JOIN orders o     ON o.rider_id = e.id AND DATE(o.created_at) = $2 AND o.restaurant_id = $1
       LEFT JOIN rider_collections rc ON rc.order_id = o.id
       LEFT JOIN cashier_collections cc ON cc.rider_id = e.id AND cc.collection_date = $2 AND cc.restaurant_id = $1
       INNER JOIN roles r ON e.role_id = r.id
       WHERE e.restaurant_id = $1 AND e.status = 'active'
         AND (r.name ILIKE '%rider%' OR r.name ILIKE '%driver%' OR r.name ILIKE '%delivery%')
       GROUP BY e.id, e.full_name, e.phone, e.avatar_url,
                cc.id, cc.status, cc.submitted_amount, cc.shortage_amount, cc.extra_amount, cc.collected_at
       ORDER BY e.full_name`,
      [restaurantId, targetDate]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// GET /api/rider/cashier/rider/:riderId/orders  — detail view: all collected orders for a rider
exports.getRiderOrdersForCashier = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { riderId } = req.params;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    const result = await db.query(
      `SELECT o.id, o.order_number, o.customer_name, o.customer_phone,
              o.delivery_address, o.total_amount, o.status, o.payment_status,
              o.delivered_at, o.picked_at,
              rc.cash_amount, rc.card_amount, rc.total_collected,
              rc.payment_method as collection_method, rc.status as collection_status,
              rc.collected_at
       FROM orders o
       LEFT JOIN rider_collections rc ON rc.order_id = o.id
       WHERE o.restaurant_id = $1 AND o.rider_id = $2 AND DATE(o.created_at) = $3
       ORDER BY o.created_at ASC`,
      [restaurantId, riderId, targetDate]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// POST /api/rider/cashier/collect  — cashier records collection from rider
exports.cashierCollect = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: cashierId } = req.user;
    const {
      rider_id, collection_date,
      submitted_amount, shortage_amount = 0, extra_amount = 0, notes
    } = req.body;

    const targetDate = collection_date || new Date().toISOString().slice(0, 10);

    // Get expected total from delivered orders
    const expectedRes = await client.query(
      `SELECT COALESCE(SUM(rc.total_collected), 0) as expected
       FROM rider_collections rc
       INNER JOIN orders o ON o.id = rc.order_id
       WHERE o.restaurant_id = $1 AND o.rider_id = $2 AND DATE(o.created_at) = $3
         AND rc.status = 'pending'`,
      [restaurantId, rider_id, targetDate]
    );
    const expected_amount = parseFloat(expectedRes.rows[0].expected);

    // Upsert cashier collection record
    const ccRes = await client.query(
      `INSERT INTO cashier_collections
         (restaurant_id, rider_id, cashier_id, collection_date,
          expected_amount, submitted_amount, shortage_amount, extra_amount,
          notes, status, collected_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'collected',NOW())
       ON CONFLICT (restaurant_id, rider_id, collection_date) DO UPDATE SET
         cashier_id       = EXCLUDED.cashier_id,
         expected_amount  = EXCLUDED.expected_amount,
         submitted_amount = EXCLUDED.submitted_amount,
         shortage_amount  = EXCLUDED.shortage_amount,
         extra_amount     = EXCLUDED.extra_amount,
         notes            = EXCLUDED.notes,
         status           = 'collected',
         collected_at     = NOW(),
         updated_at       = NOW()
       RETURNING *`,
      [restaurantId, rider_id, cashierId, targetDate,
       expected_amount, submitted_amount, shortage_amount, extra_amount, notes || null]
    );

    // Mark all pending rider_collections for this rider/date as submitted
    await client.query(
      `UPDATE rider_collections rc
       SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
       FROM orders o
       WHERE rc.order_id = o.id
         AND o.restaurant_id = $1 AND o.rider_id = $2 AND DATE(o.created_at) = $3
         AND rc.status = 'pending'`,
      [restaurantId, rider_id, targetDate]
    );

    await client.query('COMMIT');
    res.json(ccRes.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// PATCH /api/rider/cashier/collections/:id  — update shortage/extra
exports.updateCashierCollection = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { id } = req.params;
    const { shortage_amount, extra_amount, notes } = req.body;

    const result = await db.query(
      `UPDATE cashier_collections
       SET shortage_amount = COALESCE($1, shortage_amount),
           extra_amount    = COALESCE($2, extra_amount),
           notes           = COALESCE($3, notes),
           updated_at      = NOW()
       WHERE id = $4 AND restaurant_id = $5
       RETURNING *`,
      [shortage_amount, extra_amount, notes, id, restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Collection not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// DAILY AUDIT
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/rider/audit  — daily audit: online/phone orders, collected vs balance
exports.getDailyAudit = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().slice(0, 10);

    // Order summary
    const orderSummary = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE order_type = 'delivery' AND source = 'phone') as phone_orders,
         COUNT(*) FILTER (WHERE order_type = 'delivery' AND source != 'phone') as online_orders,
         COUNT(*) FILTER (WHERE status = 'delivered')                          as delivered,
         COUNT(*) FILTER (WHERE status IN ('picked','out_for_delivery'))        as in_transit,
         COUNT(*) FILTER (WHERE status = 'cancelled')                           as cancelled,
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'delivered'), 0)     as total_revenue,
         COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'paid'), 0)  as collected_revenue,
         COALESCE(SUM(total_amount) FILTER (WHERE payment_status = 'unpaid' AND status NOT IN ('cancelled')), 0) as balance_revenue
       FROM orders
       WHERE restaurant_id = $1 AND DATE(created_at) = $2
         AND order_type = 'delivery'`,
      [restaurantId, targetDate]
    );

    // Per-rider breakdown
    const riderBreakdown = await db.query(
      `SELECT
         e.id as rider_id,
         e.full_name as rider_name,
         COUNT(o.id)                                                          as total_orders,
         COUNT(o.id) FILTER (WHERE o.status = 'delivered')                   as delivered,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'), 0) as expected,
         COALESCE(SUM(rc.total_collected) FILTER (WHERE rc.status IN ('pending','submitted')), 0) as collected,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered')
           - SUM(rc.total_collected) FILTER (WHERE rc.status IN ('pending','submitted')), 0) as balance,
         cc.status          as cashier_status,
         cc.submitted_amount,
         cc.shortage_amount,
         cc.extra_amount
       FROM employees e
       INNER JOIN roles r ON e.role_id = r.id
       LEFT JOIN orders o ON o.rider_id = e.id AND DATE(o.created_at) = $2 AND o.restaurant_id = $1
       LEFT JOIN rider_collections rc ON rc.order_id = o.id
       LEFT JOIN cashier_collections cc ON cc.rider_id = e.id AND cc.collection_date = $2 AND cc.restaurant_id = $1
       WHERE e.restaurant_id = $1 AND e.status = 'active'
         AND (r.name ILIKE '%rider%' OR r.name ILIKE '%driver%' OR r.name ILIKE '%delivery%')
       GROUP BY e.id, e.full_name,
                cc.status, cc.submitted_amount, cc.shortage_amount, cc.extra_amount
       ORDER BY e.full_name`,
      [restaurantId, targetDate]
    );

    // Hourly order distribution
    const hourly = await db.query(
      `SELECT EXTRACT(HOUR FROM created_at)::int as hour, COUNT(*) as orders
       FROM orders
       WHERE restaurant_id = $1 AND DATE(created_at) = $2 AND order_type = 'delivery'
       GROUP BY hour ORDER BY hour`,
      [restaurantId, targetDate]
    );

    res.json({
      date: targetDate,
      summary: orderSummary.rows[0],
      riders: riderBreakdown.rows,
      hourly: hourly.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// INCENTIVE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/rider/incentives/rules
exports.getIncentiveRules = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const result = await db.query(
      `SELECT * FROM rider_incentive_rules WHERE restaurant_id = $1 ORDER BY created_at DESC`,
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// POST /api/rider/incentives/rules
exports.createIncentiveRule = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const {
      name, description, rule_type = 'per_delivery',
      per_delivery_amount = 0, milestone_count, milestone_bonus = 0,
      min_deliveries = 0, bonus_amount = 0, period = 'monthly'
    } = req.body;

    const result = await db.query(
      `INSERT INTO rider_incentive_rules
         (restaurant_id, name, description, rule_type, per_delivery_amount,
          milestone_count, milestone_bonus, min_deliveries, bonus_amount, period)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [restaurantId, name, description || null, rule_type,
       per_delivery_amount, milestone_count || null, milestone_bonus,
       min_deliveries, bonus_amount, period]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /api/rider/incentives/rules/:id
exports.updateIncentiveRule = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { id } = req.params;
    const {
      name, description, rule_type, per_delivery_amount,
      milestone_count, milestone_bonus, min_deliveries,
      bonus_amount, period, is_active
    } = req.body;

    const result = await db.query(
      `UPDATE rider_incentive_rules
       SET name                 = COALESCE($1, name),
           description          = COALESCE($2, description),
           rule_type            = COALESCE($3, rule_type),
           per_delivery_amount  = COALESCE($4, per_delivery_amount),
           milestone_count      = COALESCE($5, milestone_count),
           milestone_bonus      = COALESCE($6, milestone_bonus),
           min_deliveries       = COALESCE($7, min_deliveries),
           bonus_amount         = COALESCE($8, bonus_amount),
           period               = COALESCE($9, period),
           is_active            = COALESCE($10, is_active),
           updated_at           = NOW()
       WHERE id = $11 AND restaurant_id = $12 RETURNING *`,
      [name, description, rule_type, per_delivery_amount,
       milestone_count, milestone_bonus, min_deliveries,
       bonus_amount, period, is_active, id, restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Rule not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// DELETE /api/rider/incentives/rules/:id
exports.deleteIncentiveRule = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { id } = req.params;
    await db.query(`DELETE FROM rider_incentive_rules WHERE id = $1 AND restaurant_id = $2`, [id, restaurantId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// POST /api/rider/incentives/process  — calculate and create incentive payments for a period
exports.processIncentives = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: processedBy } = req.user;
    const { period_start, period_end, rider_ids } = req.body;

    if (!period_start || !period_end) return res.status(400).json({ error: 'period_start and period_end required' });

    // Get active incentive rules
    const rulesRes = await client.query(
      `SELECT * FROM rider_incentive_rules WHERE restaurant_id = $1 AND is_active = true`,
      [restaurantId]
    );
    const rules = rulesRes.rows;
    if (!rules.length) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No active incentive rules' }); }

    // Get riders to process
    let riderQuery = `SELECT e.id, e.full_name FROM employees e
                      INNER JOIN roles r ON e.role_id = r.id
                      WHERE e.restaurant_id = $1 AND e.status = 'active'
                        AND (r.name ILIKE '%rider%' OR r.name ILIKE '%driver%' OR r.name ILIKE '%delivery%')`;
    const riderParams = [restaurantId];
    if (rider_ids && rider_ids.length) {
      riderQuery += ` AND e.id = ANY($2::uuid[])`;
      riderParams.push(rider_ids);
    }
    const ridersRes = await client.query(riderQuery, riderParams);
    const riders = ridersRes.rows;

    const created = [];
    for (const rider of riders) {
      // Count deliveries in period
      const deliveriesRes = await client.query(
        `SELECT COUNT(*) as count FROM orders
         WHERE restaurant_id = $1 AND rider_id = $2
           AND status = 'delivered'
           AND DATE(delivered_at) BETWEEN $3 AND $4`,
        [restaurantId, rider.id, period_start, period_end]
      );
      const deliveriesCount = parseInt(deliveriesRes.rows[0].count);

      for (const rule of rules) {
        let amount = 0;
        if (rule.rule_type === 'per_delivery') {
          amount = deliveriesCount * parseFloat(rule.per_delivery_amount);
        } else if (rule.rule_type === 'milestone' && rule.milestone_count && deliveriesCount >= rule.milestone_count) {
          amount = parseFloat(rule.milestone_bonus);
        } else if (rule.rule_type === 'monthly_bonus' && deliveriesCount >= rule.min_deliveries) {
          amount = parseFloat(rule.bonus_amount);
        }

        if (amount > 0) {
          const payRes = await client.query(
            `INSERT INTO rider_incentive_payments
               (restaurant_id, rider_id, rule_id, rule_name, period_start, period_end,
                deliveries_count, amount, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending')
             RETURNING *`,
            [restaurantId, rider.id, rule.id, rule.name,
             period_start, period_end, deliveriesCount, amount]
          );
          created.push(payRes.rows[0]);
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ processed: created.length, payments: created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// GET /api/rider/incentives/payments
exports.getIncentivePayments = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { rider_id, status, month } = req.query;

    let where = [`ip.restaurant_id = $1`];
    const params = [restaurantId];
    let idx = 2;

    if (rider_id) { where.push(`ip.rider_id = $${idx++}`); params.push(rider_id); }
    if (status)   { where.push(`ip.status = $${idx++}`);   params.push(status); }
    if (month)    { where.push(`TO_CHAR(ip.period_start,'YYYY-MM') = $${idx++}`); params.push(month); }

    const result = await db.query(
      `SELECT ip.*,
              e.full_name as rider_name,
              a.full_name as approved_by_name
       FROM rider_incentive_payments ip
       LEFT JOIN employees e ON e.id = ip.rider_id
       LEFT JOIN employees a ON a.id = ip.approved_by
       WHERE ${where.join(' AND ')}
       ORDER BY ip.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /api/rider/incentives/payments/:id  — approve or mark paid
exports.updateIncentivePayment = async (req, res) => {
  try {
    const { restaurantId, id: userId } = req.user;
    const { id } = req.params;
    const { status, notes } = req.body;

    let extraCols = '';
    if (status === 'approved') extraCols = `, approved_by = '${userId}', approved_at = NOW()`;
    if (status === 'paid')     extraCols = `, paid_at = NOW()`;

    const result = await db.query(
      `UPDATE rider_incentive_payments
       SET status = $1, notes = COALESCE($2, notes) ${extraCols}
       WHERE id = $3 AND restaurant_id = $4 RETURNING *`,
      [status, notes, id, restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Payment not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ═══════════════════════════════════════════════════════════════════════════════
// RIDER REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/rider/reports  — rider performance and sales report
exports.getRiderReport = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { from, to, rider_id } = req.query;
    const dateFrom = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const dateTo   = to   || new Date().toISOString().slice(0, 10);

    let riderFilter = '';
    const params = [restaurantId, dateFrom, dateTo];
    if (rider_id) { riderFilter = `AND o.rider_id = $4`; params.push(rider_id); }

    const performance = await db.query(
      `SELECT
         e.id as rider_id,
         e.full_name as rider_name,
         e.phone,
         COUNT(o.id) FILTER (WHERE o.status = 'delivered')  as deliveries,
         COUNT(o.id) FILTER (WHERE o.status = 'cancelled')  as cancellations,
         COUNT(o.id)                                         as total_assigned,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'), 0) as total_sales,
         COALESCE(AVG(
           EXTRACT(EPOCH FROM (o.delivered_at - o.picked_at))/60
         ) FILTER (WHERE o.delivered_at IS NOT NULL AND o.picked_at IS NOT NULL), 0) as avg_delivery_min,
         COALESCE(SUM(ip.amount) FILTER (WHERE ip.status IN ('approved','paid')), 0) as total_incentives
       FROM employees e
       INNER JOIN roles r ON e.role_id = r.id
       LEFT JOIN orders o ON o.rider_id = e.id AND o.restaurant_id = $1
                           AND DATE(o.created_at) BETWEEN $2 AND $3 ${riderFilter}
       LEFT JOIN rider_incentive_payments ip ON ip.rider_id = e.id AND ip.restaurant_id = $1
                           AND ip.period_start >= $2 AND ip.period_end <= $3
       WHERE e.restaurant_id = $1 AND e.status = 'active'
         AND (r.name ILIKE '%rider%' OR r.name ILIKE '%driver%' OR r.name ILIKE '%delivery%')
       GROUP BY e.id, e.full_name, e.phone
       ORDER BY deliveries DESC`,
      params
    );

    // Daily trend for the period
    const daily = await db.query(
      `SELECT
         DATE(o.created_at) as date,
         COUNT(*) FILTER (WHERE o.status = 'delivered')  as deliveries,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.status = 'delivered'), 0) as revenue
       FROM orders o
       WHERE o.restaurant_id = $1
         AND o.order_type = 'delivery'
         AND DATE(o.created_at) BETWEEN $2 AND $3
         ${rider_id ? 'AND o.rider_id = $4' : ''}
       GROUP BY DATE(o.created_at)
       ORDER BY date`,
      params
    );

    res.json({
      period: { from: dateFrom, to: dateTo },
      riders: performance.rows,
      daily:  daily.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── Unique constraint needed for cashier_collections (prevent duplicate) ──────
// This is added here as a raw migration call; the actual SQL is in 004_rider_delivery.sql
// but we add it gracefully here too
