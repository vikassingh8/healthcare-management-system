const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../database');
const { generateToken, verifyToken, logAudit } = require('../middleware/auth');

const router = express.Router();

const registerValidation = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
  body('first_name').trim().notEmpty().withMessage('First name required'),
  body('last_name').trim().notEmpty().withMessage('Last name required'),
  body('role').optional().isIn(['PATIENT', 'DOCTOR']).withMessage('Role must be PATIENT or DOCTOR'),
];

// POST /api/auth/register
router.post('/register', registerValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, first_name, last_name, role = 'PATIENT', phone, date_of_birth, specialization, license_number } = req.body;

  try {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const stmt = db.prepare(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, phone, date_of_birth, specialization, license_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(email, password_hash, first_name, last_name, role, phone || null, date_of_birth || null, specialization || null, license_number || null);

    const user = db.prepare('SELECT id, email, first_name, last_name, role FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = generateToken(user);

    logAudit(user.id, 'REGISTER', 'USER', user.id, req);

    return res.status(201).json({ message: 'Registration successful', token, user });
  } catch (err) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      logAudit(user.id, 'LOGIN_FAILED', 'USER', user.id, req);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user);
    logAudit(user.id, 'LOGIN', 'USER', user.id, req);

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        mfa_enabled: !!user.mfa_enabled,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
  const db = getDB();
  const user = db.prepare(
    'SELECT id, email, first_name, last_name, role, phone, date_of_birth, specialization, mfa_enabled, created_at FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user });
});

// POST /api/auth/change-password
router.post('/change-password', verifyToken, [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 })
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { current_password, new_password } = req.body;
  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const new_hash = await bcrypt.hash(new_password, 12);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').run(new_hash, req.user.id);
  logAudit(req.user.id, 'PASSWORD_CHANGE', 'USER', req.user.id, req);

  return res.json({ message: 'Password changed successfully' });
});

module.exports = router;
