const db = require('../config/db');

// POST /support/tickets
exports.createTicket = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    let screenshot_url = null;
    if (req.file) {
      screenshot_url = req.file.path?.startsWith('http')
        ? req.file.path
        : `/uploads/${req.file.filename}`;
    }

    const result = await db.query(
      `INSERT INTO support_tickets(restaurant_id, created_by, title, description, screenshot_url)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [req.user.restaurantId, req.user.id, title, description || null, screenshot_url]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /support/tickets
exports.getMyTickets = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT t.*, e.full_name AS creator_name
       FROM support_tickets t
       LEFT JOIN employees e ON t.created_by = e.id
       WHERE t.restaurant_id = $1
       ORDER BY t.created_at DESC`,
      [req.user.restaurantId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /support/tickets/:id/messages  (restaurant & admin)
exports.getTicketMessages = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.user.isSuperAdmin) {
      const check = await db.query(
        `SELECT id FROM support_tickets WHERE id = $1 AND restaurant_id = $2`,
        [id, req.user.restaurantId]
      );
      if (!check.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    }
    const result = await db.query(
      `SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /support/tickets/:id/messages  (restaurant)
exports.addMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const check = await db.query(
      `SELECT id FROM support_tickets WHERE id = $1 AND restaurant_id = $2`,
      [id, req.user.restaurantId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Ticket not found' });

    const emp = await db.query(`SELECT full_name FROM employees WHERE id = $1`, [req.user.id]);
    const senderName = emp.rows[0]?.full_name || 'Restaurant';

    const result = await db.query(
      `INSERT INTO ticket_messages(ticket_id, sender_type, sender_name, message)
       VALUES($1,'restaurant',$2,$3) RETURNING *`,
      [id, senderName, message]
    );
    await db.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /admin/support/tickets
exports.getAllTickets = async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE t.status = $1`;
    }
    const result = await db.query(
      `SELECT t.*, r.name AS restaurant_name, e.full_name AS creator_name
       FROM support_tickets t
       LEFT JOIN restaurants r ON t.restaurant_id = r.id
       LEFT JOIN employees e ON t.created_by = e.id
       ${where}
       ORDER BY t.created_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET /admin/support/tickets/:id
exports.getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT t.*, r.name AS restaurant_name, e.full_name AS creator_name
       FROM support_tickets t
       LEFT JOIN restaurants r ON t.restaurant_id = r.id
       LEFT JOIN employees e ON t.created_by = e.id
       WHERE t.id = $1`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PATCH /admin/support/tickets/:id/assign
exports.assignTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to_name } = req.body;
    if (!assigned_to_name) return res.status(400).json({ error: 'assigned_to_name required' });

    const result = await db.query(
      `UPDATE support_tickets
       SET status = 'assigned', assigned_to_name = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [assigned_to_name, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PATCH /admin/support/tickets/:id/resolve
exports.resolveTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE support_tickets
       SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /admin/support/tickets/:id/messages  (admin reply)
exports.adminAddMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message required' });

    const userRow = await db.query(`SELECT full_name FROM users WHERE id = $1`, [req.user.id]);
    const senderName = userRow.rows[0]?.full_name || 'Support Team';

    const result = await db.query(
      `INSERT INTO ticket_messages(ticket_id, sender_type, sender_name, message)
       VALUES($1,'admin',$2,$3) RETURNING *`,
      [id, senderName, message]
    );
    await db.query(`UPDATE support_tickets SET updated_at = NOW() WHERE id = $1`, [id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
