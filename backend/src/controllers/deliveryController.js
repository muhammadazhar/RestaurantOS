const db = require('../config/db');

// ── Foodpanda dummy order templates ──────────────────────────────────────────
const FP_CUSTOMERS = [
  { name: 'Ali Hassan',       phone: '+92-300-1234567', area: 'DHA Phase 5' },
  { name: 'Sara Khan',        phone: '+92-321-9876543', area: 'Gulshan-e-Iqbal' },
  { name: 'Bilal Ahmed',      phone: '+92-333-5551234', area: 'North Nazimabad' },
  { name: 'Fatima Noor',      phone: '+92-345-7891011', area: 'Clifton Block 4' },
  { name: 'Usman Malik',      phone: '+92-311-2223344', area: 'Saddar' },
  { name: 'Ayesha Siddiqui',  phone: '+92-302-6667788', area: 'PECHS Block 2' },
  { name: 'Hamza Sheikh',     phone: '+92-315-4445566', area: 'Johar Town' },
  { name: 'Zara Hussain',     phone: '+92-322-8889900', area: 'Bahadurabad' },
];

const FP_STREETS = [
  'House 12, Street 4', 'Flat 3B, Ali Tower', 'Shop 7, Main Market',
  'Plot 45, Block C', 'Apartment 201, Zam Zam Heights', 'Bungalow 88, Lane 6',
];

const buildDummyAddress = (area) => {
  const street = FP_STREETS[Math.floor(Math.random() * FP_STREETS.length)];
  return { street, area, city: 'Karachi', instructions: 'Ring bell twice', lat: 24.8607 + Math.random() * 0.1, lng: 67.0011 + Math.random() * 0.1 };
};

