// ── tables.js ─────────────────────────────────────────────────────────────────
const db = require('../config/db');

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
              r.id          as reservation_id,
              r.guest_name  as reservation_guest,
              r.guest_phone as reservation_phone,
              r.reserved_at,
              r.duration_min AS reservation_duration_min,
              r.status      as reservation_status
       FROM dining_tables dt
       LEFT JOIN orders o ON o.table_id = dt.id AND o.status NOT IN ('paid','cancelled')
       LEFT JOIN employees e ON o.employee_id = e.id
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
    const result = await db.query(
      `INSERT INTO dining_tables(restaurant_id,label,section,capacity) VALUES($1,$2,$3,$4) RETURNING *`,
      [req.user.restaurantId, label, section||'Main', capacity||4]
    );
    res.status(201).json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
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
exports.getMenu = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT mi.*, c.name as category_name
       FROM menu_items mi
       LEFT JOIN categories c ON mi.category_id = c.id
       WHERE mi.restaurant_id=$1
       ORDER BY c.sort_order, mi.sort_order, mi.name`,
      [req.user.restaurantId]
    );
    const cats = await db.query(
      `SELECT * FROM categories WHERE restaurant_id=$1 ORDER BY sort_order`, [req.user.restaurantId]
    );
    res.json({ categories: cats.rows, items: result.rows });
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.createMenuItem = async (req, res) => {
  try {
    const { name, description, price, cost, category_id, prep_time_min, is_popular, tags, allergens } = req.body;
    const result = await db.query(
      `INSERT INTO menu_items(restaurant_id,category_id,name,description,price,cost,prep_time_min,is_popular,tags,allergens)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.restaurantId, category_id||null, name, description||null, price, cost||0, prep_time_min||10, is_popular||false, tags||[], allergens||[]]
    );
    res.status(201).json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.uploadMenuImage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = req.file.path?.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    const result = await db.query(
      `UPDATE menu_items SET image_url=$1 WHERE id=$2 AND restaurant_id=$3 RETURNING *`,
      [imageUrl, id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json({ image_url: imageUrl, item: result.rows[0] });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

exports.updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, cost, is_available, is_popular, category_id, image_url } = req.body;
    // Only persist image_url if it is a real server path or Cloudinary URL.
    // Ignore blob: URLs (local preview) and empty strings.
    const safeImageUrl = (image_url && (image_url.startsWith('/uploads/') || image_url.startsWith('http'))) ? image_url : null;
    const result = await db.query(
      `UPDATE menu_items SET name=COALESCE($1,name), description=COALESCE($2,description),
       price=COALESCE($3,price), cost=COALESCE($4,cost), is_available=COALESCE($5,is_available),
       is_popular=COALESCE($6,is_popular), category_id=COALESCE($7,category_id),
       image_url=COALESCE($10,image_url)
       WHERE id=$8 AND restaurant_id=$9 RETURNING *`,
      [name, description, price, cost, is_available, is_popular, category_id, id, req.user.restaurantId, safeImageUrl]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Server error' }); }
};

// ── menu image upload ─────────────────────────────────────────────────────────
exports.uploadMenuItemImage = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const imageUrl = req.file.path && req.file.path.startsWith('http') ? req.file.path : `/uploads/${req.file.filename}`;
    const result = await db.query(
      `UPDATE menu_items SET image_url=$1 WHERE id=$2 AND restaurant_id=$3 RETURNING id, name, image_url`,
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

// ── recipes.js ────────────────────────────────────────────────────────────────
exports.getRecipes = async (req, res) => {
  try {
    const recipes = await db.query(
      `SELECT r.*, mi.name as menu_item_name, mi.price as selling_price
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
        COALESCE(SUM(jl.debit),0) as total_debit,
        COALESCE(SUM(jl.credit),0) as total_credit,
        COALESCE(SUM(jl.credit - jl.debit),0) as balance
       FROM gl_accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       WHERE a.restaurant_id=$1
       GROUP BY a.id ORDER BY a.code`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.createGLAccount = async (req, res) => {
  try {
    const { code, name, type } = req.body;
    if (!code || !name || !type) return res.status(400).json({ error: 'code, name and type required' });
    const result = await db.query(
      `INSERT INTO gl_accounts(restaurant_id, code, name, type)
       VALUES($1,$2,$3,$4) RETURNING *`,
      [req.user.restaurantId, code, name, type]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Account code already exists' });
    res.status(500).json({ error: 'Server error' });
  }
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
         a.id, a.code, a.name, a.type,
         COALESCE(SUM(jl.debit),  0) AS total_debit,
         COALESCE(SUM(jl.credit), 0) AS total_credit,
         COALESCE(SUM(jl.credit - jl.debit), 0) AS net_balance
       FROM gl_accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.entry_id
         AND ($1::date IS NULL OR je.entry_date >= $1::date)
         AND ($2::date IS NULL OR je.entry_date <= $2::date)
       WHERE a.restaurant_id = $3
       GROUP BY a.id, a.code, a.name, a.type
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
    // Get all account balances up to as_of date
    const result = await db.query(
      `SELECT
         a.id, a.code, a.name, a.type,
         COALESCE(SUM(jl.credit - jl.debit), 0) AS balance
       FROM gl_accounts a
       LEFT JOIN journal_lines jl ON jl.account_id = a.id
       LEFT JOIN journal_entries je ON je.id = jl.entry_id
         AND ($1::date IS NULL OR je.entry_date <= $1::date)
       WHERE a.restaurant_id = $2
       GROUP BY a.id, a.code, a.name, a.type
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
      `INSERT INTO roles(restaurant_id,name,permissions,is_system) VALUES($1,'Manager','["dashboard","pos","kitchen","tables","inventory","recipes","employees","gl","alerts","settings"]',TRUE) RETURNING id`,
      [rest.rows[0].id]
    );

    const hash = await bcrypt.hash(admin_password, 10);
    await client.query(
      `INSERT INTO employees(restaurant_id,role_id,full_name,email,password_hash) VALUES($1,$2,$3,$4,$5)`,
      [rest.rows[0].id, role.rows[0].id, admin_name, email, hash]
    );

    // Default GL accounts
    const accounts = [
      ['4001','Food Revenue','revenue'],['4002','Beverage Revenue','revenue'],
      ['5001','Food Cost','cogs'],['6001','Staff Wages','expense'],
      ['6002','Rent','expense'],['1001','Cash','asset'],
    ];
    for (const [code, name, type] of accounts) {
      await client.query(
        `INSERT INTO gl_accounts(restaurant_id,code,name,type,is_system) VALUES($1,$2,$3,$4,TRUE)`,
        [rest.rows[0].id, code, name, type]
      );
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
       WHERE id=$2 AND restaurant_id=$3 AND is_system=false
       RETURNING id, name, permissions, is_system`,
      [JSON.stringify(permissions), id, req.user.restaurantId]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Role not found or is a system role' });
    res.json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.getShifts = async (req, res) => {
  try {
    const { date, employee_id, month } = req.query;
    let where = ['s.restaurant_id=$1'];
    const params = [req.user.restaurantId];
    let idx = 2;
    if (date)        { where.push(`s.date=$${idx++}`);                            params.push(date); }
    if (month)       { where.push(`TO_CHAR(s.date,'YYYY-MM')=$${idx++}`);         params.push(month); }
    if (employee_id) { where.push(`s.employee_id=$${idx++}`);                     params.push(employee_id); }

    const result = await db.query(
      `SELECT s.*, e.full_name as employee_name, e.avatar_url, r.name as role_name
       FROM shifts s
       JOIN employees e ON s.employee_id = e.id
       LEFT JOIN roles r ON e.role_id = r.id
       WHERE ${where.join(' AND ')}
       ORDER BY s.date DESC, s.start_time`,
      params
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.bulkCreateShifts = async (req, res) => {
  try {
    const { employee_id, shift_name, start_time, end_time, date_from, date_to, notes, skip_weekends } = req.body;
    if (!employee_id || !shift_name || !start_time || !end_time || !date_from || !date_to)
      return res.status(400).json({ error: 'employee_id, shift_name, start_time, end_time, date_from, date_to required' });

    const from = new Date(date_from);
    const to   = new Date(date_to);
    if (from > to) return res.status(400).json({ error: 'date_from must be before date_to' });

    const days = Math.round((to - from) / 86400000) + 1;
    if (days > 366) return res.status(400).json({ error: 'Date range cannot exceed 366 days' });

    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(from);
      d.setDate(from.getDate() + i);
      if (skip_weekends && (d.getDay() === 0 || d.getDay() === 6)) continue;
      dates.push(d.toISOString().slice(0, 10));
    }

    // Insert all, skip if exact same shift (same employee + date + start_time + end_time) already exists
    let created = 0;
    for (const date of dates) {
      const exists = await db.query(
        `SELECT 1 FROM shifts WHERE restaurant_id=$1 AND employee_id=$2 AND date=$3 AND start_time=$4 AND end_time=$5 LIMIT 1`,
        [req.user.restaurantId, employee_id, date, start_time, end_time]
      );
      if (exists.rows.length > 0) continue;
      const numRes = await db.query(
        `SELECT COALESCE(MAX(shift_number), 0) + 1 AS next_num FROM shifts WHERE restaurant_id=$1 AND date=$2`,
        [req.user.restaurantId, date]
      );
      await db.query(
        `INSERT INTO shifts(restaurant_id, employee_id, shift_name, start_time, end_time, date, status, notes, shift_number)
         VALUES($1,$2,$3,$4,$5,$6,'scheduled',$7,$8)`,
        [req.user.restaurantId, employee_id, shift_name, start_time, end_time, date, notes || null, numRes.rows[0].next_num]
      );
      created++;
    }

    res.status(201).json({ created, total: dates.length, skipped: dates.length - created });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getCurrentShift = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const now   = new Date().toTimeString().slice(0, 5); // HH:MM

    const [shiftResult, attendResult] = await Promise.all([
      db.query(
        `SELECT s.*, e.full_name as employee_name
         FROM shifts s
         JOIN employees e ON s.employee_id = e.id
         WHERE s.restaurant_id=$1 AND s.employee_id=$2 AND DATE(s.date)=DATE($3::date)
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

    const todayShifts = shiftResult.rows;

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
    const scheduledNow = todayShifts.find(s => s.status === 'scheduled' && now >= s.start_time.slice(0,5) && now <= s.end_time.slice(0,5));
    if (scheduledNow)
      return res.json({ shift: scheduledNow, shifts: todayShifts, allowed: false, reason: 'Start your shift before placing orders', attendance });

    const absentShift = todayShifts.find(s => s.status === 'absent');
    if (absentShift && todayShifts.every(s => s.status === 'absent'))
      return res.json({ shift: absentShift, shifts: todayShifts, allowed: false, reason: 'You are marked absent for today', attendance });

    const allDone = todayShifts.every(s => ['completed','absent'].includes(s.status));
    if (allDone)
      return res.json({ shift: todayShifts[todayShifts.length - 1], shifts: todayShifts, allowed: false, reason: 'All your shifts have ended for today', attendance });

    // Scheduled but outside hours
    const upcoming = todayShifts.find(s => s.status === 'scheduled' && now < s.start_time.slice(0,5));
    if (upcoming)
      return res.json({ shift: upcoming, shifts: todayShifts, allowed: false, reason: `Next shift starts at ${upcoming.start_time.slice(0,5)}`, attendance });

    return res.json({ shift: todayShifts[0], shifts: todayShifts, allowed: false, reason: 'No active shift right now', attendance });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

exports.createShift = async (req, res) => {
  try {
    const { employee_id, shift_name, start_time, end_time, date, notes } = req.body;
    if (!employee_id || !shift_name || !start_time || !end_time || !date)
      return res.status(400).json({ error: 'employee_id, shift_name, start_time, end_time, date required' });

    const numRes = await db.query(
      `SELECT COALESCE(MAX(shift_number), 0) + 1 AS next_num FROM shifts WHERE restaurant_id=$1 AND date=$2`,
      [req.user.restaurantId, date]
    );
    const shiftNumber = numRes.rows[0].next_num;

    const result = await db.query(
      `INSERT INTO shifts(restaurant_id, employee_id, shift_name, start_time, end_time, date, status, notes, shift_number)
       VALUES($1,$2,$3,$4,$5,$6,'scheduled',$7,$8) RETURNING *`,
      [req.user.restaurantId, employee_id, shift_name, start_time, end_time, date, notes||null, shiftNumber]
    );
    res.status(201).json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
};

exports.updateShift = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, shift_name, start_time, end_time } = req.body;
    const result = await db.query(
      `UPDATE shifts SET
         status=COALESCE($1,status), notes=COALESCE($2,notes),
         shift_name=COALESCE($3,shift_name), start_time=COALESCE($4,start_time), end_time=COALESCE($5,end_time)
       WHERE id=$6 AND restaurant_id=$7 RETURNING *`,
      [status||null, notes||null, shift_name||null, start_time||null, end_time||null, id, req.user.restaurantId]
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
  const today = new Date().toISOString().slice(0, 10);
  const shiftDateStr = shift.date
    ? (shift.date instanceof Date ? shift.date.toISOString().slice(0, 10) : String(shift.date).slice(0, 10))
    : today;

  // end_time is stored as HH:MM:SS by PostgreSQL — use first 8 chars to avoid double-seconds
  const timeStr = (shift.end_time || '23:59:59').slice(0, 8);
  const shiftEndTs = new Date(`${shiftDateStr}T${timeStr}`); // local time
  const clockOutTs = clockOutAt || (isNaN(shiftEndTs.getTime()) ? new Date() : shiftEndTs);

  // Update shift status → completed
  await client.query(
    `UPDATE shifts SET status='completed', updated_at=NOW() WHERE id=$1 AND restaurant_id=$2`,
    [shift.id, restaurantId]
  );

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
    const clockInDate = new Date(openLog.rows[0].punched_at).toISOString().slice(0, 10);
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
    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toTimeString().slice(0, 5);

    const result = await db.query(
      `SELECT s.*, e.full_name as employee_name, e.avatar_url, r.name as role_name
       FROM shifts s
       JOIN employees e ON s.employee_id = e.id
       LEFT JOIN roles r ON e.role_id = r.id
       WHERE s.restaurant_id=$1
         AND (
           (s.status IN ('scheduled','active') AND (s.date < $2 OR (s.date = $2 AND s.end_time < $3)))
           OR s.status = 'in_process'
         )
       ORDER BY s.date DESC, s.end_time DESC`,
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
      `SELECT * FROM shifts WHERE id=$1 AND restaurant_id=$2 LIMIT 1`,
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
    const today = new Date().toISOString().slice(0, 10);
    const nowTime = new Date().toTimeString().slice(0, 5);

    const expired = await client.query(
      `SELECT * FROM shifts
       WHERE restaurant_id=$1 AND status IN ('scheduled','active')
         AND (date < $2 OR (date = $2 AND end_time < $3))`,
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
      `SELECT s.*, e.full_name as employee_name
       FROM shifts s
       JOIN employees e ON s.employee_id = e.id
       WHERE s.restaurant_id=$1 AND s.employee_id=$2
       ORDER BY s.date DESC, s.start_time DESC
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
    const today = new Date().toISOString().slice(0, 10);
    const result = await db.query(
      `UPDATE shifts SET status='active'
       WHERE id=$1 AND restaurant_id=$2 AND employee_id=$3
         AND date=$4 AND status='scheduled'
       RETURNING *`,
      [id, req.user.restaurantId, req.user.id, today]
    );
    if (!result.rows.length)
      return res.status(400).json({ error: 'Shift not found or cannot be started' });
    res.json(result.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /shifts/:id/continue — employee continues working past shift end_time (active → in_process)
exports.continueMyShift = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE shifts SET status='in_process'
       WHERE id=$1 AND restaurant_id=$2 AND employee_id=$3
         AND status='active'
       RETURNING *`,
      [id, req.user.restaurantId, req.user.id]
    );
    if (!result.rows.length)
      return res.status(400).json({ error: 'Shift not found or not active' });
    res.json(result.rows[0]);
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }); }
};

// PATCH /shifts/:id/close-my — employee closes their own shift; clock-out at NOW()
exports.closeMyShift = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rid = req.user.restaurantId;
    const { id } = req.params;

    const sr = await client.query(
      `SELECT * FROM shifts WHERE id=$1 AND restaurant_id=$2 AND employee_id=$3
         AND status IN ('active','in_process') LIMIT 1`,
      [id, rid, req.user.id]
    );
    if (!sr.rows.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Shift not found or already closed' });
    }
    const shift = sr.rows[0];

    await _closeShift(client, rid, shift, req.user.id, new Date());
    await client.query('COMMIT');

    try {
      const { recomputeEmployee } = require('./attendanceController');
      recomputeEmployee(rid, shift.employee_id, shift.date).catch(() => {});
    } catch (_) {}

    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};
