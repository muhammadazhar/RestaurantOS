const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { getActiveModuleKeys } = require('./subscriptionController');

const signToken = (payload, secret, expiresIn) =>
  jwt.sign(payload, secret, { expiresIn });

// POST /api/auth/login  — employee login
exports.login = async (req, res) => {
  try {
    const { email, password, restaurantSlug } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const result = await db.query(
      `SELECT e.*, r.name as restaurant_name, r.slug, r.status as restaurant_status,
              r.company_group_id, r.branch_code, r.is_branch,
              ro.name as role_name, ro.permissions
       FROM employees e
       JOIN restaurants r ON e.restaurant_id = r.id
       JOIN roles ro ON e.role_id = ro.id
       WHERE e.email = $1 AND r.slug = $2 AND e.status = 'active'`,
      [email, restaurantSlug]
    );

    if (!result.rows.length)
      return res.status(401).json({ error: 'Invalid credentials' });

    const emp = result.rows[0];
    if (!emp.password_hash) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, emp.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (emp.restaurant_status === 'suspended')
      return res.status(403).json({ error: 'Restaurant account suspended' });

    const modules = await getActiveModuleKeys(emp.restaurant_id).catch(() => []);

    const payload = {
      id: emp.id,
      restaurantId: emp.restaurant_id,
      restaurantName: emp.restaurant_name,
      restaurantSlug: emp.slug,
      companyGroupId: emp.company_group_id || null,
      branchCode: emp.branch_code || null,
      isBranch: emp.is_branch || false,
      role: emp.role_name,
      permissions: emp.permissions,
      modules,
      isSuperAdmin: false,
    };

    const accessToken = signToken(payload, process.env.JWT_SECRET, process.env.JWT_EXPIRES_IN);
    const refreshToken = signToken({ id: emp.id }, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_EXPIRES_IN);

    await db.query(
      `INSERT INTO refresh_tokens(employee_id, token, expires_at) VALUES($1,$2, NOW() + INTERVAL '7 days')`,
      [emp.id, refreshToken]
    );

    // last_login tracking: add column via migration if needed

    res.json({
      accessToken, refreshToken,
      user: {
        id: emp.id, name: emp.full_name, email: emp.email,
        role: emp.role_name, permissions: emp.permissions,
        modules,
        restaurantId: emp.restaurant_id, restaurantName: emp.restaurant_name,
        companyGroupId: emp.company_group_id || null,
        branchCode: emp.branch_code || null,
        isBranch: emp.is_branch || false,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/auth/super-login  — super admin login
exports.superLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await db.query(
      `SELECT * FROM users WHERE email = $1 AND is_super_admin = TRUE`, [email]
    );
    if (!result.rows.length)
      return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = { id: user.id, email: user.email, isSuperAdmin: true };
    const accessToken = signToken(payload, process.env.JWT_SECRET, process.env.JWT_EXPIRES_IN);

    res.json({ accessToken, user: { id: user.id, name: user.full_name, email: user.email, isSuperAdmin: true } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/auth/refresh
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const stored = await db.query(
      `SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()`, [refreshToken]
    );
    if (!stored.rows.length) return res.status(401).json({ error: 'Invalid refresh token' });

    const emp = await db.query(
      `SELECT e.*, ro.name as role_name, ro.permissions
       FROM employees e JOIN roles ro ON e.role_id = ro.id WHERE e.id = $1`, [decoded.id]
    );
    if (!emp.rows.length) return res.status(401).json({ error: 'User not found' });

    const e = emp.rows[0];
    const modules = await getActiveModuleKeys(e.restaurant_id).catch(() => []);
    const payload = { id: e.id, restaurantId: e.restaurant_id, role: e.role_name, permissions: e.permissions, modules };
    const accessToken = signToken(payload, process.env.JWT_SECRET, process.env.JWT_EXPIRES_IN);
    res.json({ accessToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) await db.query(`DELETE FROM refresh_tokens WHERE token = $1`, [refreshToken]);
  res.json({ message: 'Logged out' });
};

// GET /api/auth/groups  — public list of company groups (for registration + login)
exports.getPublicGroups = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT id, name FROM company_groups WHERE status = 'active' ORDER BY name`
    );
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /api/auth/groups/:groupId/restaurants  — restaurants in a group (for login picker)
exports.getGroupRestaurants = async (req, res) => {
  try {
    const { groupId } = req.params;
    const rows = await db.query(
      `SELECT id, name, slug, branch_code, city
       FROM restaurants
       WHERE company_group_id = $1 AND status != 'suspended'
       ORDER BY name`,
      [groupId]
    );
    res.json(rows.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/auth/register  — public self-registration (no auth required)
exports.register = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const bcrypt = require('bcryptjs');
    const {
      // Step 0 - Company (either create new or join existing)
      company_name, company_email, company_phone, company_address,
      company_group_id,           // set if joining existing group
      // Step 1 - Restaurant Info
      restaurant_name, slug_override, email, phone, address, city,
      country, currency, timezone,
      // Step 2 - Admin Account
      admin_name, admin_password, admin_pin,
      // Step 3 - Plan (default to starter trial)
      plan_id,
    } = req.body;

    if (!restaurant_name || !email || !admin_name || !admin_password)
      return res.status(400).json({ error: 'restaurant_name, email, admin_name and admin_password are required' });
    if (!company_name && !company_group_id)
      return res.status(400).json({ error: 'company_name or company_group_id is required' });
    if (admin_password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    // Validate existing group if joining
    if (company_group_id) {
      const grp = await client.query(`SELECT id FROM company_groups WHERE id = $1`, [company_group_id]);
      if (!grp.rows.length) return res.status(400).json({ error: 'Company group not found' });
    }

    // Auto-generate slug from name
    const slug = (slug_override || restaurant_name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check slug availability
    const existing = await client.query(
      `SELECT id FROM restaurants WHERE slug=$1 OR email=$2`, [slug, email]
    );
    if (existing.rows.length)
      return res.status(400).json({ error: 'A restaurant with this name or email already exists' });

    // Get starter plan
    const planRes = await client.query(
      `SELECT id FROM plans WHERE name='Starter' LIMIT 1`
    );
    const resolvedPlanId = plan_id || planRes.rows[0]?.id;

    // Create new company group if not joining existing
    let resolvedGroupId = company_group_id || null;
    if (!company_group_id && company_name) {
      const groupSlug = company_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now();
      const newGroup = await client.query(
        `INSERT INTO company_groups(name, slug, email, phone, address)
         VALUES($1,$2,$3,$4,$5) RETURNING id`,
        [company_name.trim(), groupSlug, company_email || null, company_phone || null, company_address || null]
      );
      resolvedGroupId = newGroup.rows[0].id;
    }

    // Create restaurant (linked to group, marked as branch)
    const rest = await client.query(
      `INSERT INTO restaurants(plan_id,name,slug,email,phone,address,city,country,currency,timezone,status,company_group_id,is_branch)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'trial',$11,true) RETURNING *`,
      [resolvedPlanId, restaurant_name, slug, email,
        phone || null, address || null, city || null,
        country || 'Pakistan', currency || 'PKR', timezone || 'Asia/Karachi',
        resolvedGroupId]
    );
    const restaurant = rest.rows[0];

    // If we created a new group, set this restaurant as the owner
    if (!company_group_id && resolvedGroupId) {
      await client.query(
        `UPDATE company_groups SET owner_restaurant_id = $1 WHERE id = $2`,
        [restaurant.id, resolvedGroupId]
      );
    }

    // Create all default roles
    const roleNames = [
      ['Manager', '["dashboard","pos","kitchen","tables","inventory","recipes","employees","attendance","gl","alerts","settings","rider"]', true],
      ['Head Server', '["pos","kitchen","tables","alerts"]', false],
      ['Server', '["pos","tables","alerts"]', false],
      ['Chef', '["kitchen","recipes","inventory","alerts"]', false],
      ['Cashier', '["pos","alerts"]', false],
      ['Rider', '["rider","alerts"]', false],
    ];
    const roleIds = {};
    for (const [name, perms, isSystem] of roleNames) {
      const r = await client.query(
        `INSERT INTO roles(restaurant_id,name,permissions,is_system) VALUES($1,$2,$3,$4) RETURNING id`,
        [restaurant.id, name, perms, isSystem]
      );
      roleIds[name] = r.rows[0].id;
    }

    // Create admin employee
    const hash = await bcrypt.hash(admin_password, 10);
    const empRes = await client.query(
      `INSERT INTO employees(restaurant_id,role_id,full_name,email,pin,password_hash)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING id,full_name,email`,
      [restaurant.id, roleIds['Manager'], admin_name, email, admin_pin || null, hash]
    );

    // Create default GL accounts
    const glAccounts = [
      ['4001', 'Food Revenue', 'revenue'],
      ['4002', 'Beverage Revenue', 'revenue'],
      ['4003', 'Online Revenue', 'revenue'],
      ['5001', 'Food Cost', 'cogs'],
      ['5002', 'Beverage Cost', 'cogs'],
      ['6001', 'Staff Wages', 'expense'],
      ['6002', 'Rent & Utilities', 'expense'],
      ['6003', 'Supplies', 'expense'],
      ['1001', 'Cash on Hand', 'asset'],
      ['1002', 'Bank Account', 'asset'],
    ];
    for (const [code, name, type] of glAccounts) {
      await client.query(
        `INSERT INTO gl_accounts(restaurant_id,code,name,type,is_system) VALUES($1,$2,$3,$4,TRUE)`,
        [restaurant.id, code, name, type]
      );
    }

    await client.query('COMMIT');

    // Auto-activate base trial on registration
    await client.query(
      `INSERT INTO subscriptions(restaurant_id, module_key, plan_type, status, starts_at, expires_at, price)
       SELECT $1, 'base', 'trial', 'trial', NOW(), NOW() + INTERVAL '14 days', 0
       WHERE EXISTS (SELECT 1 FROM modules WHERE key='base')`,
      [restaurant.id]
    ).catch(() => {});

    // Auto-login: issue tokens
    const payload = {
      id: empRes.rows[0].id,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name,
      restaurantSlug: restaurant.slug,
      role: 'Manager',
      permissions: JSON.parse(roleNames[0][1]),
      modules: ['base'],
      isSuperAdmin: false,
    };
    const accessToken = signToken(payload, process.env.JWT_SECRET, process.env.JWT_EXPIRES_IN);
    const refreshToken = signToken({ id: empRes.rows[0].id }, process.env.JWT_REFRESH_SECRET, process.env.JWT_REFRESH_EXPIRES_IN);

    await db.query(
      `INSERT INTO refresh_tokens(employee_id,token,expires_at) VALUES($1,$2,NOW()+INTERVAL '7 days')`,
      [empRes.rows[0].id, refreshToken]
    );

    res.status(201).json({
      accessToken, refreshToken,
      companyGroupId: resolvedGroupId,
      user: {
        id: empRes.rows[0].id,
        name: admin_name,
        email,
        role: 'Manager',
        permissions: JSON.parse(roleNames[0][1]),
        modules: ['base'],
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        companyGroupId: resolvedGroupId,
      },
      restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug },
      isNewSetup: true,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'Email or restaurant name already taken' });
    res.status(500).json({ error: 'Server error' });
  } finally { client.release(); }
};
