const db = require('../config/db');

// ── Company Groups (Super Admin) ──────────────────────────────────────────────

exports.getGroups = async (req, res) => {
  try {
    const rows = await db.query(`
      SELECT cg.*,
        COUNT(r.id) as branch_count,
        json_agg(json_build_object(
          'id', r.id, 'name', r.name, 'slug', r.slug,
          'branch_code', r.branch_code, 'status', r.status, 'city', r.city
        ) ORDER BY r.name) FILTER (WHERE r.id IS NOT NULL) as branches
      FROM company_groups cg
      LEFT JOIN restaurants r ON r.company_group_id = cg.id
      GROUP BY cg.id ORDER BY cg.name
    `);
    res.json(rows.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createGroup = async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const row = await db.query(
      `INSERT INTO company_groups(name, slug, email, phone, address)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [name.trim(), slug, email || null, phone || null, address || null]
    );
    res.status(201).json(row.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Group name or slug already exists' });
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, address, status } = req.body;
    const row = await db.query(
      `UPDATE company_groups
       SET name=COALESCE($1,name), email=COALESCE($2,email),
           phone=COALESCE($3,phone), address=COALESCE($4,address),
           status=COALESCE($5,status)
       WHERE id=$6 RETURNING *`,
      [name || null, email || null, phone || null, address || null, status || null, id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Group not found' });
    res.json(row.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getGroupBranches = async (req, res) => {
  try {
    const { groupId } = req.params;
    const rows = await db.query(`
      SELECT r.id, r.name, r.slug, r.email, r.phone, r.city, r.status, r.branch_code,
        COUNT(DISTINCT e.id) as employee_count,
        COUNT(DISTINCT s.id)
          FILTER (WHERE s.status IN ('trial','active')
            AND (s.expires_at IS NULL OR s.expires_at > NOW())) as active_modules
      FROM restaurants r
      LEFT JOIN employees e ON e.restaurant_id = r.id
      LEFT JOIN subscriptions s ON s.restaurant_id = r.id
      WHERE r.company_group_id = $1
      GROUP BY r.id ORDER BY r.name
    `, [groupId]);
    res.json(rows.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.assignBranch = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { restaurant_id, branch_code } = req.body;
    if (!restaurant_id) return res.status(400).json({ error: 'restaurant_id required' });
    const row = await db.query(
      `UPDATE restaurants
       SET company_group_id=$1, branch_code=$2, is_branch=TRUE
       WHERE id=$3 RETURNING id, name, slug, branch_code, company_group_id`,
      [groupId, branch_code || null, restaurant_id]
    );
    if (!row.rows.length) return res.status(404).json({ error: 'Restaurant not found' });
    res.json(row.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeBranch = async (req, res) => {
  try {
    const { groupId, restaurantId } = req.params;
    await db.query(
      `UPDATE restaurants
       SET company_group_id=NULL, branch_code=NULL, is_branch=FALSE
       WHERE id=$1 AND company_group_id=$2`,
      [restaurantId, groupId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Group Discount Tiers ──────────────────────────────────────────────────────

exports.getDiscountTiers = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT * FROM group_branch_discounts ORDER BY min_branches`
    );
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.saveDiscountTiers = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const { tiers } = req.body;
    if (!Array.isArray(tiers)) return res.status(400).json({ error: 'tiers array required' });
    await client.query(`DELETE FROM group_branch_discounts`);
    for (const t of tiers) {
      await client.query(
        `INSERT INTO group_branch_discounts(min_branches, discount_pct) VALUES($1,$2)`,
        [t.min_branches, t.discount_pct]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};

// ── Consolidated GL Trial Balance across all branches of a group ──────────────

exports.getGroupConsolidatedTB = async (req, res) => {
  try {
    const { groupId } = req.params;
    const { from, to } = req.query;
    const result = await db.query(`
      SELECT
        a.code, a.name, a.type, a.is_header,
        r.id   as branch_id,
        r.name as branch_name,
        r.branch_code,
        COALESCE(SUM(jl.debit),  0) as total_debit,
        COALESCE(SUM(jl.credit), 0) as total_credit,
        COALESCE(SUM(jl.credit - jl.debit), 0) as net_balance
      FROM gl_accounts a
      JOIN restaurants r ON r.id = a.restaurant_id
      LEFT JOIN journal_lines jl ON jl.account_id = a.id
      LEFT JOIN journal_entries je ON je.id = jl.entry_id
        AND ($1::date IS NULL OR je.entry_date >= $1)
        AND ($2::date IS NULL OR je.entry_date <= $2)
      WHERE r.company_group_id = $3
        AND (a.is_header = FALSE OR a.is_header IS NULL)
      GROUP BY a.code, a.name, a.type, a.is_header, r.id, r.name, r.branch_code
      ORDER BY a.code, r.name
    `, [from || null, to || null, groupId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get my group (for restaurant users) ──────────────────────────────────────

exports.getMyGroup = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const row = await db.query(`
      SELECT cg.*,
        (cg.owner_restaurant_id = $1) AS is_admin,
        (SELECT json_agg(json_build_object(
          'id', r.id, 'name', r.name, 'branch_code', r.branch_code,
          'status', r.status, 'city', r.city
        ) ORDER BY r.name)
         FROM restaurants r WHERE r.company_group_id = cg.id) as branches
      FROM company_groups cg
      JOIN restaurants rest ON rest.company_group_id = cg.id
      WHERE rest.id = $1
      LIMIT 1
    `, [restaurantId]);
    if (!row.rows.length) return res.json(null);
    res.json(row.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Self-service Group Management (restaurant admin) ──────────────────────────

exports.registerMyGroup = async (req, res) => {
  try {
    const { name, email, phone, address } = req.body;
    const { restaurantId } = req.user;
    if (!name?.trim()) return res.status(400).json({ error: 'Company name required' });

    const existing = await db.query(
      'SELECT company_group_id FROM restaurants WHERE id = $1', [restaurantId]
    );
    if (existing.rows[0]?.company_group_id) {
      return res.status(400).json({ error: 'Already part of a group' });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();

    const group = await db.query(
      `INSERT INTO company_groups (name, slug, email, phone, address, owner_restaurant_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name.trim(), slug, email || null, phone || null, address || null, restaurantId]
    );

    await db.query(
      'UPDATE restaurants SET company_group_id = $1, is_branch = true WHERE id = $2',
      [group.rows[0].id, restaurantId]
    );

    res.status(201).json({ ...group.rows[0], is_admin: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateMyGroupInfo = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { name, email, phone, address } = req.body;

    const result = await db.query(
      `UPDATE company_groups
       SET name    = COALESCE($1, name),
           email   = COALESCE($2, email),
           phone   = COALESCE($3, phone),
           address = COALESCE($4, address)
       WHERE owner_restaurant_id = $5 RETURNING *`,
      [name || null, email || null, phone || null, address || null, restaurantId]
    );

    if (!result.rows.length) return res.status(403).json({ error: 'Not authorized' });
    res.json({ ...result.rows[0], is_admin: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMyGroupDashboard = async (req, res) => {
  try {
    const { restaurantId } = req.user;

    const groupRow = await db.query(
      'SELECT * FROM company_groups WHERE owner_restaurant_id = $1', [restaurantId]
    );
    if (!groupRow.rows.length) return res.status(403).json({ error: 'Not a group admin' });
    const group = groupRow.rows[0];

    const branches = await db.query(`
      SELECT
        r.id, r.name, r.branch_code, r.status, r.city,
        (r.id = $2) AS is_owner_branch,
        COUNT(DISTINCT o.id)  FILTER (WHERE DATE(o.created_at) = CURRENT_DATE)                                              AS orders_today,
        COALESCE(SUM(o.total_amount) FILTER (WHERE DATE(o.created_at) = CURRENT_DATE AND o.payment_status = 'paid'), 0)    AS revenue_today,
        COUNT(DISTINCT o.id)  FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days')                                     AS orders_30d,
        COALESCE(SUM(o.total_amount) FILTER (WHERE o.created_at >= NOW() - INTERVAL '30 days' AND o.payment_status = 'paid'), 0) AS revenue_30d,
        COUNT(DISTINCT e.id)  FILTER (WHERE e.status = 'active')                                                             AS employee_count,
        COUNT(DISTINCT sh.id) FILTER (WHERE sh.status IN ('scheduled','active') AND sh.date = CURRENT_DATE)                 AS open_shifts
      FROM restaurants r
      LEFT JOIN orders    o  ON o.restaurant_id  = r.id
      LEFT JOIN employees e  ON e.restaurant_id  = r.id
      LEFT JOIN shifts    sh ON sh.restaurant_id = r.id
      WHERE r.company_group_id = $1
      GROUP BY r.id, r.name, r.branch_code, r.status, r.city
      ORDER BY r.name
    `, [group.id, restaurantId]);

    const rows = branches.rows;
    const totals = {
      branch_count:   rows.length,
      orders_today:   rows.reduce((s, b) => s + parseInt(b.orders_today   || 0), 0),
      revenue_today:  rows.reduce((s, b) => s + parseFloat(b.revenue_today || 0), 0),
      orders_30d:     rows.reduce((s, b) => s + parseInt(b.orders_30d     || 0), 0),
      revenue_30d:    rows.reduce((s, b) => s + parseFloat(b.revenue_30d   || 0), 0),
      employee_count: rows.reduce((s, b) => s + parseInt(b.employee_count  || 0), 0),
    };

    res.json({ group, branches: rows, totals });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addBranchToMyGroup = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { name, branch_code, email, phone, address, city } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Branch name required' });

    const groupRow = await db.query(
      'SELECT id FROM company_groups WHERE owner_restaurant_id = $1', [restaurantId]
    );
    if (!groupRow.rows.length) return res.status(403).json({ error: 'Not a group admin' });
    const groupId = groupRow.rows[0].id;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();

    const branch = await db.query(
      `INSERT INTO restaurants
         (name, branch_code, email, phone, address, city, company_group_id, is_branch, status, slug)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, 'active', $8) RETURNING *`,
      [name.trim(), branch_code || null, email || null, phone || null,
       address || null, city || null, groupId, slug]
    );

    res.status(201).json(branch.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Get all restaurants not yet in any group (for super admin assign UI) ──────

exports.getUnassignedRestaurants = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, name, slug, email, city, status
       FROM restaurants
       WHERE company_group_id IS NULL
       ORDER BY name`
    );
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
