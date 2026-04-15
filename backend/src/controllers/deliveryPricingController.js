const db = require('../config/db');

// ── Haversine distance (km) ───────────────────────────────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────
function pointInPolygon(lat, lng, polygon) {
  // polygon: GeoJSON Polygon coordinates[0] = [[lng,lat], ...]
  const coords = polygon.coordinates ? polygon.coordinates[0] : polygon;
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [xi, yi] = coords[i]; // [lng, lat]
    const [xj, yj] = coords[j];
    const intersect = ((yi > lat) !== (yj > lat)) &&
                      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// ── Core pricing engine ───────────────────────────────────────────────────────
/**
 * Compute delivery fee for an order.
 * Input:
 *   restaurantId, customerLat?, customerLng?, areaName?, customerPhone?
 * Returns:
 *   { zone, customerFee, riderPayout, surgeAdj, finalFee, breakdown }
 */
exports.computeDeliveryFee = async (restaurantId, { customerLat, customerLng, areaName, customerPhone } = {}) => {
  // 1. Load active zones for this restaurant
  const zonesRes = await db.query(
    `SELECT * FROM delivery_zones WHERE restaurant_id=$1 AND is_active=TRUE ORDER BY sort_order, min_km`,
    [restaurantId]
  );
  const zones = zonesRes.rows;

  if (!zones.length) return { zone: null, customerFee: 0, riderPayout: 0, surgeAdj: 0, finalFee: 0, breakdown: 'No zones configured' };

  let matchedZone = null;

  // 2a. Area-name lookup
  if (areaName && !matchedZone) {
    const areaRes = await db.query(
      `SELECT da.zone_id FROM delivery_areas da
       WHERE da.restaurant_id=$1 AND LOWER(da.name)=LOWER($2) AND da.is_active=TRUE
       LIMIT 1`,
      [restaurantId, areaName]
    );
    if (areaRes.rows.length) {
      matchedZone = zones.find(z => z.id === areaRes.rows[0].zone_id) || null;
    }
  }

  // 2b. Polygon lookup
  if (!matchedZone && customerLat != null && customerLng != null) {
    for (const z of zones) {
      if (z.polygon && pointInPolygon(parseFloat(customerLat), parseFloat(customerLng), z.polygon)) {
        matchedZone = z;
        break;
      }
    }
  }

  // 2c. Distance-range fallback
  if (!matchedZone && customerLat != null && customerLng != null) {
    const restRes = await db.query('SELECT lat, lng FROM restaurants WHERE id=$1', [restaurantId]);
    const rest = restRes.rows[0];
    if (rest && rest.lat && rest.lng) {
      const dist = haversine(parseFloat(rest.lat), parseFloat(rest.lng), parseFloat(customerLat), parseFloat(customerLng));
      for (const z of zones.sort((a, b) => parseFloat(a.min_km) - parseFloat(b.min_km))) {
        const minKm = parseFloat(z.min_km) || 0;
        const maxKm = z.max_km != null ? parseFloat(z.max_km) : Infinity;
        if (dist >= minKm && dist < maxKm) {
          matchedZone = z;
          break;
        }
      }
    }
  }

  if (!matchedZone) {
    // Default to cheapest zone if nothing matched
    matchedZone = zones[0];
  }

  let customerFee = parseFloat(matchedZone.customer_fee) || 0;
  const riderPayout = parseFloat(matchedZone.rider_payout) || 0;

  // 3. VIP / customer rule
  let customerRuleNote = null;
  if (customerPhone) {
    const ruleRes = await db.query(
      `SELECT * FROM delivery_customer_rules WHERE restaurant_id=$1 AND phone=$2 AND is_active=TRUE LIMIT 1`,
      [restaurantId, customerPhone]
    );
    if (ruleRes.rows.length) {
      const rule = ruleRes.rows[0];
      if (rule.rule_type === 'free_delivery') {
        customerFee = 0;
        customerRuleNote = 'VIP: free delivery';
      } else if (rule.rule_type === 'flat_discount') {
        customerFee = Math.max(0, customerFee - parseFloat(rule.discount_value));
        customerRuleNote = `VIP: -${rule.discount_value} flat`;
      } else if (rule.rule_type === 'pct_discount') {
        customerFee = customerFee * (1 - parseFloat(rule.discount_value) / 100);
        customerRuleNote = `VIP: -${rule.discount_value}%`;
      }
    }
  }

  // 4. Surge rules
  const surgeRes = await db.query(
    `SELECT * FROM delivery_surge_rules WHERE restaurant_id=$1 AND is_active=TRUE`,
    [restaurantId]
  );
  let surgeAdj = 0;
  const now = new Date();
  const todayDay = now.getDay() === 0 ? 7 : now.getDay(); // 1=Mon,7=Sun
  const nowTime = now.toTimeString().substring(0, 5);    // HH:MM

  for (const rule of surgeRes.rows) {
    if (rule.trigger_type === 'manual') {
      // Manual surge is always active when is_active=true
    } else if (rule.trigger_type === 'peak_hours') {
      if (!rule.start_time || !rule.end_time) continue;
      const start = rule.start_time.substring(0, 5);
      const end   = rule.end_time.substring(0, 5);
      const inWindow = start <= end ? (nowTime >= start && nowTime <= end) : (nowTime >= start || nowTime <= end);
      if (!inWindow) continue;
      if (rule.days_of_week) {
        const days = rule.days_of_week.split(',').map(Number);
        if (!days.includes(todayDay)) continue;
      }
    } else {
      continue; // weather surge — skip (requires external trigger)
    }

    if (rule.adj_type === 'flat') {
      surgeAdj += parseFloat(rule.adj_value);
    } else if (rule.adj_type === 'multiplier') {
      // Apply multiplier to current customer fee
      surgeAdj += customerFee * (parseFloat(rule.adj_value) - 1);
    }
  }

  const finalFee = Math.max(0, customerFee + surgeAdj);

  return {
    zone: { id: matchedZone.id, name: matchedZone.name },
    customerFee,
    riderPayout,
    surgeAdj,
    finalFee,
    breakdown: customerRuleNote || (surgeAdj ? `Surge +${surgeAdj}` : null),
  };
};

// ── Zones CRUD ────────────────────────────────────────────────────────────────
exports.getZones = async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM delivery_zones WHERE restaurant_id=$1 ORDER BY sort_order, min_km`,
      [req.user.restaurantId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createZone = async (req, res) => {
  try {
    const { name, sort_order = 0, min_km = 0, max_km, customer_fee, rider_payout, polygon, is_active = true } = req.body;
    const r = await db.query(
      `INSERT INTO delivery_zones (restaurant_id,name,sort_order,min_km,max_km,customer_fee,rider_payout,polygon,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.restaurantId, name, sort_order, min_km, max_km || null, customer_fee, rider_payout,
       polygon ? JSON.stringify(polygon) : null, is_active]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.updateZone = async (req, res) => {
  try {
    const { name, sort_order, min_km, max_km, customer_fee, rider_payout, polygon, is_active } = req.body;
    const r = await db.query(
      `UPDATE delivery_zones SET
         name=$1, sort_order=$2, min_km=$3, max_km=$4,
         customer_fee=$5, rider_payout=$6, polygon=$7, is_active=$8
       WHERE id=$9 AND restaurant_id=$10 RETURNING *`,
      [name, sort_order ?? 0, min_km ?? 0, max_km || null, customer_fee, rider_payout,
       polygon ? JSON.stringify(polygon) : null, is_active ?? true,
       req.params.id, req.user.restaurantId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Zone not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteZone = async (req, res) => {
  try {
    await db.query('DELETE FROM delivery_zones WHERE id=$1 AND restaurant_id=$2', [req.params.id, req.user.restaurantId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Areas CRUD ────────────────────────────────────────────────────────────────
exports.getAreas = async (req, res) => {
  try {
    const r = await db.query(
      `SELECT da.*, dz.name AS zone_name FROM delivery_areas da
       JOIN delivery_zones dz ON dz.id = da.zone_id
       WHERE da.restaurant_id=$1 ORDER BY da.name`,
      [req.user.restaurantId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createArea = async (req, res) => {
  try {
    const { zone_id, name, lat, lng, is_active = true } = req.body;
    const r = await db.query(
      `INSERT INTO delivery_areas (restaurant_id,zone_id,name,lat,lng,is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.restaurantId, zone_id, name, lat || null, lng || null, is_active]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.updateArea = async (req, res) => {
  try {
    const { zone_id, name, lat, lng, is_active } = req.body;
    const r = await db.query(
      `UPDATE delivery_areas SET zone_id=$1, name=$2, lat=$3, lng=$4, is_active=$5
       WHERE id=$6 AND restaurant_id=$7 RETURNING *`,
      [zone_id, name, lat || null, lng || null, is_active ?? true, req.params.id, req.user.restaurantId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Area not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteArea = async (req, res) => {
  try {
    await db.query('DELETE FROM delivery_areas WHERE id=$1 AND restaurant_id=$2', [req.params.id, req.user.restaurantId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Surge Rules CRUD ──────────────────────────────────────────────────────────
exports.getSurgeRules = async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM delivery_surge_rules WHERE restaurant_id=$1 ORDER BY created_at`,
      [req.user.restaurantId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createSurgeRule = async (req, res) => {
  try {
    const { name, trigger_type = 'peak_hours', start_time, end_time, days_of_week, adj_type = 'flat', adj_value, is_active = true } = req.body;
    const r = await db.query(
      `INSERT INTO delivery_surge_rules (restaurant_id,name,trigger_type,start_time,end_time,days_of_week,adj_type,adj_value,is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.user.restaurantId, name, trigger_type, start_time || null, end_time || null,
       days_of_week || null, adj_type, adj_value, is_active]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.updateSurgeRule = async (req, res) => {
  try {
    const { name, trigger_type, start_time, end_time, days_of_week, adj_type, adj_value, is_active } = req.body;
    const r = await db.query(
      `UPDATE delivery_surge_rules SET
         name=$1, trigger_type=$2, start_time=$3, end_time=$4,
         days_of_week=$5, adj_type=$6, adj_value=$7, is_active=$8
       WHERE id=$9 AND restaurant_id=$10 RETURNING *`,
      [name, trigger_type, start_time || null, end_time || null,
       days_of_week || null, adj_type, adj_value, is_active ?? true,
       req.params.id, req.user.restaurantId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Surge rule not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteSurgeRule = async (req, res) => {
  try {
    await db.query('DELETE FROM delivery_surge_rules WHERE id=$1 AND restaurant_id=$2', [req.params.id, req.user.restaurantId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Customer Rules CRUD ───────────────────────────────────────────────────────
exports.getCustomerRules = async (req, res) => {
  try {
    const r = await db.query(
      `SELECT * FROM delivery_customer_rules WHERE restaurant_id=$1 ORDER BY created_at`,
      [req.user.restaurantId]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.createCustomerRule = async (req, res) => {
  try {
    const { phone, rule_type = 'free_delivery', discount_value = 0, note, is_active = true } = req.body;
    const r = await db.query(
      `INSERT INTO delivery_customer_rules (restaurant_id,phone,rule_type,discount_value,note,is_active)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.restaurantId, phone, rule_type, discount_value, note || null, is_active]
    );
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.updateCustomerRule = async (req, res) => {
  try {
    const { phone, rule_type, discount_value, note, is_active } = req.body;
    const r = await db.query(
      `UPDATE delivery_customer_rules SET phone=$1, rule_type=$2, discount_value=$3, note=$4, is_active=$5
       WHERE id=$6 AND restaurant_id=$7 RETURNING *`,
      [phone, rule_type, discount_value ?? 0, note || null, is_active ?? true,
       req.params.id, req.user.restaurantId]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Customer rule not found' });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.deleteCustomerRule = async (req, res) => {
  try {
    await db.query('DELETE FROM delivery_customer_rules WHERE id=$1 AND restaurant_id=$2', [req.params.id, req.user.restaurantId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Preview fee (for order creation) ─────────────────────────────────────────
exports.previewFee = async (req, res) => {
  try {
    const { customerLat, customerLng, areaName, customerPhone } = req.body;
    const result = await exports.computeDeliveryFee(req.user.restaurantId, { customerLat, customerLng, areaName, customerPhone });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ── Restaurant location (origin) ──────────────────────────────────────────────
exports.getRestaurantLocation = async (req, res) => {
  try {
    const r = await db.query('SELECT lat, lng FROM restaurants WHERE id=$1', [req.user.restaurantId]);
    res.json(r.rows[0] || { lat: null, lng: null });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.saveRestaurantLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await db.query('UPDATE restaurants SET lat=$1, lng=$2 WHERE id=$3', [lat, lng, req.user.restaurantId]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};
