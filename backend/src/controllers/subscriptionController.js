const db = require('../config/db');

// ── Email helper (uses shared utils/email — supports SMTP, Resend, Mailgun, SendGrid)
const sendEmail = async (to, subject, html) => {
  try {
    const { sendEmail: _send } = require('../utils/email');
    await _send(to, subject, html);
  } catch (e) {
    console.warn('Email send failed:', e.message);
  }
};

const expireStaleSubscriptions = async (restaurantId, moduleKey = null) => {
  const params = [restaurantId];
  let moduleFilter = '';
  if (moduleKey) {
    params.push(moduleKey);
    moduleFilter = ` AND module_key = $2`;
  }

  await db.query(
    `UPDATE subscriptions
     SET status = 'expired'
     WHERE restaurant_id = $1
       ${moduleFilter}
       AND status IN ('trial', 'active')
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`,
    params
  );
};

// ── Public: list modules + pricing ───────────────────────────────────────────
exports.getModules = async (req, res) => {
  try {
    const mods = await db.query(`SELECT * FROM modules ORDER BY key`);
    const pricing = await db.query(
      `SELECT * FROM module_pricing WHERE is_active = TRUE ORDER BY module_key,
       CASE plan_type WHEN 'trial' THEN 1 WHEN 'monthly' THEN 2 WHEN 'quarterly' THEN 3
                      WHEN 'half_yearly' THEN 4 WHEN 'yearly' THEN 5 END`
    );
    const byModule = {};
    for (const p of pricing.rows) {
      if (!byModule[p.module_key]) byModule[p.module_key] = [];
      byModule[p.module_key].push(p);
    }
    const result = mods.rows.map(m => ({ ...m, pricing: byModule[m.key] || [] }));
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Super admin: get/save module pricing ─────────────────────────────────────
exports.getModulePricing = async (req, res) => {
  try {
    const rows = await db.query(
      `SELECT mp.*, m.name as module_name FROM module_pricing mp
       JOIN modules m ON m.key = mp.module_key
       ORDER BY m.key,
       CASE mp.plan_type WHEN 'trial' THEN 1 WHEN 'monthly' THEN 2 WHEN 'quarterly' THEN 3
                         WHEN 'half_yearly' THEN 4 WHEN 'yearly' THEN 5 END`
    );
    const mods = await db.query(`SELECT * FROM modules ORDER BY key`);
    res.json({ modules: mods.rows, pricing: rows.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.saveModulePricing = async (req, res) => {
  try {
    const { pricing } = req.body; // [{module_key, plan_type, price, duration_days, is_active}]
    if (!Array.isArray(pricing)) return res.status(400).json({ error: 'pricing array required' });
    for (const p of pricing) {
      await db.query(
        `INSERT INTO module_pricing(module_key, plan_type, price, duration_days, is_active)
         VALUES($1,$2,$3,$4,$5)
         ON CONFLICT(module_key, plan_type) DO UPDATE
           SET price=$3, duration_days=$4, is_active=$5`,
        [p.module_key, p.plan_type, p.price, p.duration_days, p.is_active !== false]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Restaurant: view own subscriptions ───────────────────────────────────────
exports.getMySubscriptions = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    await expireStaleSubscriptions(restaurantId);
    const rows = await db.query(
      `SELECT s.*, m.name as module_name, m.description as module_description
       FROM subscriptions s JOIN modules m ON m.key = s.module_key
       WHERE s.restaurant_id = $1
       ORDER BY s.module_key, s.created_at DESC`,
      [restaurantId]
    );
    // Also return modules with pricing so the user can request
    const pricing = await db.query(
      `SELECT * FROM module_pricing WHERE is_active=TRUE ORDER BY module_key,
       CASE plan_type WHEN 'trial' THEN 1 WHEN 'monthly' THEN 2 WHEN 'quarterly' THEN 3
                      WHEN 'half_yearly' THEN 4 WHEN 'yearly' THEN 5 END`
    );
    res.json({ subscriptions: rows.rows, pricing: pricing.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Restaurant: request a subscription ───────────────────────────────────────
exports.requestSubscription = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    const { module_key, plan_type } = req.body;

    await expireStaleSubscriptions(restaurantId, module_key);

    // Validate
    const modCheck = await db.query(`SELECT key FROM modules WHERE key=$1`, [module_key]);
    if (!modCheck.rows.length) return res.status(400).json({ error: 'Invalid module' });

    const priceRow = await db.query(
      `SELECT * FROM module_pricing WHERE module_key=$1 AND plan_type=$2 AND is_active=TRUE`,
      [module_key, plan_type]
    );
    if (!priceRow.rows.length) return res.status(400).json({ error: 'Invalid plan type for this module' });

    const pricing = priceRow.rows[0];

    // Check for already active subscription
    const existing = await db.query(
      `SELECT * FROM subscriptions
       WHERE restaurant_id=$1 AND module_key=$2
         AND (
           status = 'pending_payment'
           OR (
             status IN ('trial','active')
             AND (expires_at IS NULL OR expires_at > NOW())
           )
         )
       ORDER BY created_at DESC
       LIMIT 1`,
      [restaurantId, module_key]
    );
    if (existing.rows.length) {
      const s = existing.rows[0];
      if (s.status === 'active' || s.status === 'trial') {
        return res.status(400).json({ error: `Module already has an ${s.status} subscription` });
      }
      if (s.status === 'pending_payment') {
        return res.status(400).json({ error: 'A payment request is already pending for this module' });
      }
    }

    // Apply group multi-branch discount if applicable
    let finalPrice = Number(pricing.price);
    let discountPct = 0;
    if (plan_type !== 'trial') {
      const restRow2 = await db.query(
        `SELECT company_group_id FROM restaurants WHERE id=$1`, [restaurantId]
      );
      const groupId = restRow2.rows[0]?.company_group_id;
      if (groupId) {
        const branchCount = await db.query(
          `SELECT COUNT(*) as cnt FROM restaurants WHERE company_group_id=$1`, [groupId]
        );
        const cnt = parseInt(branchCount.rows[0]?.cnt || 0);
        const discount = await db.query(
          `SELECT discount_pct FROM group_branch_discounts
           WHERE min_branches <= $1 ORDER BY min_branches DESC LIMIT 1`,
          [cnt]
        );
        if (discount.rows.length) {
          discountPct = Number(discount.rows[0].discount_pct);
          finalPrice = finalPrice * (1 - discountPct / 100);
        }
      }
    }

    // Trial is auto-activated, paid requires super admin approval
    const isTrial = plan_type === 'trial';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + pricing.duration_days * 86400000);

    const sub = await db.query(
      `INSERT INTO subscriptions(restaurant_id, module_key, plan_type, status, starts_at, expires_at, price)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        restaurantId, module_key, plan_type,
        isTrial ? 'trial' : 'pending_payment',
        isTrial ? now : null,
        isTrial ? expiresAt : null,
        Math.round(finalPrice * 100) / 100,
      ]
    );

    // Send email notification
    const restRow = await db.query(
      `SELECT name, email FROM restaurants WHERE id=$1`, [restaurantId]
    );
    const rest = restRow.rows[0];
    const discountNote = discountPct > 0 ? ` (${discountPct}% multi-branch discount applied)` : '';
    if (isTrial) {
      await sendEmail(
        rest.email,
        `Free Trial Activated – ${module_key}`,
        `<h2>Your free trial for <b>${module_key}</b> is now active!</h2>
         <p>Trial expires: <b>${expiresAt.toDateString()}</b></p>
         <p>Thank you for trying RestaurantOS.</p>`
      );
    } else {
      await sendEmail(
        rest.email,
        `Subscription Request Received – ${module_key}`,
        `<h2>Payment Request Received</h2>
         <p>Your request for <b>${module_key}</b> (${plan_type}) has been received.</p>
         <p>Amount due: <b>PKR ${Math.round(finalPrice).toLocaleString()}</b>${discountNote}</p>
         <p>Your subscription will be activated once payment is confirmed by our team.</p>`
      );
      const adminEmail = await getConfig('app.admin_email', 'ADMIN_EMAIL');
      if (adminEmail) {
        await sendEmail(
          adminEmail,
          `New Subscription Request – ${rest.name}`,
          `<h2>New Subscription Request</h2>
           <p>Restaurant: <b>${rest.name}</b></p>
           <p>Module: <b>${module_key}</b> | Plan: <b>${plan_type}</b></p>
           <p>Amount: <b>PKR ${Math.round(finalPrice).toLocaleString()}</b>${discountNote}</p>
           <p>Login to super admin to approve or reject.</p>`
        );
      }
    }

    res.status(201).json({ ...sub.rows[0], discount_pct: discountPct });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Super admin: list all subscriptions ──────────────────────────────────────
exports.getAllSubscriptions = async (req, res) => {
  try {
    const { status, module_key } = req.query;
    let where = 'WHERE 1=1';
    const params = [];
    if (status) { params.push(status); where += ` AND s.status=$${params.length}`; }
    if (module_key) { params.push(module_key); where += ` AND s.module_key=$${params.length}`; }

    const rows = await db.query(
      `SELECT s.*, r.name as restaurant_name, r.email as restaurant_email,
              m.name as module_name
       FROM subscriptions s
       JOIN restaurants r ON r.id = s.restaurant_id
       JOIN modules m ON m.key = s.module_key
       ${where}
       ORDER BY s.requested_at DESC`,
      params
    );
    res.json(rows.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Super admin: approve subscription ────────────────────────────────────────
exports.approveSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_notes } = req.body;

    const subRow = await db.query(`SELECT * FROM subscriptions WHERE id=$1`, [id]);
    if (!subRow.rows.length) return res.status(404).json({ error: 'Subscription not found' });
    const sub = subRow.rows[0];

    if (sub.status === 'active') return res.status(400).json({ error: 'Already active' });

    // Get pricing to determine duration
    const priceRow = await db.query(
      `SELECT * FROM module_pricing WHERE module_key=$1 AND plan_type=$2`,
      [sub.module_key, sub.plan_type]
    );
    const duration = priceRow.rows[0]?.duration_days || 30;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + duration * 86400000);

    const updated = await db.query(
      `UPDATE subscriptions SET status='active', starts_at=$1, expires_at=$2,
       approved_at=$1, payment_notes=$3, approved_by=$4 WHERE id=$5 RETURNING *`,
      [now, expiresAt, payment_notes || null, req.user.id, id]
    );

    // Email restaurant
    const restRow = await db.query(
      `SELECT r.name, r.email FROM restaurants r WHERE r.id=$1`, [sub.restaurant_id]
    );
    const rest = restRow.rows[0];
    await sendEmail(
      rest.email,
      `Subscription Activated – ${sub.module_key}`,
      `<h2>Your subscription is now active!</h2>
       <p>Module: <b>${sub.module_key}</b> (${sub.plan_type})</p>
       <p>Valid until: <b>${expiresAt.toDateString()}</b></p>
       <p>Amount paid: <b>PKR ${sub.price}</b></p>
       ${payment_notes ? `<p>Note: ${payment_notes}</p>` : ''}
       <p>Thank you for choosing RestaurantOS!</p>`
    );

    res.json(updated.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Super admin: reject subscription ─────────────────────────────────────────
exports.rejectSubscription = async (req, res) => {
  try {
    const { id } = req.params;
    const { payment_notes } = req.body;

    const subRow = await db.query(`SELECT * FROM subscriptions WHERE id=$1`, [id]);
    if (!subRow.rows.length) return res.status(404).json({ error: 'Subscription not found' });
    const sub = subRow.rows[0];

    await db.query(
      `UPDATE subscriptions SET status='rejected', payment_notes=$1 WHERE id=$2`,
      [payment_notes || null, id]
    );

    // Email restaurant
    const restRow = await db.query(
      `SELECT r.name, r.email FROM restaurants r WHERE r.id=$1`, [sub.restaurant_id]
    );
    const rest = restRow.rows[0];
    await sendEmail(
      rest.email,
      `Subscription Request Rejected – ${sub.module_key}`,
      `<h2>Subscription Request Update</h2>
       <p>Your request for <b>${sub.module_key}</b> (${sub.plan_type}) has been rejected.</p>
       ${payment_notes ? `<p>Reason: ${payment_notes}</p>` : ''}
       <p>Please contact support if you have any questions.</p>`
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── Helper: get active module keys for a restaurant ──────────────────────────
exports.getActiveModuleKeys = async (restaurantId) => {
  const rows = await db.query(
    `SELECT DISTINCT module_key FROM subscriptions
     WHERE restaurant_id=$1 AND status IN ('trial','active')
     AND (expires_at IS NULL OR expires_at > NOW())`,
    [restaurantId]
  );
  return rows.rows.map(r => r.module_key);
};

// ── Check if base subscription is expired ────────────────────────────────────
exports.checkModuleAccess = async (req, res) => {
  try {
    const { restaurantId } = req.user;
    await expireStaleSubscriptions(restaurantId);
    const modules = await exports.getActiveModuleKeys(restaurantId);
    res.json({ modules });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
