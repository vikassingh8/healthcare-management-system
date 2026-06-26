const bcrypt = require('bcryptjs');
const { getDB } = require('./database');

async function seed() {
  const db = getDB();

  const users = [
    { email: 'admin@healthsys.com', password: 'Admin@1234', first_name: 'System', last_name: 'Admin', role: 'ADMIN' },
    { email: 'dr.smith@healthsys.com', password: 'Doctor@1234', first_name: 'John', last_name: 'Smith', role: 'DOCTOR', specialization: 'Cardiology', license_number: 'MD-12345' },
    { email: 'dr.jones@healthsys.com', password: 'Doctor@1234', first_name: 'Sarah', last_name: 'Jones', role: 'DOCTOR', specialization: 'General Practice', license_number: 'MD-67890' },
    { email: 'patient1@example.com', password: 'Patient@1234', first_name: 'Alice', last_name: 'Brown', role: 'PATIENT', date_of_birth: '1990-05-15' },
    { email: 'patient2@example.com', password: 'Patient@1234', first_name: 'Bob', last_name: 'Wilson', role: 'PATIENT', date_of_birth: '1985-11-22' },
  ];

  for (const u of users) {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
    if (!existing) {
      const hash = await bcrypt.hash(u.password, 12);
      db.prepare(`
        INSERT INTO users (email, password_hash, first_name, last_name, role, date_of_birth, specialization, license_number)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(u.email, hash, u.first_name, u.last_name, u.role, u.date_of_birth || null, u.specialization || null, u.license_number || null);
      console.log(`Created user: ${u.email} (${u.role})`);
    }
  }

  console.log('\nSeed complete. Test credentials:');
  users.forEach(u => console.log(`  ${u.role}: ${u.email} / ${u.password}`));
}

seed().catch(console.error);
