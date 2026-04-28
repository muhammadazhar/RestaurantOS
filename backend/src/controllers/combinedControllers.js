// ── tables.js ─────────────────────────────────────────────────────────────────
const db = require('../config/db');

const DEFAULT_TAX_RATES = [
  { id: 'gst', name: 'Sales Tax (GST)', rate: 8, applies_to: 'all', enabled: true },
];

exports.getTables = async (req, res) => {
  try {
    // Auto-release tables with no active reservation for today
    await db.query(
      `UPDATE dining_tables SET status='vacant'
       WHERE restaurant_id=$1 AND status='reserved'
         AND NOT EXISTS (
           SELECT 1 FROM reservations
           WHERE table_id = dining_tables.id
             AND status IN ('confirmed','pending')
             AND DATE(reserved_at) = CURRENT_DATE
             AND reserved_at + (duration_min * interval '1 minute') > NOW()
         )`,
      [req.user.restaurantId]
    );

    // Auto-activate today's reservations (future-date reservations become today)
    await db.query(
      `UPDATE dining_tables SET status='reserved'
       WHERE restaurant_id=$1 AND status='vacant'
         AND EXISTS (
           SELECT 1 FROM reservations
           WHERE table_id = dining_tables.id
             AND status IN ('confirmed','pending')
             AND DATE(reserved_at) = CURRENT_DATE
             AND reserved_at + (duration_min * interval '1 minute') > NOW()
         )`,
      [req.user.restaurantId]
    );

    const result = await db.query(
      `SELECT dt.*,
              o.id          as order_id,
              o.order_number,
              o.guest_count,
              o.status      as order_status,
              o.total_amount,
              o.subtotal,
              o.created_at  as order_started,
              e.full_name   as server_name,
              w.full_name   as waiter_name,
              r.id          as reservation_id,
              r.guest_name  as reservation_guest,
              r.guest_phone as reservation_phone,
              r.reserved_at,
              r.duration_min AS reservation_duration_min,
              r.status      as reservation_status
       FROM dining_tables dt
       LEFT JOIN orders o ON o.table_id = dt.id AND o.status NOT IN ('paid','cancelled')
       LEFT JOIN employees e ON o.employee_id = e.id
       LEFT JOIN employees w ON o.waiter_id = w.id
       LEFT JOIN LATERAL (
         SELECT id, guest_name, guest_phone, reserved_at, duration_min, status
         FROM reservations
         WHERE table_id = dt.id AND status IN ('confirmed','pending')
           AND DATE(reserved_at) = CURRENT_DATE
           AND reserved_at + (duration_min * interval '1 minute') > NOW()
         ORDER BY reserved_at LIMIT 1
       ) r ON TRUE
       WHERE dt.restaurant_id=$1
       ORDER BY dt.section, dt.label`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};
exports.updateTableStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await db.query(
      `UPDATE dining_tables SET status=$1 WHERE id=$2 AND restaurant_id=$3 RETURNING *`,
      [status, id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Table not found' });
    req.app.get('io')?.to(req.user.restaurantId).emit('table_updated', result.rows[0]);
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.createTable = async (req, res) => {
  try {
    const { label, section, capacity } = req.body;
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'Table label is required' });
    const result = await db.query(
      `INSERT INTO dining_tables(restaurant_id,label,section,capacity) VALUES($1,$2,$3,$4) RETURNING *`,
      [req.user.restaurantId, String(label).trim(), section||'Main', capacity||4]
    );
    req.app.get('io')?.to(req.user.restaurantId).emit('table_updated', result.rows[0]);
    res.status(201).json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.updateTable = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, section, capacity } = req.body;
    if (label != null && !String(label).trim()) return res.status(400).json({ error: 'Table label is required' });
    const result = await db.query(
      `UPDATE dining_tables
       SET label=COALESCE($1, label),
           section=COALESCE($2, section),
           capacity=COALESCE($3, capacity)
       WHERE id=$4 AND restaurant_id=$5
       RETURNING *`,
      [
        label == null ? null : String(label).trim(),
        section || null,
        capacity ? Math.max(1, Number(capacity) || 4) : null,
        id,
        req.user.restaurantId,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Table not found' });
    req.app.get('io')?.to(req.user.restaurantId).emit('table_updated', result.rows[0]);
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.deleteTable = async (req, res) => {
  try {
    const { id } = req.params;
    const active = await db.query(
      `SELECT
         EXISTS (
           SELECT 1 FROM orders
           WHERE table_id=$1 AND restaurant_id=$2 AND status NOT IN ('paid','cancelled')
         ) AS has_order,
         EXISTS (
           SELECT 1 FROM reservations
           WHERE table_id=$1 AND restaurant_id=$2
             AND status IN ('confirmed','pending')
             AND reserved_at + (duration_min * interval '1 minute') > NOW()
         ) AS has_reservation`,
      [id, req.user.restaurantId]
    );
    if (active.rows[0]?.has_order) return res.status(400).json({ error: 'Clear or pay the active order before deleting this table' });
    if (active.rows[0]?.has_reservation) return res.status(400).json({ error: 'Clear active reservations before deleting this table' });

    const result = await db.query(
      `DELETE FROM dining_tables WHERE id=$1 AND restaurant_id=$2 RETURNING *`,
      [id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Table not found' });
    req.app.get('io')?.to(req.user.restaurantId).emit('table_updated', result.rows[0]);
    res.json({ deleted: true, table: result.rows[0] });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'This table has history and cannot be deleted' });
    res.status(500).json({ error: 'Server error' });
  }
};

// ── employees.js ──────────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');

exports.getEmployees = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT e.id,e.role_id,e.full_name,e.email,e.phone,e.status,e.joined_date,e.salary,e.avatar_url,
              r.name as role_name, r.permissions,
              s.shift_name, s.start_time, s.end_time, s.status as shift_status
       FROM employees e
       LEFT JOIN roles r ON e.role_id = r.id
       LEFT JOIN shifts s ON s.employee_id = e.id AND s.date = CURRENT_DATE
       WHERE e.restaurant_id=$1
       ORDER BY e.full_name`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.createEmployee = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const {
      full_name, email, phone, role_id, salary, pin, password,
      employee_type,
      // shift fields (optional — create today's shift right away)
      shift_name, shift_start, shift_end, shift_date,
    } = req.body;

    const hash = password ? await bcrypt.hash(password, 10) : null;
    const result = await client.query(
      `INSERT INTO employees(restaurant_id,role_id,full_name,email,phone,salary,pin,password_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id,full_name,email,phone,status,joined_date`,
      [req.user.restaurantId, role_id||null, full_name,
       email||null, phone||null, salary||null, pin||null, hash]
    );
    const emp = result.rows[0];

    // Optionally create an initial shift
    if (shift_name && shift_start && shift_end && shift_date) {
      await client.query(
        `INSERT INTO shifts(restaurant_id,employee_id,shift_name,start_time,end_time,date,status)
         VALUES($1,$2,$3,$4,$5,$6,'scheduled')`,
        [req.user.restaurantId, emp.id, shift_name, shift_start, shift_end, shift_date]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ...emp, employee_type: employee_type || null });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

exports.updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone, email, role_id, salary, status, password } = req.body;
    const hash = password ? await bcrypt.hash(password, 10) : null;
    const result = await db.query(
      `UPDATE employees SET
       full_name=COALESCE($1,full_name), phone=COALESCE($2,phone),
       email=COALESCE($3,email), role_id=COALESCE($4,role_id),
       salary=COALESCE($5,salary), status=COALESCE($6,status),
       password_hash=COALESCE($7,password_hash)
       WHERE id=$8 AND restaurant_id=$9 RETURNING *`,
      [full_name||null, phone||null, email||null, role_id||null,
       salary||null, status||null, hash,
       id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── menu.js ───────────────────────────────────────────────────────────────────
const normalizeMenuVariants = (variants, fallbackPrice) => {
  const source = Array.isArray(variants) && variants.length
    ? variants
    : [{ name: 'Regular', price: fallbackPrice || 0, badge: '' }];

  const normalized = source
    .map((v, index) => ({
      name: String(v.name || `Option ${index + 1}`).trim(),
      price: Number(v.price || 0),
      weekend_price: v.weekend_price === '' || v.weekend_price == null ? null : Number(v.weekend_price || 0),
      badge: v.badge ? String(v.badge).trim() : null,
      value_label: v.value_label ? String(v.value_label).trim() : null,
      cost: Number(v.cost || 0),
      sort_order: Number.isFinite(Number(v.sort_order)) ? Number(v.sort_order) : index,
      is_active: v.is_active !== false,
      is_default: v.is_default === true,
    }))
    .filter(v => v.name && v.price >= 0);

  if (normalized.length && !normalized.some(v => v.is_default)) {
    normalized[0].is_default = true;
  }
  return normalized;
};

const insertMenuVariants = async (client, menuItemId, variants) => {
  for (const variant of variants) {
    await client.query(
      `INSERT INTO menu_item_variants(menu_item_id, name, price, badge, sort_order, is_active, value_label, cost, is_default, weekend_price)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        menuItemId, variant.name, variant.price, variant.badge, variant.sort_order,
        variant.is_active, variant.value_label, variant.cost, variant.is_default, variant.weekend_price,
      ]
    );
  }
};

const normalizeAddOnGroups = (groups) => {
  if (!Array.isArray(groups)) return null;
  return groups
    .map((group, groupIndex) => ({
      name: String(group.name || `Add-on Group ${groupIndex + 1}`).trim(),
      min_select: Math.max(0, Number(group.min_select || 0)),
      max_select: Math.max(0, Number(group.max_select || 0)),
      sort_order: Number.isFinite(Number(group.sort_order)) ? Number(group.sort_order) : groupIndex,
      is_active: group.is_active !== false,
      addons: (Array.isArray(group.addons) ? group.addons : [])
        .map((addon, addonIndex) => ({
          name: String(addon.name || '').trim(),
          price: Number(addon.price || 0),
          cost: Number(addon.cost || 0),
          sort_order: Number.isFinite(Number(addon.sort_order)) ? Number(addon.sort_order) : addonIndex,
          is_active: addon.is_active !== false,
        }))
        .filter(addon => addon.name && addon.price >= 0),
    }))
    .filter(group => group.name && group.addons.length);
};

const insertMenuAddOnGroups = async (client, menuItemId, groups) => {
  for (const group of groups) {
    const groupResult = await client.query(
      `INSERT INTO menu_item_addon_groups(menu_item_id, name, min_select, max_select, sort_order, is_active)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [menuItemId, group.name, group.min_select, group.max_select, group.sort_order, group.is_active]
    );
    for (const addon of group.addons) {
      await client.query(
        `INSERT INTO menu_item_addons(addon_group_id, name, price, sort_order, is_active, cost)
         VALUES($1,$2,$3,$4,$5,$6)`,
        [groupResult.rows[0].id, addon.name, addon.price, addon.sort_order, addon.is_active, addon.cost]
      );
    }
  }
};

exports.getMenu = async (req, res) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const result = await db.query(
      `SELECT mi.*, c.name as category_name,
              COALESCE(sales.total_sold, 0)::int AS total_sold,
              COALESCE(sales.gross_sales, 0)::numeric AS gross_sales,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', mv.id,
                    'name', mv.name,
                    'price', mv.price,
                    'weekend_price', mv.weekend_price,
                    'badge', mv.badge,
                    'value_label', mv.value_label,
                    'cost', mv.cost,
                    'sort_order', mv.sort_order,
                    'is_active', mv.is_active,
                    'is_default', mv.is_default
                  )
                  ORDER BY mv.sort_order, mv.name
                ) FILTER (WHERE mv.id IS NOT NULL),
                '[]'
              ) AS variants
       FROM menu_items mi
       LEFT JOIN categories c ON mi.category_id = c.id
       LEFT JOIN menu_item_variants mv ON mv.menu_item_id = mi.id
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(oi.quantity), 0) AS total_sold,
                COALESCE(SUM(oi.total_price), 0) AS gross_sales
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE oi.menu_item_id = mi.id
           AND o.restaurant_id = mi.restaurant_id
           AND o.status <> 'cancelled'
           AND o.created_at >= NOW() - INTERVAL '90 days'
       ) sales ON TRUE
       WHERE mi.restaurant_id=$1
         AND COALESCE(mi.is_deleted, FALSE)=FALSE
         AND ($2::boolean OR (
           COALESCE(mi.is_available, TRUE)=TRUE
           AND COALESCE(mi.status, 'active')='active'
           AND (mi.category_id IS NULL OR COALESCE(c.is_active, TRUE)=TRUE)
         ))
       GROUP BY mi.id, c.name, c.sort_order, sales.total_sold, sales.gross_sales
       ORDER BY c.sort_order, mi.sort_order, mi.name`,
      [req.user.restaurantId, includeInactive]
    );
    const cats = await db.query(
      `SELECT *
       FROM categories
       WHERE restaurant_id=$1
         AND ($2::boolean OR COALESCE(is_active, TRUE)=TRUE)
       ORDER BY sort_order`,
      [req.user.restaurantId, includeInactive]
    );
    const itemIds = result.rows.map(item => item.id);
    let addonGroups = [];
    if (itemIds.length) {
      const addons = await db.query(
        `SELECT g.menu_item_id,
                json_build_object(
                  'id', g.id,
                  'name', g.name,
                  'min_select', g.min_select,
                  'max_select', g.max_select,
                  'sort_order', g.sort_order,
                  'is_active', g.is_active,
                  'addons', COALESCE(
                    json_agg(
                      json_build_object(
                        'id', a.id,
                        'name', a.name,
                        'price', a.price,
                        'cost', a.cost,
                        'sort_order', a.sort_order,
                        'is_active', a.is_active
                      )
                      ORDER BY a.sort_order, a.name
                    ) FILTER (WHERE a.id IS NOT NULL),
                    '[]'
                  )
                ) AS addon_group
         FROM menu_item_addon_groups g
         LEFT JOIN menu_item_addons a ON a.addon_group_id = g.id
         WHERE g.menu_item_id = ANY($1::uuid[])
         GROUP BY g.id
         ORDER BY g.sort_order, g.name`,
        [itemIds]
      );
      addonGroups = addons.rows;
    }
    const groupsByItem = addonGroups.reduce((acc, row) => {
      acc[row.menu_item_id] = acc[row.menu_item_id] || [];
      acc[row.menu_item_id].push(row.addon_group);
      return acc;
    }, {});
    const settingsRes = await db.query(
      `SELECT settings, name, logo_url FROM restaurants WHERE id=$1`, [req.user.restaurantId]
    );
    const restaurant = settingsRes.rows[0] || {};
    const settings = restaurant.settings || {};
    res.json({
      categories: cats.rows,
      items: result.rows.map(item => ({ ...item, addon_groups: groupsByItem[item.id] || [] })),
      settings: {
        restaurant_name: restaurant.name,
        logo_url: restaurant.logo_url,
        pos_smart_menu_sort_enabled: settings.pos_smart_menu_sort_enabled === true,
        tax_rates: Array.isArray(settings.tax_rates) ? settings.tax_rates : DEFAULT_TAX_RATES,
        print_templates: settings.print_templates || null,
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

exports.createMenuItem = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const {
      name, description, price, cost, category_id, prep_time_min, is_popular,
      tags, allergens, variants, status, visible_pos, visible_web, visible_delivery,
      pricing_mode, kitchen_route, tax_included, tax_applicable, discount_eligible,
      min_qty, max_qty, step_qty, round_off_rule, service_charge_percent,
      price_override_role, allow_open_price, hide_cost_on_pos, combo_eligible,
      weekend_price_rule, weekend_price, weekend_days, open_price_role, promotion_label,
      addon_groups, sort_order,
    } = req.body;
    const normalizedVariants = normalizeMenuVariants(variants, price);
    const normalizedAddOnGroups = normalizeAddOnGroups(addon_groups) || [];
    if (!name?.trim()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Item name required' });
    }
    if (!normalizedVariants.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one valid variant is required' });
    }
    const activePrices = normalizedVariants.filter(v => v.is_active).map(v => v.price);
    const basePrice = Math.min(...(activePrices.length ? activePrices : [normalizedVariants[0].price]));
    const itemStatus = status || (req.body.is_available === false ? 'inactive' : 'active');
    const result = await client.query(
      `INSERT INTO menu_items(
         restaurant_id,category_id,name,description,price,cost,prep_time_min,is_popular,tags,allergens,
         status,visible_pos,visible_web,visible_delivery,is_available,
         pricing_mode,kitchen_route,tax_included,tax_applicable,discount_eligible,
         min_qty,max_qty,step_qty,round_off_rule,service_charge_percent,
         price_override_role,allow_open_price,hide_cost_on_pos,combo_eligible,
         weekend_price_rule,weekend_price,weekend_days,open_price_role,promotion_label,sort_order
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35) RETURNING *`,
      [
        req.user.restaurantId, category_id || null, name.trim(), description || null,
        basePrice, cost || 0, prep_time_min || 10, is_popular || false, tags || [], allergens || [],
        itemStatus, visible_pos !== false, visible_web !== false, visible_delivery !== false,
        itemStatus === 'active',
        pricing_mode || 'variant', kitchen_route || null, tax_included !== false,
        tax_applicable === true, discount_eligible !== false,
        min_qty || 1, max_qty || 10, step_qty || 1, round_off_rule || 'nearest_0_50',
        service_charge_percent || 0, price_override_role || 'manager_only',
        allow_open_price === true, hide_cost_on_pos !== false, combo_eligible !== false,
        weekend_price_rule === true, weekend_price || null,
        Array.isArray(weekend_days) && weekend_days.length ? weekend_days : ['FRI', 'SAT'],
        open_price_role || 'manager', promotion_label || null,
        Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
      ]
    );
    await insertMenuVariants(client, result.rows[0].id, normalizedVariants);
    await insertMenuAddOnGroups(client, result.rows[0].id, normalizedAddOnGroups);
    await client.query('COMMIT');
    res.status(201).json({ ...result.rows[0], variants: normalizedVariants, addon_groups: normalizedAddOnGroups });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

exports.uploadMenuImage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = req.file.path?.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    const result = await db.query(
      `UPDATE menu_items
       SET image_url=$1
       WHERE id=$2 AND restaurant_id=$3 AND COALESCE(is_deleted, FALSE)=FALSE
       RETURNING *`,
      [imageUrl, id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ image_url: imageUrl, item: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

exports.updateMenuItem = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;
    const {
      name, description, price, cost, is_available, is_popular, category_id, image_url,
      variants, status, visible_pos, visible_web, visible_delivery, prep_time_min, tags, allergens,
      pricing_mode, kitchen_route, tax_included, tax_applicable, discount_eligible,
      min_qty, max_qty, step_qty, round_off_rule, service_charge_percent,
      price_override_role, allow_open_price, hide_cost_on_pos, combo_eligible,
      weekend_price_rule, weekend_price, weekend_days, open_price_role, promotion_label,
      addon_groups, sort_order,
    } = req.body;
    // Only persist image_url if it is a real server path or Cloudinary URL.
    // Ignore blob: URLs (local preview) and empty strings.
    const safeImageUrl = (image_url && (image_url.startsWith('/uploads/') || image_url.startsWith('http'))) ? image_url : null;
    const normalizedVariants = Array.isArray(variants) ? normalizeMenuVariants(variants, price) : null;
    const normalizedAddOnGroups = Array.isArray(addon_groups) ? normalizeAddOnGroups(addon_groups) : null;
    const activePrices = normalizedVariants?.filter(v => v.is_active).map(v => v.price) || [];
    const basePrice = normalizedVariants?.length
      ? Math.min(...(activePrices.length ? activePrices : [normalizedVariants[0].price]))
      : price;
    const resolvedStatus = status || (is_available === false ? 'inactive' : (is_available === true ? 'active' : null));
    const result = await client.query(
      `UPDATE menu_items SET name=COALESCE($1,name), description=COALESCE($2,description),
       price=COALESCE($3,price), cost=COALESCE($4,cost), is_available=COALESCE($5,is_available),
       is_popular=COALESCE($6,is_popular), category_id=COALESCE($7,category_id),
       image_url=COALESCE($10,image_url),
       status=COALESCE($11,status),
       visible_pos=COALESCE($12,visible_pos),
       visible_web=COALESCE($13,visible_web),
       visible_delivery=COALESCE($14,visible_delivery),
       prep_time_min=COALESCE($15,prep_time_min),
       tags=COALESCE($16,tags),
       allergens=COALESCE($17,allergens),
       pricing_mode=COALESCE($18,pricing_mode),
       kitchen_route=COALESCE($19,kitchen_route),
       tax_included=COALESCE($20,tax_included),
       tax_applicable=COALESCE($21,tax_applicable),
       discount_eligible=COALESCE($22,discount_eligible),
       min_qty=COALESCE($23,min_qty),
       max_qty=COALESCE($24,max_qty),
       step_qty=COALESCE($25,step_qty),
       round_off_rule=COALESCE($26,round_off_rule),
       service_charge_percent=COALESCE($27,service_charge_percent),
       price_override_role=COALESCE($28,price_override_role),
       allow_open_price=COALESCE($29,allow_open_price),
       hide_cost_on_pos=COALESCE($30,hide_cost_on_pos),
       combo_eligible=COALESCE($31,combo_eligible),
       weekend_price_rule=COALESCE($32,weekend_price_rule),
       weekend_price=COALESCE($33,weekend_price),
       weekend_days=COALESCE($34,weekend_days),
       open_price_role=COALESCE($35,open_price_role),
       promotion_label=COALESCE($36,promotion_label),
       sort_order=COALESCE($37,sort_order)
       WHERE id=$8 AND restaurant_id=$9 AND COALESCE(is_deleted, FALSE)=FALSE RETURNING *`,
      [
        name, description, basePrice, cost, is_available, is_popular, category_id || null,
        id, req.user.restaurantId, safeImageUrl, resolvedStatus, visible_pos, visible_web,
        visible_delivery, prep_time_min, tags, allergens, pricing_mode, kitchen_route,
        tax_included, tax_applicable, discount_eligible,
        min_qty, max_qty, step_qty, round_off_rule, service_charge_percent,
        price_override_role, allow_open_price, hide_cost_on_pos, combo_eligible,
        weekend_price_rule, weekend_price,
        Array.isArray(weekend_days) && weekend_days.length ? weekend_days : null,
        open_price_role, promotion_label,
        sort_order === undefined || sort_order === null || sort_order === '' ? null : Number(sort_order),
      ]
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Item not found' });
    }
    if (normalizedVariants) {
      await client.query(`DELETE FROM menu_item_variants WHERE menu_item_id=$1`, [id]);
      await insertMenuVariants(client, id, normalizedVariants);
    }
    if (normalizedAddOnGroups) {
      await client.query(`DELETE FROM menu_item_addon_groups WHERE menu_item_id=$1`, [id]);
      await insertMenuAddOnGroups(client, id, normalizedAddOnGroups);
    }
    await client.query('COMMIT');
    res.json({
      ...result.rows[0],
      variants: normalizedVariants || undefined,
      addon_groups: normalizedAddOnGroups || undefined,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

exports.deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query(
      `SELECT id, name FROM menu_items
       WHERE id=$1 AND restaurant_id=$2 AND COALESCE(is_deleted, FALSE)=FALSE`,
      [id, req.user.restaurantId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Item not found' });

    const sales = await db.query(
      `SELECT 1
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.menu_item_id=$1
         AND o.restaurant_id=$2
         AND o.status <> 'cancelled'
       LIMIT 1`,
      [id, req.user.restaurantId]
    );
    if (sales.rows.length) {
      const inactive = await db.query(
        `UPDATE menu_items
         SET is_available=FALSE, status='inactive',
             visible_pos=FALSE, visible_web=FALSE, visible_delivery=FALSE
         WHERE id=$1 AND restaurant_id=$2
         RETURNING id`,
        [id, req.user.restaurantId]
      );
      return res.json({
        success: true,
        deactivated: true,
        message: 'Menu item has sales history, so it was made inactive instead of deleted.',
        item: inactive.rows[0],
      });
    }

    const result = await db.query(
      `UPDATE menu_items
       SET is_deleted=TRUE, deleted_at=NOW(), is_available=FALSE, status='inactive'
       WHERE id=$1 AND restaurant_id=$2 AND COALESCE(is_deleted, FALSE)=FALSE
       RETURNING id`,
      [id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── menu image upload ─────────────────────────────────────────────────────────
exports.uploadMenuItemImage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = req.file.path && req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    const result = await db.query(
      `UPDATE menu_items
       SET image_url=$1
       WHERE id=$2 AND restaurant_id=$3 AND COALESCE(is_deleted, FALSE)=FALSE
       RETURNING id, name, image_url`,
      [imageUrl, id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

exports.deleteMenuItemImage = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(
      `UPDATE menu_items SET image_url=NULL WHERE id=$1 AND restaurant_id=$2`,
      [id, req.user.restaurantId]
    );
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

// ── categories CRUD ───────────────────────────────────────────────────────────
exports.getCategories = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT c.*, p.name AS parent_name,
              (SELECT COUNT(*) FROM menu_items mi WHERE mi.category_id = c.id AND COALESCE(mi.is_deleted, FALSE)=FALSE)::int AS item_count,
              (SELECT COUNT(*)
               FROM order_items oi
               JOIN menu_items mi ON mi.id = oi.menu_item_id
               JOIN orders o ON o.id = oi.order_id
               WHERE mi.category_id = c.id
                 AND o.restaurant_id = c.restaurant_id
                 AND o.status <> 'cancelled')::int AS sold_item_count
       FROM categories c
       LEFT JOIN categories p ON c.parent_id = p.id
       WHERE c.restaurant_id = $1
       ORDER BY COALESCE(p.sort_order, c.sort_order), COALESCE(p.name, c.name), c.sort_order, c.name`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, description, parent_id, sort_order } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Category name required' });
    const result = await db.query(
      `INSERT INTO categories(restaurant_id, name, description, parent_id, sort_order)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.restaurantId, name.trim(), description || null, parent_id || null, sort_order ?? 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Category name already exists' });
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, parent_id, sort_order, is_active } = req.body;
    // Prevent a category from being its own parent
    if (parent_id === id) return res.status(400).json({ error: 'Category cannot be its own parent' });
    const result = await db.query(
      `UPDATE categories SET
         name       = COALESCE($1, name),
         description= COALESCE($2, description),
         parent_id  = $3,
         sort_order = COALESCE($4, sort_order),
         is_active  = COALESCE($5, is_active)
       WHERE id=$6 AND restaurant_id=$7 RETURNING *`,
      [name || null, description !== undefined ? description : null,
       parent_id || null, sort_order ?? null, is_active ?? null,
       id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

exports.deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await db.query(
      `SELECT id FROM categories WHERE id=$1 AND restaurant_id=$2`,
      [id, req.user.restaurantId]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Category not found' });

    const categoryItems = await db.query(
      `SELECT id FROM menu_items
       WHERE category_id=$1 AND restaurant_id=$2 AND COALESCE(is_deleted, FALSE)=FALSE
       LIMIT 1`,
      [id, req.user.restaurantId]
    );
    const childCategories = await db.query(
      `SELECT id FROM categories WHERE parent_id=$1 AND restaurant_id=$2 LIMIT 1`,
      [id, req.user.restaurantId]
    );
    if (categoryItems.rows.length || childCategories.rows.length) {
      const inactive = await db.query(
        `UPDATE categories SET is_active=FALSE WHERE id=$1 AND restaurant_id=$2 RETURNING *`,
        [id, req.user.restaurantId]
      );
      return res.json({
        success: true,
        deactivated: true,
        message: categoryItems.rows.length
          ? 'Category has menu items, so it was made inactive instead of deleted.'
          : 'Category has sub-categories, so it was made inactive instead of deleted.',
        category: inactive.rows[0],
      });
    }

    const items = await db.query(`SELECT id FROM menu_items WHERE category_id=$1 LIMIT 1`, [id]);
    if (items.rows.length) return res.status(400).json({ error: 'Category has menu items — reassign them first' });
    const subs = await db.query(`SELECT id FROM categories WHERE parent_id=$1 LIMIT 1`, [id]);
    if (subs.rows.length) return res.status(400).json({ error: 'Category has sub-categories — delete them first' });
    const del = await db.query(`DELETE FROM categories WHERE id=$1 AND restaurant_id=$2 RETURNING id`, [id, req.user.restaurantId]);
    if (!del.rows.length) return res.status(404).json({ error: 'Category not found' });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── recipes.js ────────────────────────────────────────────────────────────────
exports.getRecipes = async (req, res) => {
  try {
    const recipes = await db.query(
      `SELECT r.*, mi.name as menu_item_name, mi.price as selling_price, mi.image_url as menu_item_image_url
       FROM recipes r LEFT JOIN menu_items mi ON r.menu_item_id = mi.id
       WHERE r.restaurant_id=$1 ORDER BY r.name`,
      [req.user.restaurantId]
    );
    const ingredients = await db.query(
      `SELECT ri.*, ii.name as inventory_name, ii.stock_quantity, ii.unit as inventory_unit
       FROM recipe_ingredients ri
       JOIN recipes rec ON ri.recipe_id = rec.id
       LEFT JOIN inventory_items ii ON ri.inventory_item_id = ii.id
       WHERE rec.restaurant_id=$1`,
      [req.user.restaurantId]
    );
    const grouped = recipes.rows.map(r => ({
      ...r,
      ingredients: ingredients.rows.filter(i => i.recipe_id === r.id)
    }));
    res.json(grouped);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.createRecipe = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { name, menu_item_id, instructions, prep_time_min, cook_time_min, serves, notes, ingredients } = req.body;
    const recipe = await client.query(
      `INSERT INTO recipes(restaurant_id,menu_item_id,name,instructions,prep_time_min,cook_time_min,serves,notes)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.restaurantId, menu_item_id||null, name, instructions||null, prep_time_min||10, cook_time_min||20, serves||1, notes||null]
    );
    if (ingredients?.length) {
      for (const ing of ingredients) {
        await client.query(
          `INSERT INTO recipe_ingredients(recipe_id,inventory_item_id,name,quantity,unit) VALUES($1,$2,$3,$4,$5)`,
          [recipe.rows[0].id, ing.inventory_item_id||null, ing.name, ing.quantity, ing.unit]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json(recipe.rows[0]);
  } catch { await client.query('ROLLBACK'); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
};

// ── gl.js ─────────────────────────────────────────────────────────────────────
exports.getAccounts = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT a.*,
        p.name as parent_name, p.code as parent_code,
        CASE WHEN a.is_header THEN 0
             ELSE COALESCE(SUM(jl.debit),0)  END as total_debit,
        CASE WHEN a.is_header THEN 0
             ELSE COALESCE(SUM(jl.credit),0) END as total_credit,
        CASE WHEN a.is_header THEN 0
             ELSE COALESCE(SUM(jl.credit - jl.debit),0) END as balance
       FROM gl_accounts a
       LEFT JOIN gl_accounts p ON p.id = a.parent_id
       LEFT JOIN journal_lines jl
         ON jl.account_id = a.id AND (a.is_header = FALSE OR a.is_header IS NULL)
       WHERE a.restaurant_id=$1 AND (a.is_active = TRUE OR a.is_active IS NULL)
       GROUP BY a.id, p.name, p.code ORDER BY a.code`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.createGLAccount = async (req, res) => {
  try {
    const { code, name, type, parent_id, is_header, description } = req.body;
    if (!code || !name || !type) return res.status(400).json({ error: 'code, name and type required' });

    let level = 1;
    if (parent_id) {
      const par = await db.query(
        `SELECT level FROM gl_accounts WHERE id=$1 AND restaurant_id=$2`,
        [parent_id, req.user.restaurantId]
      );
      if (par.rows.length) level = (par.rows[0].level || 1) + 1;
    }

    const result = await db.query(
      `INSERT INTO gl_accounts(restaurant_id, code, name, type, parent_id, is_header, level, description)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.restaurantId, code, name, type,
       parent_id || null, is_header ? true : false, level, description || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Account code already exists' });
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateGLAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active, is_header } = req.body;
    const result = await db.query(
      `UPDATE gl_accounts
       SET name        = COALESCE($1, name),
           description = COALESCE($2, description),
           is_active   = COALESCE($3, is_active),
           is_header   = COALESCE($4, is_header)
       WHERE id=$5 AND restaurant_id=$6 RETURNING *`,
      [name || null, description || null,
       is_active != null ? is_active : null,
       is_header != null ? is_header : null,
       id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Account not found' });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.deleteGLAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const used = await db.query(
      `SELECT 1 FROM journal_lines WHERE account_id=$1 LIMIT 1`, [id]
    );
    if (used.rows.length) {
      await db.query(
        `UPDATE gl_accounts SET is_active=FALSE WHERE id=$1 AND restaurant_id=$2`,
        [id, req.user.restaurantId]
      );
      return res.json({ success: true, soft: true, message: 'Account has transactions — marked inactive' });
    }
    const r = await db.query(
      `DELETE FROM gl_accounts WHERE id=$1 AND restaurant_id=$2 AND (is_system IS NULL OR is_system=FALSE) RETURNING id`,
      [id, req.user.restaurantId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Account not found or is a system account' });
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.getJournalEntries = async (req, res) => {
  try {
    const { from, to } = req.query;
    const result = await db.query(
      `SELECT je.*, json_agg(json_build_object(
         'account_id',jl.account_id,'account_name',a.name,'account_code',a.code,
         'debit',jl.debit,'credit',jl.credit,'notes',jl.notes
       )) as lines
       FROM journal_entries je
       LEFT JOIN journal_lines jl ON jl.entry_id = je.id
       LEFT JOIN gl_accounts a ON jl.account_id = a.id
       WHERE je.restaurant_id=$1
         AND ($2::date IS NULL OR je.entry_date >= $2::date)
         AND ($3::date IS NULL OR je.entry_date <= $3::date)
       GROUP BY je.id ORDER BY je.entry_date DESC LIMIT 100`,
      [req.user.restaurantId, from||null, to||null]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.createJournalEntry = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { description, entry_date, reference, lines } = req.body;
    const debitTotal  = lines.reduce((s, l) => s + (l.debit||0), 0);
    const creditTotal = lines.reduce((s, l) => s + (l.credit||0), 0);
    if (Math.abs(debitTotal - creditTotal) > 0.01)
      return res.status(400).json({ error: 'Debits must equal credits' });

    const entry = await client.query(
      `INSERT INTO journal_entries(restaurant_id,description,entry_date,reference,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.restaurantId, description, entry_date||new Date(), reference||null, req.user.id]
    );
    for (const line of lines) {
      await client.query(
        `INSERT INTO journal_lines(entry_id,account_id,debit,credit,notes) VALUES($1,$2,$3,$4,$5)`,
        [entry.rows[0].id, line.account_id, line.debit||0, line.credit||0, line.notes||null]
      );
    }
    await client.query('COMMIT');
    res.status(201).json(entry.rows[0]);
  } catch { await client.query('ROLLBACK'); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
};

// ── gl_mappings.js ────────────────────────────────────────────────────────────

// GET all sales mappings (category → revenue account)
exports.getSalesMappings = async (req, res) => {
  try {
    const rid = req.user.restaurantId;
    const [mappings, categories, accounts, paymentMappings] = await Promise.all([
      db.query(
        `SELECT sm.*, c.name AS category_name, a.code AS account_code, a.name AS account_name
         FROM gl_sales_mappings sm
         LEFT JOIN categories c ON c.id = sm.category_id
         LEFT JOIN gl_accounts a ON a.id = sm.revenue_account_id
         WHERE sm.restaurant_id = $1`,
        [rid]
      ),
      db.query(`SELECT id, name FROM categories WHERE restaurant_id=$1 ORDER BY name`, [rid]),
      db.query(`SELECT id, code, name, type FROM gl_accounts WHERE restaurant_id=$1 ORDER BY code`, [rid]),
      db.query(
        `SELECT pm.*, a.code AS account_code, a.name AS account_name
         FROM gl_payment_mappings pm
         LEFT JOIN gl_accounts a ON a.id = pm.account_id
         WHERE pm.restaurant_id = $1`,
        [rid]
      ),
    ]);
    res.json({ mappings: mappings.rows, categories: categories.rows, accounts: accounts.rows, paymentMappings: paymentMappings.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// SAVE sales mappings (upsert)
exports.saveSalesMappings = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const { categoryMappings, paymentMappings } = req.body;
    // categoryMappings: [{category_id, revenue_account_id}]
    for (const m of (categoryMappings || [])) {
      if (!m.category_id) continue;
      await client.query(
        `INSERT INTO gl_sales_mappings(restaurant_id, category_id, revenue_account_id)
         VALUES($1,$2,$3)
         ON CONFLICT(restaurant_id, category_id)
         DO UPDATE SET revenue_account_id = EXCLUDED.revenue_account_id`,
        [rid, m.category_id, m.revenue_account_id || null]
      );
    }
    // paymentMappings: [{payment_method, account_id}]
    for (const m of (paymentMappings || [])) {
      if (!m.payment_method) continue;
      await client.query(
        `INSERT INTO gl_payment_mappings(restaurant_id, payment_method, account_id)
         VALUES($1,$2,$3)
         ON CONFLICT(restaurant_id, payment_method)
         DO UPDATE SET account_id = EXCLUDED.account_id`,
        [rid, m.payment_method, m.account_id || null]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
};

// GET all inventory mappings (item → asset + expense accounts)
exports.getInventoryMappings = async (req, res) => {
  try {
    const rid = req.user.restaurantId;
    const [mappings, items, accounts] = await Promise.all([
      db.query(
        `SELECT im.*, ii.name AS item_name, ii.unit,
                aa.code AS asset_code, aa.name AS asset_name,
                ea.code AS expense_code, ea.name AS expense_name
         FROM gl_inventory_mappings im
         LEFT JOIN inventory_items ii ON ii.id = im.inventory_item_id
         LEFT JOIN gl_accounts aa ON aa.id = im.asset_account_id
         LEFT JOIN gl_accounts ea ON ea.id = im.expense_account_id
         WHERE im.restaurant_id = $1`,
        [rid]
      ),
      db.query(`SELECT id, name, unit, category FROM inventory_items WHERE restaurant_id=$1 ORDER BY name`, [rid]),
      db.query(`SELECT id, code, name, type FROM gl_accounts WHERE restaurant_id=$1 ORDER BY code`, [rid]),
    ]);
    res.json({ mappings: mappings.rows, items: items.rows, accounts: accounts.rows });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// SAVE inventory mappings (upsert)
exports.saveInventoryMappings = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const { mappings } = req.body;
    for (const m of (mappings || [])) {
      if (!m.inventory_item_id) continue;
      await client.query(
        `INSERT INTO gl_inventory_mappings(restaurant_id, inventory_item_id, asset_account_id, expense_account_id)
         VALUES($1,$2,$3,$4)
         ON CONFLICT(restaurant_id, inventory_item_id)
         DO UPDATE SET asset_account_id = EXCLUDED.asset_account_id,
                       expense_account_id = EXCLUDED.expense_account_id`,
        [rid, m.inventory_item_id, m.asset_account_id || null, m.expense_account_id || null]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) { await client.query('ROLLBACK'); console.error(e); res.status(500).json({ error: 'Server error' }); }
  finally { client.release(); }
};

// GET Trial Balance
exports.getTrialBalance = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { from, to } = req.query;
    const result = await db.query(
      `SELECT
         a.id, a.code, a.name, a.type, a.level,
         a.parent_id, p.code as parent_code, p.name as parent_name,
         COALESCE(SUM(jl.debit),  0) AS total_debit,
         COALESCE(SUM(jl.credit), 0) AS total_credit,
         COALESCE(SUM(jl.credit - jl.debit), 0) AS net_balance
       FROM gl_accounts a
       LEFT JOIN gl_accounts p ON p.id = a.parent_id
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.entry_id
         AND ($1::date IS NULL OR je.entry_date >= $1::date)
         AND ($2::date IS NULL OR je.entry_date <= $2::date)
       WHERE a.restaurant_id = $3
         AND (a.is_header = FALSE OR a.is_header IS NULL)
         AND (a.is_active = TRUE OR a.is_active IS NULL)
       GROUP BY a.id, a.code, a.name, a.type, a.level, a.parent_id, p.code, p.name
       ORDER BY a.code`,
      [from || null, to || null, restaurantId]
    );
    const rows = result.rows;
    const totalDebit  = rows.reduce((s, r) => s + Number(r.total_debit),  0);
    const totalCredit = rows.reduce((s, r) => s + Number(r.total_credit), 0);
    res.json({ rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// GET Balance Sheet
exports.getBalanceSheet = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { as_of } = req.query;
    const result = await db.query(
      `SELECT
         a.id, a.code, a.name, a.type, a.level,
         a.parent_id, p.code as parent_code, p.name as parent_name,
         COALESCE(SUM(jl.credit - jl.debit), 0) AS balance
       FROM gl_accounts a
       LEFT JOIN gl_accounts p ON p.id = a.parent_id
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.entry_id
         AND ($1::date IS NULL OR je.entry_date <= $1::date)
       WHERE a.restaurant_id = $2
         AND (a.is_header = FALSE OR a.is_header IS NULL)
         AND (a.is_active = TRUE OR a.is_active IS NULL)
       GROUP BY a.id, a.code, a.name, a.type, a.level, a.parent_id, p.code, p.name
       ORDER BY a.code`,
      [as_of || null, restaurantId]
    );
    const rows = result.rows;
    const assets      = rows.filter(r => r.type === 'asset');
    const liabilities = rows.filter(r => r.type === 'liability');
    const equity      = rows.filter(r => r.type === 'equity');
    // Revenue - COGS - Expenses = Retained Earnings (net income)
    const revenue   = rows.filter(r => r.type === 'revenue').reduce((s, r) => s + Number(r.balance), 0);
    const cogs      = rows.filter(r => r.type === 'cogs').reduce((s, r) => s + Number(r.balance), 0);
    const expenses  = rows.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.balance), 0);
    const netIncome = revenue - (-cogs) - (-expenses); // credit balances for revenue, debit balances (negative) for cogs/expenses
    const totalAssets      = assets.reduce((s, r) => s + Number(r.balance), 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + Number(r.balance), 0);
    const totalEquity      = equity.reduce((s, r) => s + Number(r.balance), 0);
    res.json({ assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, netIncome, revenue, cogs: Math.abs(cogs), expenses: Math.abs(expenses) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// ── notifications.js ──────────────────────────────────────────────────────────
exports.getNotifications = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM notifications WHERE restaurant_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.markRead = async (req, res) => {
  try {
    await db.query(
      `UPDATE notifications SET is_read=TRUE WHERE restaurant_id=$1 AND id=ANY($2::uuid[])`,
      [req.user.restaurantId, req.body.ids]
    );
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

// ── admin.js ──────────────────────────────────────────────────────────────────
exports.getAllRestaurants = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT r.*, p.name as plan_name, p.price as plan_price,
              COUNT(DISTINCT e.id) as employee_count,
              COUNT(DISTINCT dt.id) as table_count,
              COALESCE(SUM(o.total_amount) FILTER(WHERE o.payment_status='paid'), 0) as total_revenue
       FROM restaurants r
       LEFT JOIN plans p ON r.plan_id = p.id
       LEFT JOIN employees e ON e.restaurant_id = r.id
       LEFT JOIN dining_tables dt ON dt.restaurant_id = r.id
       LEFT JOIN orders o ON o.restaurant_id = r.id
       GROUP BY r.id, p.name, p.price
       ORDER BY r.created_at DESC`
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.registerRestaurant = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const bcrypt = require('bcryptjs');
    const { restaurant_name, email, phone, address, city, plan_id, admin_name, admin_password } = req.body;
    const slug = restaurant_name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    const rest = await client.query(
      `INSERT INTO restaurants(plan_id,name,slug,email,phone,address,city,status) VALUES($1,$2,$3,$4,$5,$6,$7,'trial') RETURNING *`,
      [plan_id, restaurant_name, slug, email, phone||null, address||null, city||null]
    );

    const role = await client.query(
      `INSERT INTO roles(restaurant_id,name,permissions,is_system) VALUES($1,'Manager','["dashboard","pos","kitchen","tables","inventory","recipes","employees","attendance","shift_management","gl","alerts","settings"]',TRUE) RETURNING id`,
      [rest.rows[0].id]
    );

    const hash = await bcrypt.hash(admin_password, 10);
    await client.query(
      `INSERT INTO employees(restaurant_id,role_id,full_name,email,password_hash) VALUES($1,$2,$3,$4,$5)`,
      [rest.rows[0].id, role.rows[0].id, admin_name, email, hash]
    );

    // Default multi-level Chart of Accounts
    const coa = [
      // [code, name, type, is_header, parent_code, level]
      ['1000','Assets',              'asset',    true,  null, 1],
      ['1100','Current Assets',      'asset',    true,  '1000', 2],
      ['1110','Cash & Equivalents',  'asset',    true,  '1100', 3],
      ['1111','Cash on Hand',        'asset',    false, '1110', 4],
      ['1112','Bank Account',        'asset',    false, '1110', 4],
      ['1120','Accounts Receivable', 'asset',    false, '1100', 3],
      ['2000','Liabilities',         'liability',true,  null, 1],
      ['2100','Current Liabilities', 'liability',true,  '2000', 2],
      ['2110','Accounts Payable',    'liability',false, '2100', 3],
      ['2120','Sales Tax Payable',   'liability',false, '2100', 3],
      ['3000','Equity',              'equity',   true,  null, 1],
      ['3100','Owner\'s Equity',     'equity',   false, '3000', 2],
      ['3200','Retained Earnings',   'equity',   false, '3000', 2],
      ['4000','Revenue',             'revenue',  true,  null, 1],
      ['4100','Food Revenue',        'revenue',  false, '4000', 2],
      ['4200','Beverage Revenue',    'revenue',  false, '4000', 2],
      ['4300','Online Revenue',      'revenue',  false, '4000', 2],
      ['5000','Cost of Goods Sold',  'cogs',     true,  null, 1],
      ['5100','Food Cost',           'cogs',     false, '5000', 2],
      ['5200','Beverage Cost',       'cogs',     false, '5000', 2],
      ['6000','Operating Expenses',  'expense',  true,  null, 1],
      ['6100','Staff Wages',         'expense',  false, '6000', 2],
      ['6200','Rent & Utilities',    'expense',  false, '6000', 2],
      ['6300','Supplies',            'expense',  false, '6000', 2],
    ];
    const coaIds = {};
    for (const [code, name, type, is_header, parent_code] of coa) {
      const parentId = parent_code ? coaIds[parent_code] : null;
      const level = parent_code ? (coa.find(a => a[0] === parent_code)?.[5] || 1) + 1 : 1;
      const r = await client.query(
        `INSERT INTO gl_accounts(restaurant_id,code,name,type,is_header,parent_id,level,is_system)
         VALUES($1,$2,$3,$4,$5,$6,$7,TRUE) RETURNING id`,
        [rest.rows[0].id, code, name, type, is_header, parentId || null, level]
      );
      coaIds[code] = r.rows[0].id;
    }

    await client.query('COMMIT');
    res.status(201).json({ restaurant: rest.rows[0], message: 'Restaurant registered successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ error: 'Email or slug already exists' });
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

exports.getPlatformStats = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        COUNT(DISTINCT r.id) as total_restaurants,
        COUNT(DISTINCT r.id) FILTER(WHERE r.status='active') as active_restaurants,
        COUNT(DISTINCT e.id) as total_employees,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_amount) FILTER(WHERE o.payment_status='paid'),0) as total_revenue
      FROM restaurants r
      LEFT JOIN employees e ON e.restaurant_id = r.id
      LEFT JOIN orders o ON o.restaurant_id = r.id
    `);
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

// ── roles / shifts ────────────────────────────────────────────────────────────
exports.getRoles = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, name, permissions, is_system FROM roles WHERE restaurant_id=$1 ORDER BY name`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.createRole = async (req, res) => {
  try {
    const { name, permissions = [] } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Role name required' });
    const result = await db.query(
      `INSERT INTO roles(restaurant_id, name, permissions, is_system)
       VALUES($1, $2, $3, false) RETURNING id, name, permissions, is_system`,
      [req.user.restaurantId, name.trim(), JSON.stringify(permissions)]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Role name already exists' });
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    const result = await db.query(
      `UPDATE roles SET permissions=$1
       WHERE id=$2 AND restaurant_id=$3
       RETURNING id, name, permissions, is_system`,
      [JSON.stringify(permissions), id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Role not found' });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

const dayNamesToIso = {
  sunday: 7, sun: 7,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const normalizeWorkingDays = (days, skipWeekends = false) => {
  if (Array.isArray(days) && days.length) {
    const normalized = days
      .map(d => typeof d === 'number' ? d : dayNamesToIso[String(d).toLowerCase()])
      .filter(d => Number.isInteger(d) && d >= 1 && d <= 7);
    if (normalized.length) return [...new Set(normalized)].sort((a, b) => a - b);
  }
  return skipWeekends ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7];
};

const dateWindowSql = (alias = 's') => `
  COALESCE(${alias}.date_from, ${alias}.date) <= $DATE::date
  AND COALESCE(${alias}.date_to, ${alias}.date) >= $DATE::date
  AND EXTRACT(ISODOW FROM $DATE::date)::INT = ANY(COALESCE(${alias}.working_days, ARRAY[EXTRACT(ISODOW FROM COALESCE(${alias}.date_from, ${alias}.date))::INT]))
`;

const DEFAULT_TIMEZONE = 'Asia/Karachi';

const getRestaurantTimezone = async (restaurantId) => {
  const result = await db.query(`SELECT settings->>'timezone' AS timezone FROM restaurants WHERE id=$1`, [restaurantId]);
  return result.rows[0]?.timezone || DEFAULT_TIMEZONE;
};

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

const localTimeString = (date = new Date(), timeZone = null) => {
  const d = date instanceof Date ? date : new Date(date);
  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {});
    const hour = parts.hour === '24' ? '00' : parts.hour;
    return `${hour}:${parts.minute}`;
  }
  return d.toTimeString().slice(0, 5);
};

const timeToMinutes = value => {
  const [hours, minutes] = String(value || '00:00').slice(0, 5).split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
};

const isTimeWithinShiftWindow = (nowTime, startTime, endTime) => {
  const now = timeToMinutes(nowTime);
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === end) return true;
  if (start < end) return now >= start && now <= end;
  return now >= start || now <= end;
};

const isShiftOpenableNow = ({ shiftDate, currentDate, nowTime, startTime, endTime }) => {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const now = timeToMinutes(nowTime);
  if (start === end) return shiftDate === currentDate;
  if (start < end) return shiftDate === currentDate && now >= start && now <= end;

  const yesterday = localDateString(new Date(new Date(`${currentDate}T00:00:00`).getTime() - 86400000));
  return (shiftDate === currentDate && (now >= start || now <= end)) || (shiftDate === yesterday && now <= end);
};

const shiftSelect = `
  SELECT s.*,
         COALESCE(sess.status, s.status) AS status,
         COALESCE(sess.opening_balance, s.opening_balance) AS opening_balance,
         COALESCE(sess.closing_cash, s.closing_cash) AS closing_cash,
         sess.cashier_collection,
         sess.id AS session_id,
         sess.opened_at,
         sess.closed_at,
         TO_CHAR(d.shift_date, 'YYYY-MM-DD') AS date,
         e.full_name as employee_name,
         e.avatar_url,
         r.name as role_name
  FROM shifts s
  JOIN employees e ON s.employee_id = e.id
  LEFT JOIN roles r ON e.role_id = r.id
`;

exports.getShifts = async (req, res) => {
  try {
    const { date, employee_id, month, schedule_view, raw } = req.query;
    let where = ['s.restaurant_id=$1'];
    const params = [req.user.restaurantId];
    let idx = 2;

    if (schedule_view === '1' || schedule_view === 'true' || raw === '1' || raw === 'true') {
      if (employee_id) { where.push(`s.employee_id=$${idx++}`); params.push(employee_id); }
      if (month) {
        where.push(`COALESCE(s.date_from, s.date) <= (($${idx} || '-01')::date + INTERVAL '1 month - 1 day')::date`);
        where.push(`COALESCE(s.date_to, s.date) >= ($${idx} || '-01')::date`);
        params.push(month);
        idx++;
      }

      const result = await db.query(
        `SELECT s.*,
                COALESCE(s.date_from, s.date) AS date_from,
                COALESCE(s.date_to, s.date) AS date_to,
                COALESCE(s.date_from, s.date) AS date,
                e.full_name as employee_name,
                e.avatar_url,
                r.name as role_name,
                COALESCE(active_sessions.active_count, 0)::int AS active_session_count
         FROM shifts s
         JOIN employees e ON s.employee_id = e.id
         LEFT JOIN roles r ON e.role_id = r.id
         LEFT JOIN LATERAL (
           SELECT COUNT(*) AS active_count
           FROM shift_sessions ss
           WHERE ss.shift_id=s.id AND ss.status IN ('active','in_process')
         ) active_sessions ON TRUE
         WHERE ${where.join(' AND ')}
         ORDER BY COALESCE(s.date_from, s.date) DESC, s.start_time`,
        params
      );
      return res.json(result.rows);
    }

    let dayJoin;
    if (date) {
      dayJoin = `JOIN LATERAL (SELECT $${idx++}::date AS shift_date) d ON TRUE`;
      params.push(date);
      where.push(dateWindowSql('s').replaceAll('$DATE', `$${idx - 1}`));
    } else if (month) {
      dayJoin = `JOIN LATERAL (
        SELECT gs::date AS shift_date
        FROM generate_series(($${idx} || '-01')::date, (($${idx} || '-01')::date + INTERVAL '1 month - 1 day')::date, INTERVAL '1 day') gs
        WHERE gs::date BETWEEN COALESCE(s.date_from, s.date) AND COALESCE(s.date_to, s.date)
          AND EXTRACT(ISODOW FROM gs)::INT = ANY(COALESCE(s.working_days, ARRAY[EXTRACT(ISODOW FROM COALESCE(s.date_from, s.date))::INT]))
      ) d ON TRUE`;
      params.push(month); idx++;
    } else {
      dayJoin = `JOIN LATERAL (SELECT COALESCE(s.date_from, s.date) AS shift_date) d ON TRUE`;
    }
    if (employee_id) { where.push(`s.employee_id=$${idx++}`);                     params.push(employee_id); }

    const result = await db.query(
      `${shiftSelect}
       ${dayJoin}
       LEFT JOIN shift_sessions sess ON sess.shift_id=s.id AND sess.shift_date=d.shift_date
       WHERE ${where.join(' AND ')}
       ORDER BY d.shift_date DESC, s.start_time`,
      params
    );
    res.json(result.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

exports.bulkCreateShifts = async (req, res) => {
  try {
    const {
      employee_id, shift_name, start_time, end_time, date_from, date_to, notes,
      skip_weekends, working_days, allow_multiple_per_day, require_balance,
    } = req.body;
    if (!employee_id || !shift_name || !start_time || !end_time || !date_from || !date_to)
      return res.status(400).json({ error: 'employee_id, shift_name, start_time, end_time, date_from, date_to required' });

    const from = new Date(date_from);
    const to   = new Date(date_to);
    if (from > to) return res.status(400).json({ error: 'date_from must be before date_to' });

    const days = Math.round((to - from) / 86400000) + 1;
    if (days > 366) return res.status(400).json({ error: 'Date range cannot exceed 366 days' });

    const daysOfWeek = normalizeWorkingDays(working_days, skip_weekends);
    const exists = await db.query(
      `SELECT 1 FROM shifts
       WHERE restaurant_id=$1 AND employee_id=$2 AND start_time=$3 AND end_time=$4
         AND COALESCE(date_from,date)=$5 AND COALESCE(date_to,date)=$6
       LIMIT 1`,
      [req.user.restaurantId, employee_id, start_time, end_time, date_from, date_to]
    );
    if (exists.rows.length) return res.status(200).json({ created: 0, total: 1, skipped: 1 });

    const numRes = await db.query(
      `SELECT COALESCE(MAX(shift_number), 0) + 1 AS next_num FROM shifts WHERE restaurant_id=$1`,
      [req.user.restaurantId]
    );
    const result = await db.query(
      `INSERT INTO shifts(
         restaurant_id, employee_id, shift_name, start_time, end_time, date, date_from, date_to,
         working_days, allow_multiple_per_day, require_balance, schedule_type, status, notes, shift_number
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'range','scheduled',$12,$13)
       RETURNING *`,
      [
        req.user.restaurantId, employee_id, shift_name, start_time, end_time, date_from, date_from, date_to,
        daysOfWeek, allow_multiple_per_day !== false, require_balance !== false, notes || null,
        numRes.rows[0].next_num,
      ]
    );

    res.status(201).json({ created: 1, total: 1, skipped: 0, schedule: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getCurrentShift = async (req, res) => {
  try {
    const timeZone = await getRestaurantTimezone(req.user.restaurantId);
    const today = localDateString(new Date(), timeZone);
    const now   = localTimeString(new Date(), timeZone);

    const [shiftResult, attendResult] = await Promise.all([
      db.query(
        `SELECT s.*,
                CASE
                  WHEN sess.id IS NOT NULL THEN sess.status
                  WHEN s.status <> 'absent' THEN 'scheduled'
                  ELSE s.status
                END AS status,
                COALESCE(sess.opening_balance, s.opening_balance) AS opening_balance,
                COALESCE(sess.closing_cash, s.closing_cash) AS closing_cash,
                sess.cashier_collection,
                sess.id AS session_id,
                sess.opened_at,
                sess.closed_at,
                $3::text AS date,
                e.full_name as employee_name
         FROM shifts s
         JOIN employees e ON s.employee_id = e.id
         LEFT JOIN LATERAL (
           SELECT ss.*
           FROM shift_sessions ss
           WHERE ss.shift_id=s.id
             AND ss.shift_date=$3::date
             AND ss.status IN ('active','in_process')
           ORDER BY ss.opened_at DESC NULLS LAST, ss.created_at DESC
           LIMIT 1
         ) sess ON TRUE
         WHERE s.restaurant_id=$1 AND s.employee_id=$2
           AND COALESCE(s.date_from, s.date) <= $3::date
           AND COALESCE(s.date_to, s.date) >= $3::date
           AND EXTRACT(ISODOW FROM $3::date)::INT = ANY(COALESCE(s.working_days, ARRAY[EXTRACT(ISODOW FROM COALESCE(s.date_from, s.date))::INT]))
         ORDER BY s.start_time`,
        [req.user.restaurantId, req.user.id, today]
      ),
      db.query(
        `SELECT log_type, punched_at
         FROM attendance_logs
         WHERE restaurant_id=$1 AND employee_id=$2
           AND punched_at >= NOW() - INTERVAL '36 hours'
         ORDER BY punched_at DESC LIMIT 1`,
        [req.user.restaurantId, req.user.id]
      ),
    ]);

    // Attendance: clocked in if the most recent punch within 36h is clock_in
    const lastPunch   = attendResult.rows[0] || null;
    const isClockedIn = lastPunch?.log_type === 'clock_in';
    const attendance  = { is_clocked_in: isClockedIn, clocked_in_at: isClockedIn ? lastPunch.punched_at : null };

    let todayShifts = shiftResult.rows;

    if (!todayShifts.length)
      return res.json({ shift: null, shifts: [], allowed: false, reason: 'No shift scheduled for today', attendance });

    // Find the best "active" shift: in_process first, then any active (employee explicitly opened it)
    const activeShift = todayShifts.find(s => s.status === 'in_process')
      || todayShifts.find(s => s.status === 'active');

    if (activeShift) {
      if (!isClockedIn)
        return res.json({ shift: activeShift, shifts: todayShifts, allowed: false, reason: 'You must be clocked in to place orders', attendance });
      return res.json({ shift: activeShift, shifts: todayShifts, allowed: true, reason: null, attendance });
    }

    // No active shift — find why
    const scheduledNow = todayShifts.find(s => s.status === 'scheduled' && isTimeWithinShiftWindow(now, s.start_time, s.end_time));
    if (scheduledNow) {
      todayShifts = [scheduledNow, ...todayShifts.filter(s => s.id !== scheduledNow.id)];
      return res.json({ shift: scheduledNow, shifts: todayShifts, allowed: false, reason: 'Start your shift before placing orders', attendance });
    }

    const absentShift = todayShifts.find(s => s.status === 'absent');
    if (absentShift && todayShifts.every(s => s.status === 'absent'))
      return res.json({ shift: absentShift, shifts: todayShifts, allowed: false, reason: 'You are marked absent for today', attendance });

    const allDone = todayShifts.every(s => ['completed','absent'].includes(s.status));
    if (allDone)
      return res.json({ shift: todayShifts[todayShifts.length - 1], shifts: todayShifts, allowed: false, reason: 'All your shifts have ended for today', attendance });

    // Scheduled but outside hours
    const upcoming = todayShifts.find(s => s.status === 'scheduled' && timeToMinutes(now) < timeToMinutes(s.start_time));
    if (upcoming)
      return res.json({ shift: upcoming, shifts: todayShifts, allowed: false, reason: `Next shift starts at ${upcoming.start_time.slice(0,5)}`, attendance });

    return res.json({ shift: todayShifts[0], shifts: todayShifts, allowed: false, reason: 'No active shift right now', attendance });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

exports.createShift = async (req, res) => {
  try {
    const {
      employee_id, shift_name, start_time, end_time, date, date_from, date_to, notes,
      working_days, allow_multiple_per_day, require_balance, status,
    } = req.body;
    const fromDate = date_from || date;
    const toDate = date_to || date || date_from;
    if (!employee_id || !shift_name || !start_time || !end_time || !fromDate)
      return res.status(400).json({ error: 'employee_id, shift_name, start_time, end_time, date/date_from required' });

    const numRes = await db.query(
      `SELECT COALESCE(MAX(shift_number), 0) + 1 AS next_num FROM shifts WHERE restaurant_id=$1`,
      [req.user.restaurantId]
    );
    const shiftNumber = numRes.rows[0].next_num;
    const daysOfWeek = normalizeWorkingDays(working_days, false);

    const result = await db.query(
      `INSERT INTO shifts(
         restaurant_id, employee_id, shift_name, start_time, end_time, date, date_from, date_to,
       working_days, allow_multiple_per_day, require_balance, schedule_type, status, notes, shift_number
       )
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        req.user.restaurantId, employee_id, shift_name, start_time, end_time, fromDate,
        fromDate, toDate || fromDate, daysOfWeek, allow_multiple_per_day !== false,
        require_balance !== false, (toDate && toDate !== fromDate) ? 'range' : 'single',
        status || 'scheduled', notes || null, shiftNumber,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status, notes, shift_name, start_time, end_time, employee_id,
      date, date_from, date_to, working_days, allow_multiple_per_day, require_balance,
    } = req.body;
    const fromDate = date_from || date || null;
    const toDate = date_to || fromDate;
    const daysOfWeek = Array.isArray(working_days) ? normalizeWorkingDays(working_days, false) : null;
    const result = await db.query(
      `UPDATE shifts SET
         status=COALESCE($1,status), notes=COALESCE($2,notes),
         shift_name=COALESCE($3,shift_name), start_time=COALESCE($4,start_time), end_time=COALESCE($5,end_time),
         employee_id=COALESCE($6,employee_id),
         date=COALESCE($7,date),
         date_from=COALESCE($8,date_from),
         date_to=COALESCE($9,date_to),
         working_days=COALESCE($10::int[],working_days),
         allow_multiple_per_day=COALESCE($11,allow_multiple_per_day),
         require_balance=COALESCE($12,require_balance),
         schedule_type=CASE
           WHEN COALESCE($9,date_to) IS NOT NULL AND COALESCE($8,date_from,date) IS NOT NULL
             AND COALESCE($9,date_to) <> COALESCE($8,date_from,date)
           THEN 'range'
           ELSE schedule_type
         END
       WHERE id=$13 AND restaurant_id=$14 RETURNING *`,
      [
        status || null, notes ?? null, shift_name || null, start_time || null, end_time || null,
        employee_id || null, fromDate, fromDate, toDate, daysOfWeek,
        allow_multiple_per_day === undefined ? null : allow_multiple_per_day,
        require_balance === undefined ? null : require_balance,
        id, req.user.restaurantId,
      ]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Shift not found' });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.deleteShift = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM shifts WHERE id=$1 AND restaurant_id=$2`, [id, req.user.restaurantId]);
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

// ── reservations ──────────────────────────────────────────────────────────────
exports.getReservations = async (req, res) => {
  try {
    const { date, status } = req.query;
    let where = ['r.restaurant_id=$1'];
    const params = [req.user.restaurantId];
    let idx = 2;
    if (date)   { where.push(`DATE(r.reserved_at)=$${idx++}`); params.push(date); }
    if (status) { where.push(`r.status=$${idx++}`);           params.push(status); }

    const result = await db.query(
      `SELECT r.*, dt.label as table_label, dt.capacity as table_capacity
       FROM reservations r
       LEFT JOIN dining_tables dt ON r.table_id = dt.id
       WHERE ${where.join(' AND ')}
       ORDER BY r.reserved_at ASC`,
      params
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.createReservation = async (req, res) => {
  try {
    const { table_id, guest_name, guest_phone, guest_count, reserved_at, duration_min, notes } = req.body;
    if (!guest_name || !reserved_at) return res.status(400).json({ error: 'guest_name and reserved_at required' });
    const result = await db.query(
      `INSERT INTO reservations(restaurant_id,table_id,guest_name,guest_phone,guest_count,reserved_at,duration_min,notes,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'confirmed') RETURNING *`,
      [req.user.restaurantId, table_id||null, guest_name, guest_phone||null, guest_count||1, reserved_at, duration_min||90, notes||null]
    );
    // Mark table reserved only if the reservation is for today
    if (table_id) {
      await db.query(
        `UPDATE dining_tables SET status='reserved'
         WHERE id=$1 AND DATE($2::timestamptz) = CURRENT_DATE`,
        [table_id, reserved_at]
      );
    }
    res.status(201).json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.updateReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, table_id, guest_count } = req.body;
    const result = await db.query(
      `UPDATE reservations SET
         status=COALESCE($1,status), notes=COALESCE($2,notes),
         table_id=COALESCE($3,table_id), guest_count=COALESCE($4,guest_count)
       WHERE id=$5 AND restaurant_id=$6 RETURNING *`,
      [status||null, notes||null, table_id||null, guest_count||null, id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    // Release table when cancelled or marked no_show
    if (['cancelled','no_show'].includes(status) && result.rows[0].table_id) {
      await db.query(`UPDATE dining_tables SET status='vacant' WHERE id=$1 AND status='reserved'`, [result.rows[0].table_id]);
    }
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

// ── setup wizard ──────────────────────────────────────────────────────────────
// POST /api/setup/complete  — called by onboarding wizard to finish restaurant setup
exports.completeSetup = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId } = req.user;
    const { tables, categories, restaurant_info } = req.body;

    // Update restaurant info if provided
    if (restaurant_info) {
      const { name, phone, address, city, country, currency, timezone, tagline } = restaurant_info;
      await client.query(
        `UPDATE restaurants
         SET name=COALESCE($1,name), phone=COALESCE($2,phone),
             address=COALESCE($3,address), city=COALESCE($4,city),
             country=COALESCE($5,country), currency=COALESCE($6,currency),
             timezone=COALESCE($7,timezone),
             settings=jsonb_set(COALESCE(settings,'{}'), '{tagline}', to_jsonb($8::text))
         WHERE id=$9`,
        [name||null, phone||null, address||null, city||null,
         country||null, currency||null, timezone||null,
         tagline||'', restaurantId]
      );
    }

    // Create tables
    if (tables && tables.length) {
      for (const t of tables) {
        // Skip if already exists
        const exists = await client.query(
          `SELECT id FROM dining_tables WHERE restaurant_id=$1 AND label=$2`,
          [restaurantId, t.label]
        );
        if (!exists.rows.length) {
          await client.query(
            `INSERT INTO dining_tables(restaurant_id,label,section,capacity,status)
             VALUES($1,$2,$3,$4,'vacant')`,
            [restaurantId, t.label, t.section||'Main Hall', t.capacity||4]
          );
        }
      }
    }

    // Create menu categories
    if (categories && categories.length) {
      for (let i = 0; i < categories.length; i++) {
        const cat = categories[i];
        const exists = await client.query(
          `SELECT id FROM categories WHERE restaurant_id=$1 AND name=$2`,
          [restaurantId, cat.name]
        );
        if (!exists.rows.length) {
          await client.query(
            `INSERT INTO categories(restaurant_id,name,sort_order)
             VALUES($1,$2,$3)`,
            [restaurantId, cat.name, cat.sort_order||i+1]
          );
        }
      }
    }

    // Mark setup as complete
    await client.query(
      `UPDATE restaurants SET settings=jsonb_set(COALESCE(settings,'{}'),'{setup_complete}','true') WHERE id=$1`,
      [restaurantId]
    );

    await client.query('COMMIT');
    res.json({ success: true, message: 'Setup complete!' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

exports.getSetupStatus = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const [rest, tables, cats, items, employees] = await Promise.all([
      db.query(`SELECT name,slug,status,settings FROM restaurants WHERE id=$1`, [restaurantId]),
      db.query(`SELECT COUNT(*) as count FROM dining_tables WHERE restaurant_id=$1`, [restaurantId]),
      db.query(`SELECT COUNT(*) as count FROM categories WHERE restaurant_id=$1`, [restaurantId]),
      db.query(`SELECT COUNT(*) as count FROM menu_items WHERE restaurant_id=$1`, [restaurantId]),
      db.query(`SELECT COUNT(*) as count FROM employees WHERE restaurant_id=$1`, [restaurantId]),
    ]);
    const r = rest.rows[0];
    res.json({
      restaurant:     r,
      setup_complete: r?.settings?.setup_complete === true,
      steps: {
        restaurant_info: !!(r?.name && r?.settings),
        tables:          parseInt(tables.rows[0].count) > 0,
        menu_categories: parseInt(cats.rows[0].count) > 0,
        menu_items:      parseInt(items.rows[0].count) > 0,
        staff:           parseInt(employees.rows[0].count) > 1, // >1 because admin already exists
      },
      counts: {
        tables:    parseInt(tables.rows[0].count),
        categories: parseInt(cats.rows[0].count),
        items:     parseInt(items.rows[0].count),
        employees: parseInt(employees.rows[0].count),
      },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── restaurant settings ────────────────────────────────────────────────────────
exports.getRestaurantSettings = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT settings, logo_url, name FROM restaurants WHERE id=$1`, [req.user.restaurantId]
    );
    const row = result.rows[0] || {};
    res.json({ ...(row.settings || {}), logo_url: row.logo_url, name: row.name });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.updateRestaurantSettings = async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE restaurants SET settings = settings || $1::jsonb WHERE id=$2 RETURNING settings`,
      [JSON.stringify(req.body), req.user.restaurantId]
    );
    res.json(result.rows[0]?.settings || {});
  } catch { res.status(500).json({ error: 'Server error' }); }
};

// ── restaurant logo upload ─────────────────────────────────────────────────────
exports.uploadRestaurantLogo = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = req.file.path && req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    await db.query(`UPDATE restaurants SET logo_url=$1 WHERE id=$2`, [url, req.user.restaurantId]);
    res.json({ url });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
};

// ── System Config (super admin) ───────────────────────────────────────────────
const SMTP_KEYS = [
  'email.provider', 'email.api_key', 'email.mg_domain',
  'smtp.host', 'smtp.port', 'smtp.secure', 'smtp.user', 'smtp.pass', 'smtp.from',
  'smtp.reject_unauthorized', 'app.admin_email',
];

exports.getSystemConfig = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT key, value FROM system_config WHERE key = ANY($1)`, [SMTP_KEYS]
    );
    const config = {};
    for (const r of rows.rows) config[r.key] = r.value;
    if (config['smtp.pass']) config['smtp.pass'] = '••••••••';
    res.json(config);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

exports.saveSystemConfig = async (req, res) => {
  try {
    const { setConfig } = require('../utils/config');
    for (const [key, value] of Object.entries(req.body)) {
      if (!SMTP_KEYS.includes(key)) continue;
      if (key === 'smtp.pass' && String(value).includes('••')) continue;
      await setConfig(key, String(value));
    }
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

exports.testSmtp = async (req, res) => {
  try {
    const { getConfig } = require('../utils/config');
    const { sendEmail } = require('../utils/email');
    const { to } = req.body;
    if (!to) return res.status(400).json({ error: 'Recipient email (to) is required' });

    const provider = (await getConfig('email.provider', 'EMAIL_PROVIDER')) || 'smtp';

    // For SMTP provider only — do TCP pre-flight so error is immediate and clear
    if (provider === 'smtp') {
      const dns = require('dns').promises;
      const net = require('net');
      const host = await getConfig('smtp.host', 'SMTP_HOST');
      const port = parseInt(await getConfig('smtp.port', 'SMTP_PORT')) || 587;
      if (!host) return res.status(400).json({ error: 'SMTP Host not configured', code: 'EMISSINGHOST' });

      let resolvedIP = null;
      try { [resolvedIP] = await dns.resolve4(host); }
      catch (e) { return res.status(400).json({ error: `DNS failed for "${host}": ${e.message}`, code: 'EDNS', hint: 'Check the SMTP Host spelling.' }); }

      const tcp = await new Promise(resolve => {
        const sock = new net.Socket();
        const done = (ok, msg) => { sock.destroy(); resolve({ ok, msg }); };
        sock.setTimeout(6000);
        sock.on('connect', () => done(true, null));
        sock.on('timeout', () => done(false, `TCP timeout on port ${port}`));
        sock.on('error',   e  => done(false, `TCP error: ${e.message}`));
        sock.connect(port, host);
      });
      if (!tcp.ok) {
        return res.status(400).json({
          error: tcp.msg,
          code: 'ETCP',
          resolvedIP,
          hint: `Your server cannot reach ${host}:${port}. Hosting providers (Railway, Render, etc.) block outbound SMTP ports. Switch to an API provider (Resend, Mailgun, or SendGrid) — they send over HTTPS port 443 which is always open.`,
        });
      }
    }

    const result = await sendEmail(to, 'RestaurantOS — Email Test', `
      <div style="font-family:sans-serif;padding:24px;max-width:480px">
        <h2 style="color:#2ecc71">✅ Email Test Successful</h2>
        <p>Your email configuration is working correctly.</p>
        <p style="font-size:12px;color:#888">Provider: ${provider}</p>
      </div>`);

    res.json({ ok: true, sentTo: to, provider, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message, code: err.code || null });
  }
};

exports.testWhatsApp = async (req, res) => {
  try {
    const { sendWhatsApp } = require('../utils/whatsapp');
    const { to, phone_number_id, access_token } = req.body;
    if (!to || !phone_number_id || !access_token)
      return res.status(400).json({ error: 'to, phone_number_id and access_token are required' });
    const result = await sendWhatsApp(to, 'RestaurantOS WhatsApp test message ✅', { phone_number_id, access_token });
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
};

// ── employee photo upload ──────────────────────────────────────────────────────
exports.uploadEmployeePhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = req.file.path && req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    const result = await db.query(
      `UPDATE employees SET avatar_url=$1 WHERE id=$2 AND restaurant_id=$3 RETURNING id,avatar_url`,
      [url, req.params.id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Employee not found' });
    res.json({ url });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
};

// ── table overtime alert ───────────────────────────────────────────────────────
exports.createOvertimeAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { tableLabel, elapsedMinutes, thresholdHours } = req.body;
    const hrs = Math.max(1, Number(thresholdHours) || 2);

    // Prevent duplicate: skip if a notification already exists within the threshold window
    const existing = await db.query(
      `SELECT id FROM notifications
       WHERE restaurant_id=$1 AND type='table_overtime' AND reference_id=$2
         AND created_at > NOW() - ($3::int * INTERVAL '1 hour')`,
      [req.user.restaurantId, id, hrs]
    );
    if (existing.rows.length > 0) return res.json({ skipped: true });

    const h = Math.floor(elapsedMinutes / 60);
    const m = elapsedMinutes % 60;
    const timeStr = h > 0 ? `${h}h ${m}m` : `${m}m`;

    await db.query(
      `INSERT INTO notifications(restaurant_id,type,title,message,severity,reference_id,reference_type)
       VALUES($1,'table_overtime',$2,$3,'high',$4,'table')`,
      [
        req.user.restaurantId,
        `⏰ Table ${tableLabel} — Overtime`,
        `Table ${tableLabel} has been occupied for ${timeStr}, exceeding the ${hrs}h limit.`,
        id,
      ]
    );

    req.app.get('io')?.to(req.user.restaurantId).emit('overtime_alert', { tableId: id, tableLabel, elapsedMinutes });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── Open / expired shifts ──────────────────────────────────────────────────────

/** Shared helper: close one shift and auto clock-out if the employee is still clocked in */
async function _closeShift(client, restaurantId, shift, closedBy, clockOutAt = null) {
  // Normalise shift.date — pg returns DATE as string 'YYYY-MM-DD'; fall back to today
  const today = localDateString();
  const shiftDateStr = shift.date
    ? (shift.date instanceof Date ? localDateString(shift.date) : String(shift.date).slice(0, 10))
    : today;

  // end_time is stored as HH:MM:SS by PostgreSQL — use first 8 chars to avoid double-seconds
  const timeStr = (shift.end_time || '23:59:59').slice(0, 8);
  const shiftEndTs = new Date(`${shiftDateStr}T${timeStr}`); // local time
  const clockOutTs = clockOutAt || (isNaN(shiftEndTs.getTime()) ? new Date() : shiftEndTs);

  if (shift.session_id) {
    await client.query(
      `UPDATE shift_sessions SET status='completed', closed_at=$3, updated_at=NOW()
       WHERE id=$1 AND restaurant_id=$2`,
      [shift.session_id, restaurantId, clockOutTs]
    );
  } else {
    await client.query(
      `UPDATE shifts SET status='completed', updated_at=NOW() WHERE id=$1 AND restaurant_id=$2`,
      [shift.id, restaurantId]
    );
  }

  // Skip attendance auto-close if no employee is linked to this shift
  if (!shift.employee_id) return;

  // Check for an open clock-in (no matching clock-out) within last 36h
  const openLog = await client.query(
    `SELECT al.id, al.punched_at FROM attendance_logs al
     WHERE al.employee_id=$1 AND al.log_type='clock_in' AND al.is_voided=FALSE
       AND al.punched_at >= NOW() - INTERVAL '36 hours'
       AND NOT EXISTS (
         SELECT 1 FROM attendance_logs co
         WHERE co.employee_id=$1 AND co.log_type='clock_out'
           AND co.is_voided=FALSE AND co.punched_at > al.punched_at
       )
     ORDER BY al.punched_at DESC LIMIT 1`,
    [shift.employee_id]
  );

  if (openLog.rows.length) {
    // Use the date from the open clock-in record as attendance_date (most reliable)
    const clockInDate = localDateString(openLog.rows[0].punched_at);
    await client.query(
      `INSERT INTO attendance_logs(restaurant_id, employee_id, shift_id, log_type,
         punched_at, attendance_date, source, notes, created_by)
       VALUES($1,$2,$3,'clock_out',$4,$5,'manual','Auto clock-out at shift end',$6)`,
      [restaurantId, shift.employee_id, shift.id, clockOutTs, clockInDate, closedBy || null]
    );
  }
}

// GET /shifts/open — all expired shifts that are still open
exports.getOpenShifts = async (req, res) => {
  try {
    const rid = req.user.restaurantId;
    const today = localDateString();
    const nowTime = new Date().toTimeString().slice(0, 5);

    const result = await db.query(
      `SELECT s.*, sess.id AS session_id, sess.shift_date AS date, sess.status,
              sess.opening_balance, sess.closing_cash,
              e.full_name as employee_name, e.avatar_url, r.name as role_name
       FROM shift_sessions sess
       JOIN shifts s ON sess.shift_id=s.id
       JOIN employees e ON s.employee_id = e.id
       LEFT JOIN roles r ON e.role_id = r.id
       WHERE sess.restaurant_id=$1
         AND (
           (sess.status='active' AND (sess.shift_date < $2 OR (sess.shift_date = $2 AND s.end_time < $3)))
           OR sess.status = 'in_process'
         )
       ORDER BY sess.shift_date DESC, s.end_time DESC`,
      [rid, today, nowTime]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /shifts/:id/force-close — manager force-closes one shift
exports.forceCloseShift = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const { id } = req.params;

    const sr = await client.query(
      `SELECT s.*, sess.id AS session_id, sess.shift_date AS date, sess.status,
              sess.opening_balance, sess.closing_cash
       FROM shifts s
       LEFT JOIN shift_sessions sess ON sess.shift_id=s.id AND sess.status IN ('active','in_process')
       WHERE s.id=$1 AND s.restaurant_id=$2
       ORDER BY sess.opened_at DESC NULLS LAST
       LIMIT 1`,
      [id, rid]
    );
    if (!sr.rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Shift not found' }); }
    const shift = sr.rows[0];

    await _closeShift(client, rid, shift, req.user.id);
    await client.query('COMMIT');

    // Recompute attendance (background, non-blocking)
    try {
      const { recomputeEmployee } = require('./attendanceController');
      recomputeEmployee(rid, shift.employee_id, shift.date).catch(() => {});
    } catch (_) {}

    res.json({ success: true, shift_id: id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[forceCloseShift]', err.message, err.detail || '');
    res.status(500).json({ error: err.message || 'Server error' });
  } finally { client.release(); }
};

// POST /shifts/auto-close — close ALL expired open shifts for this restaurant
exports.autoCloseShifts = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const today = localDateString();
    const nowTime = new Date().toTimeString().slice(0, 5);

    const expired = await client.query(
      `SELECT s.*, sess.id AS session_id, sess.shift_date AS date, sess.status,
              sess.opening_balance, sess.closing_cash
       FROM shift_sessions sess
       JOIN shifts s ON sess.shift_id=s.id
       WHERE sess.restaurant_id=$1 AND sess.status='active'
         AND (sess.shift_date < $2 OR (sess.shift_date = $2 AND s.end_time < $3))`,
      [rid, today, nowTime]
    );

    for (const shift of expired.rows) {
      await _closeShift(client, rid, shift, req.user.id);
    }
    await client.query('COMMIT');

    // Recompute attendance for all affected employees (background)
    try {
      const { recomputeEmployee } = require('./attendanceController');
      for (const shift of expired.rows) {
        recomputeEmployee(rid, shift.employee_id, shift.date).catch(() => {});
      }
    } catch (_) {}

    res.json({ closed: expired.rows.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// GET /shifts/my — logged-in employee's own shift history
exports.getMyShifts = async (req, res) => {
  try {
    const result = await db.query(
      `${shiftSelect}
       JOIN LATERAL (
         SELECT gs::date AS shift_date
         FROM generate_series(
           GREATEST(COALESCE(s.date_from, s.date), CURRENT_DATE - INTERVAL '90 days'),
           LEAST(COALESCE(s.date_to, s.date), CURRENT_DATE + INTERVAL '90 days'),
           INTERVAL '1 day'
         ) gs
         WHERE EXTRACT(ISODOW FROM gs)::INT = ANY(COALESCE(s.working_days, ARRAY[EXTRACT(ISODOW FROM COALESCE(s.date_from, s.date))::INT]))
       ) d ON TRUE
       LEFT JOIN shift_sessions sess ON sess.shift_id=s.id AND sess.shift_date=d.shift_date
       WHERE s.restaurant_id=$1 AND s.employee_id=$2
       ORDER BY d.shift_date DESC, s.start_time DESC
       LIMIT 60`,
      [req.user.restaurantId, req.user.id]
    );
    res.json(result.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /shifts/:id/start — employee starts their own scheduled shift
exports.startMyShift = async (req, res) => {
  try {
    const { id } = req.params;
    const timeZone = await getRestaurantTimezone(req.user.restaurantId);
    const today = (req.body.shift_date || localDateString(new Date(), timeZone)).slice(0, 10);
    const currentDate = localDateString(new Date(), timeZone);
    const now = localTimeString(new Date(), timeZone);
    const openingBalance = parseFloat(req.body.opening_balance) || 0;
    const canManageShifts = (req.user.permissions || []).some(p => ['shift_management', 'settings'].includes(p));
    const params = [id, req.user.restaurantId, today];
    const employeeFilter = canManageShifts ? '' : 'AND employee_id=$4';
    if (!canManageShifts) params.push(req.user.id);
    const schedule = await db.query(
      `SELECT * FROM shifts
       WHERE id=$1 AND restaurant_id=$2 ${employeeFilter}
         AND COALESCE(date_from, date) <= $3::date
         AND COALESCE(date_to, date) >= $3::date
         AND EXTRACT(ISODOW FROM $3::date)::INT = ANY(COALESCE(working_days, ARRAY[EXTRACT(ISODOW FROM COALESCE(date_from, date))::INT]))
         AND status <> 'absent'
       LIMIT 1`,
      params
    );
    if (!schedule.rows.length)
      return res.status(400).json({ error: 'Shift not found or cannot be started' });

    const scheduledShift = schedule.rows[0];
    if (!isShiftOpenableNow({
      shiftDate: today,
      currentDate,
      nowTime: now,
      startTime: scheduledShift.start_time,
      endTime: scheduledShift.end_time,
    })) {
      return res.status(400).json({
        error: `Shift can only be opened between ${String(scheduledShift.start_time).slice(0, 5)} and ${String(scheduledShift.end_time).slice(0, 5)}`,
      });
    }

    const activeForEmployee = await db.query(
      `SELECT sess.id, sess.shift_id, sess.shift_date, sess.status, s.shift_name
       FROM shift_sessions sess
       JOIN shifts s ON s.id=sess.shift_id
       WHERE sess.restaurant_id=$1
         AND sess.employee_id=$2
         AND sess.status IN ('active','in_process')
         AND sess.shift_id <> $3
       ORDER BY sess.opened_at DESC
       LIMIT 1`,
      [req.user.restaurantId, scheduledShift.employee_id, id]
    );
    if (activeForEmployee.rows.length) {
      const activeShift = activeForEmployee.rows[0];
      return res.status(400).json({
        error: `Close ${activeShift.shift_name || 'the active shift'} before opening another shift`,
      });
    }

    const existing = await db.query(
      `SELECT * FROM shift_sessions
       WHERE shift_id=$1 AND shift_date=$2::date AND status IN ('active','in_process')
       LIMIT 1`,
      [id, today]
    );
    if (existing.rows.length) {
      return res.json({
        ...scheduledShift,
        ...existing.rows[0],
        id: scheduledShift.id,
        date: today,
        status: existing.rows[0].status,
        session_id: existing.rows[0].id,
      });
    }

    const result = await db.query(
      `INSERT INTO shift_sessions(shift_id, restaurant_id, employee_id, shift_date, status, opening_balance, opened_at)
       VALUES($1,$2,$3,$4::date,'active',$5,NOW())
       RETURNING *`,
      [id, req.user.restaurantId, scheduledShift.employee_id, today, openingBalance]
    );
    res.json({
      ...scheduledShift,
      ...result.rows[0],
      id: scheduledShift.id,
      date: today,
      status: result.rows[0].status,
      session_id: result.rows[0].id,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /shifts/:id/continue — employee continues working past shift end_time (active → in_process)
exports.continueMyShift = async (req, res) => {
  try {
    const { id } = req.params;
    const timeZone = await getRestaurantTimezone(req.user.restaurantId);
    const today = (req.body?.shift_date || localDateString(new Date(), timeZone)).slice(0, 10);
    const currentDate = localDateString(new Date(), timeZone);
    const now = localTimeString(new Date(), timeZone);
    const canManageShifts = (req.user.permissions || []).some(p => ['shift_management', 'settings'].includes(p));
    const params = [id, req.user.restaurantId, today];
    const employeeFilter = canManageShifts ? '' : 'AND employee_id=$4';
    if (!canManageShifts) params.push(req.user.id);
    const shift = await db.query(
      `SELECT s.*, sess.id AS session_id, sess.status AS session_status,
              sess.opening_balance, sess.closing_cash, sess.shift_date AS date
       FROM shifts s
       JOIN shift_sessions sess ON sess.shift_id=s.id AND sess.shift_date=$3::date
       WHERE s.id=$1 AND s.restaurant_id=$2 ${employeeFilter}
         AND sess.status='active'
       LIMIT 1`,
      params
    );
    if (!shift.rows.length)
      return res.status(400).json({ error: 'Shift not found or not active' });

    const activeShift = shift.rows[0];
    if (isShiftOpenableNow({
      shiftDate: today,
      currentDate,
      nowTime: now,
      startTime: activeShift.start_time,
      endTime: activeShift.end_time,
    })) {
      return res.json({ ...activeShift, status: 'active', date: today, session_id: activeShift.session_id });
    }

    const result = await db.query(
      `UPDATE shift_sessions SET status='in_process', updated_at=NOW()
       WHERE shift_id=$1 AND restaurant_id=$2 ${employeeFilter}
         AND shift_date=$3::date AND status='active'
       RETURNING *`,
      params
    );
    res.json({ ...result.rows[0], date: today, session_id: result.rows[0].id });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /shifts/:id/close-my — employee closes their own shift; clock-out at NOW()
exports.closeMyShift = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const { id } = req.params;
    const requestedDate = req.body?.shift_date ? String(req.body.shift_date).slice(0, 10) : null;
    const canManageShifts = (req.user.permissions || []).some(p => ['shift_management', 'settings'].includes(p));
    const params = [id, rid];
    const filters = [
      `s.id=$1`,
      `s.restaurant_id=$2`,
      `sess.status IN ('active','in_process')`,
    ];
    let idx = 3;
    if (!canManageShifts) {
      filters.push(`s.employee_id=$${idx++}`);
      params.push(req.user.id);
    }
    if (requestedDate) {
      filters.push(`sess.shift_date=$${idx++}::date`);
      params.push(requestedDate);
    }

    let sr = await client.query(
      `SELECT s.*, sess.id AS session_id, sess.status, sess.opening_balance, sess.closing_cash,
              sess.cashier_collection, sess.shift_date AS date
       FROM shifts s
       JOIN shift_sessions sess ON sess.shift_id=s.id
       WHERE ${filters.join(' AND ')}
       ORDER BY sess.opened_at DESC NULLS LAST, sess.created_at DESC
       LIMIT 1`,
      params
    );
    if (!sr.rows.length && requestedDate) {
      const fallbackFilters = filters.filter(f => !f.includes('sess.shift_date='));
      const fallbackParams = params.slice(0, -1);
      sr = await client.query(
        `SELECT s.*, sess.id AS session_id, sess.status, sess.opening_balance, sess.closing_cash,
                sess.cashier_collection, sess.shift_date AS date
         FROM shifts s
         JOIN shift_sessions sess ON sess.shift_id=s.id
         WHERE ${fallbackFilters.join(' AND ')}
         ORDER BY sess.opened_at DESC NULLS LAST, sess.created_at DESC
         LIMIT 1`,
        fallbackParams
      );
    }
    if (!sr.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Shift not found or already closed' });
    }
    const shift = sr.rows[0];
    const hasCashierCollection = req.body?.cashier_collection !== undefined && req.body?.cashier_collection !== '';
    const cashierCollection = hasCashierCollection ? Number(req.body.cashier_collection) : NaN;
    if (!Number.isFinite(cashierCollection) || cashierCollection < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cashier collection amount is required' });
    }

    await _closeShift(client, rid, shift, req.user.id, new Date());

    // Compute cash sales for this opened shift session only.
    const cashResult = await client.query(
      `SELECT COALESCE(SUM(total_amount),0) AS cash_sales
       FROM orders
       WHERE shift_session_id=$1 AND payment_method='cash' AND payment_status='paid'`,
      [shift.session_id]
    );
    const closingCash = parseFloat(cashResult.rows[0].cash_sales) + parseFloat(shift.opening_balance || 0);
    await client.query(
      `UPDATE shift_sessions
       SET closing_cash=$1, cashier_collection=$2, updated_at=NOW()
       WHERE id=$3`,
      [closingCash, cashierCollection, shift.session_id]
    );

    await client.query('COMMIT');

    try {
      const { recomputeEmployee } = require('./attendanceController');
      recomputeEmployee(rid, shift.employee_id, shift.date).catch(() => {});
    } catch (_) {}

    res.json({
      success: true,
      closing_cash: closingCash,
      expected_closing: closingCash,
      cashier_collection: cashierCollection,
      variance: cashierCollection - closingCash,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// GET /shifts/:id/cash-summary — opening balance, cash sales, expected closing
exports.getShiftCashSummary = async (req, res) => {
  try {
    const { id } = req.params;
    const shift = await db.query(
      `SELECT s.id,
              COALESCE(sess.opening_balance, s.opening_balance) AS opening_balance,
              COALESCE(sess.closing_cash, s.closing_cash) AS closing_cash,
              sess.cashier_collection,
              sess.id AS session_id
       FROM shifts s
       LEFT JOIN shift_sessions sess ON sess.shift_id=s.id
         AND sess.status IN ('active','in_process','completed')
       WHERE s.id=$1 AND s.restaurant_id=$2
       ORDER BY sess.opened_at DESC NULLS LAST
       LIMIT 1`,
      [id, req.user.restaurantId]
    );
    if (!shift.rows.length) return res.status(404).json({ error: 'Shift not found' });
    const sessionId = shift.rows[0].session_id;
    const cashResult = await db.query(
      `SELECT COALESCE(SUM(total_amount),0) AS cash_sales
       FROM orders
       WHERE shift_session_id=$1
         AND payment_method='cash' AND payment_status='paid'`,
      [sessionId]
    );
    const openingBalance = parseFloat(shift.rows[0].opening_balance || 0);
    const cashSales = parseFloat(cashResult.rows[0].cash_sales);
    const expectedClosing = openingBalance + cashSales;
    const closingCash = shift.rows[0].closing_cash == null ? expectedClosing : parseFloat(shift.rows[0].closing_cash);
    const cashierCollection = shift.rows[0].cashier_collection == null ? null : parseFloat(shift.rows[0].cashier_collection);
    res.json({
      opening_balance: openingBalance,
      cash_sales: cashSales,
      expected_closing: expectedClosing,
      closing_cash: closingCash,
      cashier_collection: cashierCollection,
      variance: cashierCollection == null ? null : cashierCollection - expectedClosing,
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// ── Discount Presets ──────────────────────────────────────────────────────────

// GET /discount-presets
exports.getDiscountPresets = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM discount_presets WHERE restaurant_id=$1 ORDER BY sort_order, name`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// POST /discount-presets
exports.createDiscountPreset = async (req, res) => {
  try {
    const { name, type, value, is_active = true, sort_order = 0 } = req.body;
    if (!name || !type || value === undefined)
      return res.status(400).json({ error: 'name, type and value are required' });
    const result = await db.query(
      `INSERT INTO discount_presets (restaurant_id, name, type, value, is_active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.restaurantId, name, type, value, is_active, sort_order]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A preset with this name already exists' });
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
};

// PUT /discount-presets/:id
exports.updateDiscountPreset = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, type, value, is_active, sort_order } = req.body;
    const result = await db.query(
      `UPDATE discount_presets SET name=$1, type=$2, value=$3, is_active=$4, sort_order=$5
       WHERE id=$6 AND restaurant_id=$7 RETURNING *`,
      [name, type, value, is_active, sort_order, id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Preset not found' });
    res.json(result.rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'A preset with this name already exists' });
    console.error(e); res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /discount-presets/:id
exports.deleteDiscountPreset = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(
      `DELETE FROM discount_presets WHERE id=$1 AND restaurant_id=$2`,
      [id, req.user.restaurantId]
    );
    res.json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};
