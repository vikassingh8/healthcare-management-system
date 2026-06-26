const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { getDB } = require('../database');
const { verifyToken, logAudit } = require('../middleware/auth');

const router = express.Router();

const appointmentFields = `
  a.id, a.patient_id, a.doctor_id, a.appointment_date, a.duration_minutes,
  a.status, a.reason, a.notes, a.created_at, a.updated_at,
  p.first_name AS patient_first, p.last_name AS patient_last, p.email AS patient_email,
  d.first_name AS doctor_first, d.last_name AS doctor_last, d.specialization
`;

// GET /api/appointments
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let rows;

  if (req.user.role === 'ADMIN') {
    rows = db.prepare(`
      SELECT ${appointmentFields}
      FROM appointments a
      JOIN users p ON a.patient_id = p.id
      JOIN users d ON a.doctor_id = d.id
      ORDER BY a.appointment_date DESC
    `).all();
  } else if (req.user.role === 'DOCTOR') {
    rows = db.prepare(`
      SELECT ${appointmentFields}
      FROM appointments a
      JOIN users p ON a.patient_id = p.id
      JOIN users d ON a.doctor_id = d.id
      WHERE a.doctor_id = ?
      ORDER BY a.appointment_date DESC
    `).all(req.user.id);
  } else {
    rows = db.prepare(`
      SELECT ${appointmentFields}
      FROM appointments a
      JOIN users p ON a.patient_id = p.id
      JOIN users d ON a.doctor_id = d.id
      WHERE a.patient_id = ?
      ORDER BY a.appointment_date DESC
    `).all(req.user.id);
  }

  return res.json({ appointments: rows });
});

// GET /api/appointments/:id
router.get('/:id', verifyToken, (req, res) => {
  const db = getDB();
  const row = db.prepare(`
    SELECT ${appointmentFields}
    FROM appointments a
    JOIN users p ON a.patient_id = p.id
    JOIN users d ON a.doctor_id = d.id
    WHERE a.id = ?
  `).get(req.params.id);

  if (!row) return res.status(404).json({ error: 'Appointment not found' });

  const isOwner = req.user.id === row.patient_id || req.user.id === row.doctor_id;
  if (req.user.role !== 'ADMIN' && !isOwner) {
    return res.status(403).json({ error: 'Access denied' });
  }

  return res.json({ appointment: row });
});

// POST /api/appointments
router.post('/', verifyToken, [
  body('doctor_id').isInt({ min: 1 }).withMessage('Valid doctor ID required'),
  body('appointment_date').isISO8601().withMessage('Valid appointment date required'),
  body('reason').trim().notEmpty().withMessage('Reason for visit required'),
  body('duration_minutes').optional().isInt({ min: 15, max: 120 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  if (req.user.role === 'DOCTOR') {
    return res.status(403).json({ error: 'Doctors cannot book appointments' });
  }

  const { doctor_id, appointment_date, reason, duration_minutes = 30, notes } = req.body;
  const patient_id = req.user.role === 'ADMIN' ? (req.body.patient_id || req.user.id) : req.user.id;

  const db = getDB();
  const doctor = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'DOCTOR' AND is_active = 1").get(doctor_id);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

  // Check for scheduling conflict
  // Use datetime() on both sides so ISO-format stored values compare correctly
  const conflict = db.prepare(`
    SELECT id FROM appointments
    WHERE doctor_id = ? AND status NOT IN ('CANCELLED')
      AND datetime(appointment_date) BETWEEN datetime(?, '-30 minutes') AND datetime(?, '+30 minutes')
  `).get(doctor_id, appointment_date, appointment_date);
  if (conflict) return res.status(409).json({ error: 'Doctor is unavailable at this time' });

  const result = db.prepare(`
    INSERT INTO appointments (patient_id, doctor_id, appointment_date, duration_minutes, reason, notes)
    VALUES (?, ?, datetime(?), ?, ?, ?)
  `).run(patient_id, doctor_id, appointment_date, duration_minutes, reason, notes || null);

  logAudit(req.user.id, 'CREATE_APPOINTMENT', 'APPOINTMENT', result.lastInsertRowid, req);

  const created = db.prepare(`
    SELECT ${appointmentFields}
    FROM appointments a
    JOIN users p ON a.patient_id = p.id
    JOIN users d ON a.doctor_id = d.id
    WHERE a.id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json({ message: 'Appointment booked', appointment: created });
});

// PATCH /api/appointments/:id/status
router.patch('/:id/status', verifyToken, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['CONFIRMED', 'CANCELLED', 'COMPLETED'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const db = getDB();
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found' });

  const isOwner = req.user.id === appt.patient_id || req.user.id === appt.doctor_id;
  if (req.user.role !== 'ADMIN' && !isOwner) {
    return res.status(403).json({ error: 'Access denied' });
  }

  // Patients can only cancel
  if (req.user.role === 'PATIENT' && status !== 'CANCELLED') {
    return res.status(403).json({ error: 'Patients can only cancel appointments' });
  }

  db.prepare("UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  logAudit(req.user.id, `APPOINTMENT_${status}`, 'APPOINTMENT', appt.id, req);

  return res.json({ message: `Appointment ${status.toLowerCase()}` });
});

module.exports = router;
