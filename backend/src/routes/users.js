const express = require('express');
const { getDB } = require('../database');
const { verifyToken, logAudit } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

// GET /api/users/admin/audit-logs - MUST be before /:id to avoid shadowing
router.get('/admin/audit-logs', verifyToken, requireRole('ADMIN'), (req, res) => {
  const db = getDB();
  const logs = db.prepare(`
    SELECT al.*, u.email as user_email, u.role as user_role
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.timestamp DESC
    LIMIT 200
  `).all();
  return res.json({ logs });
});

// GET /api/users - Admin: all users; any auth: returns list of doctors for booking
router.get('/', verifyToken, (req, res) => {
  const db = getDB();

  if (req.user.role === 'ADMIN') {
    const users = db.prepare(
      'SELECT id, email, first_name, last_name, role, phone, specialization, is_active, created_at FROM users ORDER BY created_at DESC'
    ).all();
    return res.json({ users });
  }

  // Non-admins only get the list of active doctors for appointment booking
  const doctors = db.prepare(
    "SELECT id, first_name, last_name, specialization, email FROM users WHERE role = 'DOCTOR' AND is_active = 1"
  ).all();
  return res.json({ users: doctors });
});

// GET /api/users/:id - Get specific user profile
router.get('/:id', verifyToken, (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const db = getDB();

  // Patients can only see their own profile; doctors can see their patients; admins see all
  if (req.user.role === 'PATIENT' && req.user.id !== targetId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const user = db.prepare(
    'SELECT id, email, first_name, last_name, role, phone, date_of_birth, specialization, license_number, mfa_enabled, is_active, created_at FROM users WHERE id = ?'
  ).get(targetId);

  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user });
});

// PUT /api/users/:id - Update profile
router.put('/:id', verifyToken, (req, res) => {
  const targetId = parseInt(req.params.id, 10);

  // Only admin or own profile
  if (req.user.role !== 'ADMIN' && req.user.id !== targetId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { first_name, last_name, phone, date_of_birth, specialization } = req.body;
  const db = getDB();

  db.prepare(`
    UPDATE users SET
      first_name = COALESCE(?, first_name),
      last_name = COALESCE(?, last_name),
      phone = COALESCE(?, phone),
      date_of_birth = COALESCE(?, date_of_birth),
      specialization = COALESCE(?, specialization),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(first_name || null, last_name || null, phone || null, date_of_birth || null, specialization || null, targetId);

  logAudit(req.user.id, 'UPDATE_PROFILE', 'USER', targetId, req);
  const updated = db.prepare('SELECT id, email, first_name, last_name, role, phone, date_of_birth, specialization FROM users WHERE id = ?').get(targetId);
  return res.json({ message: 'Profile updated', user: updated });
});

// PATCH /api/users/:id/status - Admin: activate/deactivate
router.patch('/:id/status', verifyToken, requireRole('ADMIN'), (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { is_active } = req.body;

  const db = getDB();
  db.prepare("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?").run(is_active ? 1 : 0, targetId);
  logAudit(req.user.id, is_active ? 'ACTIVATE_USER' : 'DEACTIVATE_USER', 'USER', targetId, req);
  return res.json({ message: `User ${is_active ? 'activated' : 'deactivated'}` });
});

// PATCH /api/users/:id/role - Admin: change role
router.patch('/:id/role', verifyToken, requireRole('ADMIN'), (req, res) => {
  const targetId = parseInt(req.params.id, 10);
  const { role } = req.body;

  if (!['PATIENT', 'DOCTOR', 'ADMIN'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const db = getDB();
  db.prepare("UPDATE users SET role = ?, updated_at = datetime('now') WHERE id = ?").run(role, targetId);
  logAudit(req.user.id, 'CHANGE_ROLE', 'USER', targetId, req);
  return res.json({ message: 'Role updated' });
});

module.exports = router;