// ── GET /api/delivery/orders ──────────────────────────────────────────────────
exports.getDeliveryOrders = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { platform, status } = req.query;

    let where = [`o.restaurant_id = $1`, `o.platform IS NOT NULL`];
    const params = [restaurantId];
    let idx = 2;

    if (platform) { where.push(`o.platform = $${idx++}`); params.push(platform); }
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      where.push(`o.status = ANY($${idx++}::text[])`);
      params.push(statuses);
    }

    const result = await db.query(
      `SELECT o.*,
              json_agg(json_build_object(
                'id', oi.id, 'name', oi.name, 'quantity', oi.quantity,
                'unit_price', oi.unit_price, 'total_price', oi.total_price, 'notes', oi.notes
              ) ORDER BY oi.created_at) as items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       WHERE ${where.join(' AND ')}
       GROUP BY o.id
       ORDER BY o.created_at DESC
       LIMIT 100`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── POST /api/delivery/simulate ── inject a fake Foodpanda order ──────────────
exports.simulateFoodpandaOrder = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: employeeId } = req.user;
    const { platform = 'foodpanda' } = req.body;

    // Get a random menu items for this restaurant
    const menuRes = await client.query(
      `SELECT id, name, price FROM menu_items WHERE restaurant_id=$1 AND is_available=TRUE ORDER BY RANDOM() LIMIT 4`,
      [restaurantId]
    );
    const menuItems = menuRes.rows;
    if (!menuItems.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No menu items available. Add menu items first.' });
    }

    // Get platform integration config
    const platRes = await client.query(
      `SELECT * FROM platform_integrations WHERE restaurant_id=$1 AND platform=$2`,
      [restaurantId, platform]
    );
    const platConfig = platRes.rows[0];

    const customer = FP_CUSTOMERS[Math.floor(Math.random() * FP_CUSTOMERS.length)];
    const address  = buildDummyAddress(customer.area);

    // Pick 1-3 random items
    const count = Math.floor(Math.random() * 3) + 1;
    const selectedItems = menuItems.slice(0, count).map(m => ({
      menu_item_id: m.id,
      name: m.name,
      quantity: Math.floor(Math.random() * 2) + 1,
      unit_price: Number(m.price),
    }));

    const subtotal    = selectedItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const deliveryFee = Math.round(Math.random() * 100 + 50);        // PKR 50–150
    const commission  = Math.round(subtotal * ((platConfig?.commission_pct || 15) / 100));
    const taxAmount   = Math.round(subtotal * 0.08 * 100) / 100;
    const totalAmount = subtotal + taxAmount + deliveryFee;
    const prepTime    = platConfig?.prep_time_min || 30;

    const countRes = await client.query(
      `SELECT COUNT(*) FROM orders WHERE restaurant_id=$1`, [restaurantId]
    );
    const orderNumber = `FP-${String(parseInt(countRes.rows[0].count) + 1001).padStart(5, '0')}`;

    const platformOrderId = `FP${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const orderRes = await client.query(
      `INSERT INTO orders(
         restaurant_id, employee_id, order_number, order_type, status, source,
         subtotal, tax_amount, total_amount, customer_name, customer_phone, notes,
         platform, platform_order_id, delivery_address, platform_commission,
         estimated_delivery_at
       ) VALUES($1,$2,$3,'delivery','pending','online',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()+($14||' minutes')::INTERVAL)
       RETURNING *`,
      [
        restaurantId, employeeId, orderNumber, subtotal, taxAmount, totalAmount,
        customer.name, customer.phone,
        `Delivery fee: PKR ${deliveryFee}`,
        platform, platformOrderId,
        JSON.stringify(address), commission,
        prepTime + 20,
      ]
    );
    const order = orderRes.rows[0];

    for (const item of selectedItems) {
      await client.query(
        `INSERT INTO order_items(order_id, menu_item_id, name, quantity, unit_price, total_price)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [order.id, item.menu_item_id, item.name, item.quantity, item.unit_price, item.unit_price * item.quantity]
      );
    }

    await client.query('COMMIT');

    // Broadcast via socket
    const io = req.app.get('io');
    if (io) {
      io.to(restaurantId).emit('new_delivery_order', {
        orderId: order.id, orderNumber, platform,
        customerName: customer.name,
      });
    }

    // Return full order with items
    const full = await db.query(
      `SELECT o.*, json_agg(json_build_object(
         'id',oi.id,'name',oi.name,'quantity',oi.quantity,
         'unit_price',oi.unit_price,'total_price',oi.total_price
       ) ORDER BY oi.created_at) as items
       FROM orders o LEFT JOIN order_items oi ON o.id=oi.order_id
       WHERE o.id=$1 GROUP BY o.id`,
      [order.id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── PATCH /api/delivery/orders/:id/accept ────────────────────────────────────
exports.acceptOrder = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { id } = req.params;
    const { prep_time_min } = req.body;

    const result = await db.query(
      `UPDATE orders
       SET status='confirmed', accepted_at=NOW(),
           estimated_delivery_at = COALESCE(estimated_delivery_at, NOW() + ($3::int||' minutes')::INTERVAL)
       WHERE id=$1 AND restaurant_id=$2 AND platform IS NOT NULL AND status='pending'
       RETURNING *`,
      [id, restaurantId, prep_time_min || 30]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found or already processed' });

    const io = req.app.get('io');
    if (io) io.to(restaurantId).emit('order_updated', { orderId: id, status: 'confirmed' });

    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── PATCH /api/delivery/orders/:id/reject ────────────────────────────────────
exports.rejectOrder = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { id } = req.params;
    const { reason = 'Restaurant busy' } = req.body;

    const result = await db.query(
      `UPDATE orders
       SET status='cancelled', rejection_reason=$3
       WHERE id=$1 AND restaurant_id=$2 AND platform IS NOT NULL AND status='pending'
       RETURNING *`,
      [id, restaurantId, reason]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Order not found or already processed' });

    const io = req.app.get('io');
    if (io) io.to(restaurantId).emit('order_updated', { orderId: id, status: 'cancelled' });

    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── GET /api/delivery/platforms ───────────────────────────────────────────────
exports.getPlatforms = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const result = await db.query(
      `SELECT pi.*,
              COUNT(o.id) FILTER (WHERE o.created_at > NOW() - INTERVAL '30 days') as orders_30d,
              COALESCE(SUM(o.total_amount) FILTER (WHERE o.created_at > NOW() - INTERVAL '30 days'), 0) as revenue_30d
       FROM platform_integrations pi
       LEFT JOIN orders o ON o.restaurant_id=pi.restaurant_id AND o.platform=pi.platform
         AND o.status NOT IN ('cancelled')
       WHERE pi.restaurant_id=$1
       GROUP BY pi.id
       ORDER BY pi.platform`,
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── PATCH /api/delivery/platforms/:platform ───────────────────────────────────
exports.updatePlatform = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { platform } = req.params;
    const { is_active, auto_accept, prep_time_min, commission_pct, api_key } = req.body;

    const result = await db.query(
      `UPDATE platform_integrations
       SET is_active      = COALESCE($3, is_active),
           auto_accept    = COALESCE($4, auto_accept),
           prep_time_min  = COALESCE($5, prep_time_min),
           commission_pct = COALESCE($6, commission_pct),
           api_key        = COALESCE($7, api_key)
       WHERE restaurant_id=$1 AND platform=$2
       RETURNING *`,
      [restaurantId, platform, is_active, auto_accept, prep_time_min, commission_pct, api_key || null]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Platform not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── GET /api/delivery/stats ───────────────────────────────────────────────────
exports.getDeliveryStats = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const result = await db.query(
      `SELECT
         o.platform,
         COUNT(*) FILTER (WHERE o.status NOT IN ('cancelled')) as total_orders,
         COUNT(*) FILTER (WHERE o.status = 'pending')          as pending,
         COUNT(*) FILTER (WHERE o.status IN ('confirmed','preparing','ready')) as active,
         COUNT(*) FILTER (WHERE o.status = 'served')           as delivered,
         COUNT(*) FILTER (WHERE o.status = 'cancelled')        as cancelled,
         COALESCE(SUM(o.total_amount) FILTER (WHERE o.status NOT IN ('cancelled')), 0) as gross_revenue,
         COALESCE(SUM(o.platform_commission) FILTER (WHERE o.status NOT IN ('cancelled')), 0) as total_commission,
         ROUND(AVG(EXTRACT(EPOCH FROM (o.ready_at - o.created_at))/60) FILTER (WHERE o.ready_at IS NOT NULL), 1) as avg_prep_min
       FROM orders o
       WHERE o.restaurant_id=$1 AND o.platform IS NOT NULL
         AND o.created_at > NOW() - INTERVAL '30 days'
       GROUP BY o.platform`,
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};
