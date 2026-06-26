const express = require('express');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../database');
const { verifyToken, logAudit } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

const router = express.Router();

const ehrFields = `
  e.id, e.patient_id, e.doctor_id, e.appointment_id, e.visit_date,
  e.diagnosis, e.symptoms, e.treatment_plan, e.lab_results, e.vital_signs, e.notes,
  e.created_at, e.updated_at,
  p.first_name AS patient_first, p.last_name AS patient_last,
  d.first_name AS doctor_first, d.last_name AS doctor_last, d.specialization
`;

// GET /api/ehr - Fetch records based on role
router.get('/', verifyToken, (req, res) => {
  const db = getDB();
  let rows;

  if (req.user.role === 'PATIENT') {
    rows = db.prepare(`
      SELECT ${ehrFields}
      FROM ehr_records e
      JOIN users p ON e.patient_id = p.id
      JOIN users d ON e.doctor_id = d.id
      WHERE e.patient_id = ?
      ORDER BY e.visit_date DESC
    `).all(req.user.id);
    logAudit(req.user.id, 'READ_OWN_EHR', 'EHR', null, req);
  } else if (req.user.role === 'DOCTOR') {
    const { patient_id } = req.query;
    const query = patient_id
      ? db.prepare(`SELECT ${ehrFields} FROM ehr_records e JOIN users p ON e.patient_id = p.id JOIN users d ON e.doctor_id = d.id WHERE e.patient_id = ? ORDER BY e.visit_date DESC`)
      : db.prepare(`SELECT ${ehrFields} FROM ehr_records e JOIN users p ON e.patient_id = p.id JOIN users d ON e.doctor_id = d.id WHERE e.doctor_id = ? ORDER BY e.visit_date DESC`);
    rows = patient_id ? query.all(patient_id) : query.all(req.user.id);
    logAudit(req.user.id, 'READ_EHR', 'EHR', null, req);
  } else {
    // ADMIN
    rows = db.prepare(`
      SELECT ${ehrFields}
      FROM ehr_records e
      JOIN users p ON e.patient_id = p.id
      JOIN users d ON e.doctor_id = d.id
      ORDER BY e.visit_date DESC
    `).all();
  }

  return res.json({ records: rows });
});

// GET /api/ehr/:id
router.get('/:id', verifyToken, (req, res) => {
  const db = getDB();
  const record = db.prepare(`
    SELECT ${ehrFields}
    FROM ehr_records e
    JOIN users p ON e.patient_id = p.id
    JOIN users d ON e.doctor_id = d.id
    WHERE e.id = ?
  `).get(req.params.id);

  if (!record) return res.status(404).json({ error: 'EHR record not found' });

  if (req.user.role === 'PATIENT' && req.user.id !== record.patient_id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  logAudit(req.user.id, 'READ_EHR_RECORD', 'EHR', record.id, req);
  return res.json({ record });
});

// POST /api/ehr - Doctor/Admin create EHR record
router.post('/', verifyToken, requireRole('DOCTOR', 'ADMIN'), [
  body('patient_id').isInt({ min: 1 }).withMessage('Valid patient ID required'),
  body('diagnosis').trim().notEmpty().withMessage('Diagnosis required'),
  body('visit_date').optional().isISO8601(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const {
    patient_id, appointment_id, diagnosis, symptoms,
    treatment_plan, lab_results, vital_signs, notes, visit_date
  } = req.body;

  const db = getDB();
  const patient = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'PATIENT'").get(patient_id);
  if (!patient) return res.status(404).json({ error: 'Patient not found' });

  const result = db.prepare(`
    INSERT INTO ehr_records
      (patient_id, doctor_id, appointment_id, visit_date, diagnosis, symptoms, treatment_plan, lab_results, vital_signs, notes)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')), ?, ?, ?, ?, ?, ?)
  `).run(patient_id, req.user.id, appointment_id || null, visit_date || null, diagnosis, symptoms || null, treatment_plan || null, lab_results || null, vital_signs || null, notes || null);

  logAudit(req.user.id, 'CREATE_EHR', 'EHR', result.lastInsertRowid, req);

  const created = db.prepare(`
    SELECT ${ehrFields} FROM ehr_records e
    JOIN users p ON e.patient_id = p.id
    JOIN users d ON e.doctor_id = d.id
    WHERE e.id = ?
  `).get(result.lastInsertRowid);

  return res.status(201).json({ message: 'EHR record created', record: created });
});

// PUT /api/ehr/:id - Doctor/Admin update
router.put('/:id', verifyToken, requireRole('DOCTOR', 'ADMIN'), (req, res) => {
  const db = getDB();
  const record = db.prepare('SELECT * FROM ehr_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'EHR record not found' });

  if (req.user.role === 'DOCTOR' && req.user.id !== record.doctor_id) {
    return res.status(403).json({ error: 'You can only edit your own records' });
  }

  const { diagnosis, symptoms, treatment_plan, lab_results, vital_signs, notes } = req.body;
  db.prepare(`
    UPDATE ehr_records SET
      diagnosis = COALESCE(?, diagnosis),
      symptoms = COALESCE(?, symptoms),
      treatment_plan = COALESCE(?, treatment_plan),
      lab_results = COALESCE(?, lab_results),
      vital_signs = COALESCE(?, vital_signs),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(diagnosis || null, symptoms || null, treatment_plan || null, lab_results || null, vital_signs || null, notes || null, req.params.id);

  logAudit(req.user.id, 'UPDATE_EHR', 'EHR', record.id, req);
  return res.json({ message: 'EHR record updated' });
});

module.exports = router;
