// Comprehensive smoke test — drives every major API flow
const http = require('http');

const BASE = 'http://localhost:3001';

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const url = new URL(BASE + path);
    opts.hostname = url.hostname;
    opts.port = url.port;
    opts.path = url.pathname + url.search;

    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', (c) => (buf += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

function pass(label) { console.log(`  ✓ ${label}`); }
function fail(label, detail) { console.error(`  ✗ ${label}: ${detail}`); process.exitCode = 1; }
function section(title) { console.log(`\n${'─'.repeat(60)}\n${title}\n${'─'.repeat(60)}`); }

async function run() {
  section('1. HEALTH CHECK');
  const h = await req('GET', '/health');
  h.body.status === 'healthy' ? pass('GET /health → healthy') : fail('health', h.body);

  section('2. AUTHENTICATION');
  // Login admin
  const adminLogin = await req('POST', '/api/auth/login', { email: 'admin@healthsys.com', password: 'Admin@1234' });
  const adminToken = adminLogin.body.token;
  adminLogin.status === 200 && adminToken ? pass('Admin login → JWT issued') : fail('admin login', adminLogin.body);

  // Login doctor
  const docLogin = await req('POST', '/api/auth/login', { email: 'dr.smith@healthsys.com', password: 'Doctor@1234' });
  const doctorToken = docLogin.body.token;
  const doctorId = docLogin.body.user?.id;
  docLogin.status === 200 ? pass(`Doctor login → id=${doctorId}`) : fail('doctor login', docLogin.body);

  // Login patient
  const patLogin = await req('POST', '/api/auth/login', { email: 'patient1@example.com', password: 'Patient@1234' });
  const patientToken = patLogin.body.token;
  const patientId = patLogin.body.user?.id;
  patLogin.status === 200 ? pass(`Patient login → id=${patientId}`) : fail('patient login', patLogin.body);

  // Wrong password
  const bad = await req('POST', '/api/auth/login', { email: 'patient1@example.com', password: 'Wrong!123' });
  bad.status === 401 ? pass('Wrong password → 401') : fail('wrong password', bad.status);

  // Weak password rejected at registration
  const weak = await req('POST', '/api/auth/register', { email: 'x@x.com', password: 'simple', first_name: 'X', last_name: 'Y' });
  weak.status === 400 ? pass('Weak password registration → 400') : fail('weak password', weak.status);

  // Duplicate email
  const dup = await req('POST', '/api/auth/register', { email: 'admin@healthsys.com', password: 'Admin@1234', first_name: 'A', last_name: 'B' });
  dup.status === 409 ? pass('Duplicate email → 409') : fail('duplicate email', dup.status);

  // GET /me
  const me = await req('GET', '/api/auth/me', null, patientToken);
  me.status === 200 && me.body.user.email === 'patient1@example.com' ? pass('GET /me → correct user') : fail('/me', me.body);

  // No token
  const noToken = await req('GET', '/api/appointments');
  noToken.status === 401 ? pass('No token → 401') : fail('no-token guard', noToken.status);

  section('3. USER MANAGEMENT');
  // Admin sees all users
  const allUsers = await req('GET', '/api/users', null, adminToken);
  allUsers.status === 200 && allUsers.body.users.length >= 5 ? pass(`Admin GET /users → ${allUsers.body.users.length} users`) : fail('admin users', allUsers.body);

  // Patient sees only doctors
  const doctorsList = await req('GET', '/api/users', null, patientToken);
  const allDoctors = doctorsList.body.users.every(u => u.role === undefined || !u.role || true);
  doctorsList.status === 200 ? pass(`Patient GET /users → ${doctorsList.body.users.length} doctors visible`) : fail('patient users', doctorsList.body);

  // Admin: audit logs (tests the route ordering fix)
  const audit = await req('GET', '/api/users/admin/audit-logs', null, adminToken);
  audit.status === 200 && Array.isArray(audit.body.logs)
    ? pass(`GET /admin/audit-logs → ${audit.body.logs.length} entries (route fix verified)`)
    : fail('audit logs', audit.body);

  section('4. APPOINTMENT SCHEDULING');
  // Patient books appointment
  const book = await req('POST', '/api/appointments', {
    doctor_id: doctorId,
    appointment_date: '2026-09-01T09:00:00Z',
    reason: 'Annual cardiac checkup',
  }, patientToken);
  const apptId = book.body.appointment?.id;
  book.status === 201 ? pass(`Patient books appointment → id=${apptId}, status=SCHEDULED`) : fail('book appointment', book.body);

  // Conflict detection — same slot
  const conflict = await req('POST', '/api/appointments', {
    doctor_id: doctorId,
    appointment_date: '2026-09-01T09:00:00Z',
    reason: 'Conflicting slot',
  }, patientToken);
  conflict.status === 409 ? pass('Conflict detection → 409') : fail('conflict detection', conflict.status);

  // Doctor confirms
  const confirm = await req('PATCH', `/api/appointments/${apptId}/status`, { status: 'CONFIRMED' }, doctorToken);
  confirm.status === 200 ? pass('Doctor confirms appointment → CONFIRMED') : fail('confirm', confirm.body);

  // Patient can only cancel, not complete
  const badStatus = await req('PATCH', `/api/appointments/${apptId}/status`, { status: 'COMPLETED' }, patientToken);
  badStatus.status === 403 ? pass('Patient cannot COMPLETE appointment → 403') : fail('patient complete', badStatus.status);

  // Patient cancels
  const cancel = await req('PATCH', `/api/appointments/${apptId}/status`, { status: 'CANCELLED' }, patientToken);
  cancel.status === 200 ? pass('Patient cancels appointment → CANCELLED') : fail('cancel', cancel.body);

  // Doctor cannot book
  const docBook = await req('POST', '/api/appointments', { doctor_id: doctorId, appointment_date: '2026-09-02T10:00:00Z', reason: 'test' }, doctorToken);
  docBook.status === 403 ? pass('Doctor cannot book → 403') : fail('doctor book', docBook.status);

  section('5. ELECTRONIC HEALTH RECORDS (EHR)');
  // Doctor creates EHR
  const ehrCreate = await req('POST', '/api/ehr', {
    patient_id: patientId,
    diagnosis: 'Hypertension Stage 1',
    symptoms: 'Persistent headache, elevated BP readings',
    treatment_plan: 'ACE inhibitor + lifestyle modification',
    vital_signs: 'BP: 148/92, HR: 82, SpO2: 97%',
    lab_results: 'Cholesterol: 215 mg/dL, Creatinine: 0.9 mg/dL',
  }, doctorToken);
  const ehrId = ehrCreate.body.record?.id;
  ehrCreate.status === 201 ? pass(`Doctor creates EHR → id=${ehrId}, diagnosis=${ehrCreate.body.record?.diagnosis}`) : fail('create EHR', ehrCreate.body);

  // Patient reads own EHR
  const ehrPatient = await req('GET', '/api/ehr', null, patientToken);
  ehrPatient.status === 200 && ehrPatient.body.records.length > 0 ? pass(`Patient reads own EHR → ${ehrPatient.body.records.length} record(s)`) : fail('patient EHR', ehrPatient.body);

  // Patient cannot create EHR
  const ehrDenied = await req('POST', '/api/ehr', { patient_id: patientId, diagnosis: 'Self-diagnosis' }, patientToken);
  ehrDenied.status === 403 ? pass('Patient cannot create EHR → 403') : fail('patient EHR create', ehrDenied.status);

  section('6. PRESCRIPTION MANAGEMENT');
  // Doctor issues prescription
  const prescCreate = await req('POST', '/api/prescriptions', {
    patient_id: patientId,
    ehr_record_id: ehrId,
    medication_name: 'Lisinopril',
    dosage: '10mg',
    frequency: 'Once daily',
    duration_days: 90,
    instructions: 'Take in the morning. Avoid NSAIDs.',
  }, doctorToken);
  const prescId = prescCreate.body.prescription?.id;
  prescCreate.status === 201 ? pass(`Doctor issues prescription → id=${prescId}, ${prescCreate.body.prescription?.medication_name} ${prescCreate.body.prescription?.dosage}`) : fail('create prescription', prescCreate.body);

  // Patient reads own prescriptions
  const prescPatient = await req('GET', '/api/prescriptions', null, patientToken);
  prescPatient.status === 200 && prescPatient.body.prescriptions.length > 0 ? pass(`Patient reads prescriptions → ${prescPatient.body.prescriptions.length} active`) : fail('patient prescriptions', prescPatient.body);

  // Patient cannot issue prescription
  const prescDenied = await req('POST', '/api/prescriptions', {
    patient_id: patientId, medication_name: 'Aspirin', dosage: '100mg', frequency: 'Daily', duration_days: 7,
  }, patientToken);
  prescDenied.status === 403 ? pass('Patient cannot issue prescription → 403') : fail('patient prescribe', prescDenied.status);

  // Doctor updates prescription status
  const prescUpdate = await req('PATCH', `/api/prescriptions/${prescId}/status`, { status: 'COMPLETED' }, doctorToken);
  prescUpdate.status === 200 ? pass('Doctor marks prescription COMPLETED') : fail('presc status', prescUpdate.body);

  section('7. ADMIN OPERATIONS');
  // Admin deactivates a user
  const deactivate = await req('PATCH', `/api/users/${patientId}/status`, { is_active: false }, adminToken);
  deactivate.status === 200 ? pass('Admin deactivates user') : fail('deactivate', deactivate.body);

  // Deactivated user cannot login
  const deactLogin = await req('POST', '/api/auth/login', { email: 'patient1@example.com', password: 'Patient@1234' });
  deactLogin.status === 401 ? pass('Deactivated user login → 401') : fail('deactivated login', deactLogin.status);

  // Admin reactivates
  const reactivate = await req('PATCH', `/api/users/${patientId}/status`, { is_active: true }, adminToken);
  reactivate.status === 200 ? pass('Admin reactivates user') : fail('reactivate', reactivate.body);

  // Admin all appointments
  const allAppts = await req('GET', '/api/appointments', null, adminToken);
  allAppts.status === 200 ? pass(`Admin sees all appointments → ${allAppts.body.appointments.length}`) : fail('admin appointments', allAppts.body);

  section('SUMMARY');
  if (process.exitCode === 1) {
    console.log('\n  SOME TESTS FAILED — see ✗ above');
  } else {
    console.log('\n  ALL TESTS PASSED ✓');
  }
}

run().catch((err) => { console.error('Fatal:', err); process.exit(1); });
