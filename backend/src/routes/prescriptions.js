const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../database');
const { verifyToken, logAudit } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

const prescFields = `
  pr.id, pr.patient_id, pr.doctor_id, pr.ehr_record_id, pr.medication_name,
  pr.dosage, pr.frequency, pr.duration_days, pr.instructions, pr.status,
  pr.issued_date, pr.expiry_date, pr.created_at,
  p.first_name AS patient_first, p.last_name AS patient_last, p.email AS patient_email,
  d.first_name AS doctor_first, d.last_name AS doctor_last, d.specialization
`;

// GET /api/prescriptions
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let rows;

  if (req.user.role === 'PATIENT') {
    rows = db.prepare(`
      SELECT ${prescFields}
      FROM prescriptions pr
      JOIN users p ON pr.patient_id = p.id
      JOIN users d ON pr.doctor_id = d.id
      WHERE pr.patient_id = ?
      ORDER BY pr.issued_date DESC
    `).all(req.user.id);
    logAudit(req.user.id, 'READ_OWN_PRESCRIPTIONS', 'PRESCRIPTION', null, req);
  } else if (req.user.role === 'DOCTOR') {
    const { patient_id } = req.query;
    if (patient_id) {
      rows = db.prepare(`
        SELECT ${prescFields}
        FROM prescriptions pr
        JOIN users p ON pr.patient_id = p.id
        JOIN users d ON pr.doctor_id = d.id
        WHERE pr.patient_id = ? AND pr.doctor_id = ?
        ORDER BY pr.issued_date DESC
      `).all(patient_id, req.user.id);
    } else {
      rows = db.prepare(`
        SELECT ${prescFields}
        FROM prescriptions pr
        JOIN users p ON pr.patient_id = p.id
        JOIN users d ON pr.doctor_id = d.id
        WHERE pr.doctor_id = ?
        ORDER BY pr.issued_date DESC
      `).all(req.user.id);
    }
  } else {
    rows = db.prepare(`
      SELECT ${prescFields}
      FROM prescriptions pr
      JOIN users p ON pr.patient_id = p.id
      JOIN users d ON pr.doctor_id = d.id
      ORDER BY pr.issued_date DESC
    `).all();
  }

  return res.json({ prescriptions: rows });
});

// GET /api/prescriptions/:id
router.get('/:id', verifyToken, (req, res) => {
  const db = getDB();
  const prescription = db.prepare(`
    SELECT ${prescFields}
    FROM prescriptions pr
    JOIN users p ON pr.patient_id = p.id
    JOIN users d ON pr.doctor_id = d.id
    WHERE pr.id = ?
  `).get(req.params.id);

  if (!prescription) return res.status(404).json({ error: 'Prescription not found' });

  const isOwner = req.user.id === prescription.patient_id || req.user.id === prescription.doctor_id;
  if (req.user.role !== 'ADMIN' && !isOwner) {
    return res.status(403).json({ error: 'Access denied' });
  }

  logAudit(req.user.id, 'READ_PRESCRIPTION', 'PRESCRIPTION', prescription.id, req);
  return res.json({ prescription });
});

// POST /api/prescriptions - Doctor only
router.post('/', verifyToken, requireRole('DOCTOR'), [
  body('patient_id').isInt({ min: 1 }),
  body('medication_name').trim().notEmpty(),
  body('dosage').trim().notEmpty(),
  body('frequency').trim().notEmpty(),
  body('duration_days').isInt({ min: 1 }),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    patient_id, ehr_record_id, medication_name, dosage,
    frequency, duration_days, instructions, expiry_date
  } = req.body;

  const db = getDB();
  const patient = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'PATIENT'").get(patient_id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const result = db.prepare(`
    INSERT INTO prescriptions
      (patient_id, doctor_id, ehr_record_id, medication_name, dosage, frequency, duration_days, instructions, expiry_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(patient_id, req.user.id, ehr_record_id || null, medication_name, dosage, frequency, duration_days, instructions || null, expiry_date || null);

  logAudit(req.user.id, 'CREATE_PRESCRIPTION', 'PRESCRIPTION', result.lastInsertRowid, req);

  const created = db.prepare(`
    SELECT ${prescFields} FROM prescriptions pr
    JOIN users p ON pr.patient_id = p.id
    JOIN users d ON pr.doctor_id = d.id
    WHERE pr.id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json({ message: 'Prescription issued', prescription: created });
});

// PATCH /api/prescriptions/:id/status - Doctor updates status
router.patch('/:id/status', verifyToken, requireRole('DOCTOR', 'ADMIN'), (req, res) => {
  const { status } = req.body;
  if (!['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const db = getDB();
  const presc = db.prepare('SELECT * FROM prescriptions WHERE id = ?').get(req.params.id);
  if (!presc) return res.status(404).json({ error: 'Prescription not found' });

  if (req.user.role === 'DOCTOR' && req.user.id !== presc.doctor_id) {
    return res.status(403).json({ error: 'You can only update your own prescriptions' });
  }

  db.prepare('UPDATE prescriptions SET status = ? WHERE id = ?').run(status, req.params.id);
  logAudit(req.user.id, `PRESCRIPTION_${status}`, 'PRESCRIPTION', presc.id, req);
  return res.json({ message: `Prescription ${status.toLowerCase()}` });
});

module.exports = router;
