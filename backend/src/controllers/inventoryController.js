const db = require('../config/db');

// ─── GET all items ─────────────────────────────────────────────────────────────
exports.getInventory = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { category, search } = req.query;
    let where = ['restaurant_id=$1'];
    const params = [restaurantId];
    let idx = 2;
    if (category && category !== 'all') { where.push(`category=$${idx++}`); params.push(category); }
    if (search) { where.push(`name ILIKE $${idx++}`); params.push(`%${search}%`); }

    const result = await db.query(
      `SELECT *,
        CASE
          WHEN stock_quantity <= min_quantity * 0.5 THEN 'critical'
          WHEN stock_quantity <= min_quantity       THEN 'low'
          ELSE 'ok'
        END as alert_status,
        ROUND((stock_quantity::numeric / NULLIF(max_quantity,0)) * 100, 1) as stock_pct
       FROM inventory_items
       WHERE ${where.join(' AND ')}
       ORDER BY category, name`,
      params
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ─── CREATE item ───────────────────────────────────────────────────────────────
exports.createItem = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { name, unit, stock_quantity, min_quantity, max_quantity, cost_per_unit, supplier, category, barcode } = req.body;
    if (!name || !unit) return res.status(400).json({ error: 'name and unit required' });
    const result = await db.query(
      `INSERT INTO inventory_items(restaurant_id,name,unit,stock_quantity,min_quantity,max_quantity,cost_per_unit,supplier,category,barcode)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [restaurantId, name, unit,
       stock_quantity||0, min_quantity||0, max_quantity||100,
       cost_per_unit||0, supplier||null, category||'General', barcode||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Item with this name already exists' });
    console.error(err); res.status(500).json({ error: 'Server error' });
  }
};

// ─── UPDATE item details ───────────────────────────────────────────────────────
exports.updateItem = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { id } = req.params;
    const { name, unit, min_quantity, max_quantity, cost_per_unit, supplier, category, barcode } = req.body;
    const result = await db.query(
      `UPDATE inventory_items
       SET name=COALESCE($1,name), unit=COALESCE($2,unit),
           min_quantity=COALESCE($3,min_quantity), max_quantity=COALESCE($4,max_quantity),
           cost_per_unit=COALESCE($5,cost_per_unit), supplier=COALESCE($6,supplier),
           category=COALESCE($7,category), barcode=COALESCE($8,barcode)
       WHERE id=$9 AND restaurant_id=$10 RETURNING *`,
      [name||null, unit||null, min_quantity||null, max_quantity||null,
       cost_per_unit||null, supplier||null, category||null, barcode||null,
       id, restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ─── DELETE item ───────────────────────────────────────────────────────────────
exports.deleteItem = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { id } = req.params;
    await db.query(`DELETE FROM inventory_items WHERE id=$1 AND restaurant_id=$2`, [id, restaurantId]);
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ─── STOCK ENTRY (purchase / usage / waste / adjustment) ──────────────────────
exports.updateStock = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { restaurantId, id: employeeId } = req.user;
    const { id } = req.params;
    const { type, quantity, notes, cost_per_unit, reference } = req.body;

    if (!type || !quantity) return res.status(400).json({ error: 'type and quantity required' });

    const item = await client.query(
      `SELECT * FROM inventory_items WHERE id=$1 AND restaurant_id=$2`, [id, restaurantId]
    );
    if (!item.rows.length) return res.status(404).json({ error: 'Item not found' });

    // Calculate new quantity based on transaction type
    const qty = parseFloat(quantity);
    const cur = parseFloat(item.rows[0].stock_quantity);
    let newQty;
    if (type === 'purchase' || type === 'adjustment_in') {
      newQty = cur + qty;
    } else if (type === 'usage' || type === 'waste' || type === 'adjustment_out') {
      newQty = Math.max(0, cur - qty);
    } else if (type === 'adjustment') {
      // Set to exact value
      newQty = qty;
    } else {
      newQty = cur + qty; // default: add
    }

    const updated = await client.query(
      `UPDATE inventory_items SET stock_quantity=$1, cost_per_unit=COALESCE($2,cost_per_unit) WHERE id=$3 RETURNING *`,
      [newQty, cost_per_unit||null, id]
    );

    const totalCost = cost_per_unit ? parseFloat(cost_per_unit) * qty : null;

    await client.query(
      `INSERT INTO inventory_transactions(restaurant_id,inventory_item_id,employee_id,type,quantity,cost_per_unit,total_cost,notes,reference)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [restaurantId, id, employeeId||null, type, qty,
       cost_per_unit||null, totalCost, notes||null, reference||null]
    );

    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err); res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ─── GET transactions ──────────────────────────────────────────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { item_id, type, from, to, limit = 100 } = req.query;

    let where = ['t.restaurant_id=$1'];
    const params = [restaurantId];
    let idx = 2;

    if (item_id) { where.push(`t.inventory_item_id=$${idx++}`); params.push(item_id); }
    if (type)    { where.push(`t.type=$${idx++}`);               params.push(type); }
    if (from)    { where.push(`DATE(t.created_at)>=$${idx++}`);  params.push(from); }
    if (to)      { where.push(`DATE(t.created_at)<=$${idx++}`);  params.push(to); }

    const result = await db.query(
      `SELECT t.*, i.name as item_name, i.unit, e.full_name as employee_name
       FROM inventory_transactions t
       JOIN inventory_items i ON t.inventory_item_id = i.id
       LEFT JOIN employees e ON t.employee_id = e.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT $${idx}`,
      [...params, parseInt(limit)]
    );
    res.json(result.rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ─── GET low stock alerts ──────────────────────────────────────────────────────
exports.getLowStockAlerts = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const result = await db.query(
      `SELECT *,
        CASE WHEN stock_quantity <= min_quantity*0.5 THEN 'critical' ELSE 'low' END as alert_level
       FROM inventory_items
       WHERE restaurant_id=$1 AND stock_quantity <= min_quantity
       ORDER BY (stock_quantity/NULLIF(min_quantity,0)) ASC`,
      [restaurantId]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

// ─── GET inventory summary / report ───────────────────────────────────────────
exports.getInventoryReport = async (req, res) => {
  try {
    const { restaurantId } = req.user;

    const [summary, byCategory, recentActivity, topUsage] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*)                                                          as total_items,
           COUNT(*) FILTER(WHERE stock_quantity <= min_quantity * 0.5)      as critical_items,
           COUNT(*) FILTER(WHERE stock_quantity <= min_quantity
                             AND stock_quantity > min_quantity * 0.5)       as low_items,
           COUNT(*) FILTER(WHERE stock_quantity > min_quantity)             as ok_items,
           COALESCE(SUM(stock_quantity * cost_per_unit), 0)                 as total_stock_value
         FROM inventory_items WHERE restaurant_id=$1`,
        [restaurantId]
      ),
      db.query(
        `SELECT category,
           COUNT(*) as item_count,
           SUM(stock_quantity * cost_per_unit) as category_value
         FROM inventory_items
         WHERE restaurant_id=$1
         GROUP BY category ORDER BY category_value DESC`,
        [restaurantId]
      ),
      db.query(
        `SELECT t.type, COUNT(*) as count, SUM(t.total_cost) as total_cost
         FROM inventory_transactions t
         WHERE t.restaurant_id=$1 AND t.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY t.type`,
        [restaurantId]
      ),
      db.query(
        `SELECT i.name, i.unit, i.category,
           SUM(t.quantity) FILTER(WHERE t.type IN ('usage','waste')) as used_qty,
           SUM(t.quantity) FILTER(WHERE t.type = 'purchase')        as purchased_qty,
           SUM(t.total_cost) FILTER(WHERE t.type = 'purchase')      as purchase_cost
         FROM inventory_transactions t
         JOIN inventory_items i ON t.inventory_item_id = i.id
         WHERE t.restaurant_id=$1 AND t.created_at >= NOW() - INTERVAL '30 days'
         GROUP BY i.id, i.name, i.unit, i.category
         ORDER BY used_qty DESC NULLS LAST
         LIMIT 10`,
        [restaurantId]
      ),
    ]);

    res.json({
      summary:        summary.rows[0],
      byCategory:     byCategory.rows,
      recentActivity: recentActivity.rows,
      topUsage:       topUsage.rows,
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};
