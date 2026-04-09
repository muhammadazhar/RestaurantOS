const jwt = require('jsonwebtoken');
const db  = require('../config/db');

const authenticate = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer '))
      return res.status(401).json({ error: 'No token provided' });

    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;          // { id, restaurantId, role, permissions }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
  if (req.user.isSuperAdmin) return next();
  const perms = req.user.permissions || [];
  if (!perms.includes(permission))
    return res.status(403).json({ error: `Permission denied: ${permission}` });
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (!req.user?.isSuperAdmin)
    return res.status(403).json({ error: 'Super admin only' });
  next();
};

module.exports = { authenticate, requirePermission, requireSuperAdmin };
