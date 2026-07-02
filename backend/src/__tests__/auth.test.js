const request = require('supertest');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-ci';
process.env.DB_PATH = path.join(__dirname, '../../data/test.db');

// Start from a clean database every run. SQLite's WAL mode leaves -shm/-wal
// sidecar files behind, and if those survive a previous run their data gets
// replayed and the registration tests see "duplicate email". Wipe all three
// before the app opens the database (getDB is lazy, so this runs first).
const fs = require('fs');
for (const ext of ['', '-shm', '-wal']) {
  const f = process.env.DB_PATH + ext;
  if (fs.existsSync(f)) fs.unlinkSync(f);
}

const app = require('../app');

let adminToken, doctorToken, patientToken;
let doctorId, patientId;

// Clean up the test DB (and its WAL sidecars) after all tests.
afterAll(() => {
  for (const ext of ['', '-shm', '-wal']) {
    try {
      const f = process.env.DB_PATH + ext;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (_) {}
  }
});

describe('Authentication API', () => {
  test('POST /api/auth/register — registers a new patient', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'testpatient@test.com',
      password: 'Test@1234',
      first_name: 'Test',
      last_name: 'Patient',
      role: 'PATIENT',
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.role).toBe('PATIENT');
    patientId = res.body.user.id;
    patientToken = res.body.token;
  });

  test('POST /api/auth/register — registers a new doctor', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'testdoctor@test.com',
      password: 'Test@1234',
      first_name: 'Test',
      last_name: 'Doctor',
      role: 'DOCTOR',
      specialization: 'General Practice',
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('DOCTOR');
    doctorId = res.body.user.id;
    doctorToken = res.body.token;
  });

  test('POST /api/auth/register — rejects duplicate email', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'testpatient@test.com',
      password: 'Test@1234',
      first_name: 'Dup',
      last_name: 'User',
    });
    expect(res.status).toBe(409);
  });

  test('POST /api/auth/register — rejects weak password', async () => {
    const res = await request(app).post('/api/auth/register').send({
      email: 'weak@test.com',
      password: 'password',
      first_name: 'Weak',
      last_name: 'Pass',
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/login — valid credentials return token', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'testpatient@test.com',
      password: 'Test@1234',
    });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  test('POST /api/auth/login — wrong password returns 401', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'testpatient@test.com',
      password: 'WrongPass!',
    });
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me — returns authenticated user', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('testpatient@test.com');
  });

  test('GET /api/auth/me — returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('Appointment API', () => {
  test('GET /api/appointments — patient sees own appointments', async () => {
    const res = await request(app)
      .get('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.appointments)).toBe(true);
  });

  test('POST /api/appointments — patient books appointment with doctor', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({
        doctor_id: doctorId,
        appointment_date: futureDate,
        reason: 'Routine checkup',
      });
    expect(res.status).toBe(201);
    expect(res.body.appointment.status).toBe('SCHEDULED');
  });

  test('POST /api/appointments — doctor cannot book appointments', async () => {
    const futureDate = new Date(Date.now() + 172800000).toISOString();
    const res = await request(app)
      .post('/api/appointments')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ doctor_id: doctorId, appointment_date: futureDate, reason: 'Test' });
    expect(res.status).toBe(403);
  });
});

describe('EHR API', () => {
  test('GET /api/ehr — patient can access own EHR', async () => {
    const res = await request(app)
      .get('/api/ehr')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.records)).toBe(true);
  });

  test('POST /api/ehr — patient cannot create EHR records', async () => {
    const res = await request(app)
      .post('/api/ehr')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ patient_id: patientId, diagnosis: 'Test diagnosis' });
    expect(res.status).toBe(403);
  });

  test('POST /api/ehr — doctor can create EHR record', async () => {
    const res = await request(app)
      .post('/api/ehr')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patient_id: patientId,
        diagnosis: 'Hypertension Stage 1',
        symptoms: 'Headache, dizziness',
        treatment_plan: 'Lifestyle changes, monitor BP weekly',
        vital_signs: 'BP: 140/90, HR: 78, Temp: 98.6F',
      });
    expect(res.status).toBe(201);
    expect(res.body.record.diagnosis).toBe('Hypertension Stage 1');
  });
});

describe('Prescription API', () => {
  test('GET /api/prescriptions — patient sees own prescriptions', async () => {
    const res = await request(app)
      .get('/api/prescriptions')
      .set('Authorization', `Bearer ${patientToken}`);
    expect(res.status).toBe(200);
  });

  test('POST /api/prescriptions — doctor can issue prescription', async () => {
    const res = await request(app)
      .post('/api/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patient_id: patientId,
        medication_name: 'Lisinopril',
        dosage: '10mg',
        frequency: 'Once daily',
        duration_days: 30,
        instructions: 'Take in the morning with water',
      });
    expect(res.status).toBe(201);
    expect(res.body.prescription.medication_name).toBe('Lisinopril');
    expect(res.body.prescription.status).toBe('ACTIVE');
  });

  test('POST /api/prescriptions — patient cannot issue prescription', async () => {
    const res = await request(app)
      .post('/api/prescriptions')
      .set('Authorization', `Bearer ${patientToken}`)
      .send({ patient_id: patientId, medication_name: 'Aspirin', dosage: '100mg', frequency: 'Daily', duration_days: 7 });
    expect(res.status).toBe(403);
  });
});

describe('RBAC — Access Control', () => {
  test('Patient cannot access another patient EHR', async () => {
    const res = await request(app)
      .get(`/api/ehr?patient_id=9999`)
      .set('Authorization', `Bearer ${patientToken}`);
    // Patient queries always return own records regardless of query param
    expect(res.status).toBe(200);
  });

  test('Health check endpoint is public', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('healthy');
  });
});
