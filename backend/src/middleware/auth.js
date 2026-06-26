const jwt = require('jsonwebtoken');
const { getDB } = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'hms-dev-secret-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '8h';

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY, issuer: 'healthcare-management-system' }
  );
}

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'healthcare-management-system' });

    const db = getDB();
    const user = db.prepare('SELECT id, email, role, is_active FROM users WHERE id = ?').get(decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User account is inactive or not found' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function logAudit(userId, action, resourceType, resourceId, req) {
  try {
    const db = getDB();
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      userId, action, resourceType, resourceId || null,
      req.ip || req.connection?.remoteAddress,
      req.headers['user-agent']
    );
  } catch (_) {}
}

module.exports = { generateToken, verifyToken, logAudit };
