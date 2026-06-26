import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { appointmentsAPI, ehrAPI, prescriptionsAPI } from '../api/api';

export default function DoctorDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('appointments');
  const [appointments, setAppointments] = useState([]);
  const [ehr, setEhr] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [patients, setPatients] = useState([]);
  const [showEhrForm, setShowEhrForm] = useState(false);
  const [showPrescForm, setShowPrescForm] = useState(false);
  const [ehrForm, setEhrForm] = useState({ patient_id: '', diagnosis: '', symptoms: '', treatment_plan: '', vital_signs: '', lab_results: '', notes: '' });
  const [prescForm, setPrescForm] = useState({ patient_id: '', medication_name: '', dosage: '', frequency: '', duration_days: '', instructions: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [apptRes, ehrRes, prescRes] = await Promise.all([
        appointmentsAPI.getAll(),
        ehrAPI.getAll(),
        prescriptionsAPI.getAll(),
      ]);
      setAppointments(apptRes.data.appointments || []);
      setEhr(ehrRes.data.records || []);
      setPrescriptions(prescRes.data.prescriptions || []);
      const unique = {};
      (apptRes.data.appointments || []).forEach(a => { unique[a.patient_id] = { id: a.patient_id, name: `${a.patient_first} ${a.patient_last}` }; });
      setPatients(Object.values(unique));
    } catch (err) { console.error(err); }
  };

  const updateApptStatus = async (id, status) => {
    try { await appointmentsAPI.updateStatus(id, status); loadData(); }
    catch (err) { alert(err.response?.data?.error || 'Failed'); }
  };

  const createEHR = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await ehrAPI.create(ehrForm);
      setMsg('EHR record created'); setShowEhrForm(false);
      setEhrForm({ patient_id: '', diagnosis: '', symptoms: '', treatment_plan: '', vital_signs: '', lab_results: '', notes: '' });
      loadData();
    } catch (err) { setMsg(err.response?.data?.error || 'Failed'); }
  };

  const createPrescription = async (e) => {
    e.preventDefault(); setMsg('');
    try {
      await prescriptionsAPI.create(prescForm);
      setMsg('Prescription issued'); setShowPrescForm(false);
      setPrescForm({ patient_id: '', medication_name: '', dosage: '', frequency: '', duration_days: '', instructions: '' });
      loadData();
    } catch (err) { setMsg(err.response?.data?.error || 'Failed'); }
  };

  const statusColor = { SCHEDULED: 'bg-yellow-100 text-yellow-800', CONFIRMED: 'bg-green-100 text-green-800', CANCELLED: 'bg-red-100 text-red-800', COMPLETED: 'bg-blue-100 text-blue-800' };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="gradient-bg text-white px-6 py-4 flex justify-between items-center shadow">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-sm font-bold">{user.first_name[0]}</div>
          <div>
            <h1 className="font-bold">HealthCare HMS</h1>
            <p className="text-xs text-blue-100">Doctor Portal — Dr. {user.first_name} {user.last_name}</p>
          </div>
        </div>
        <button onClick={logout} className="text-sm bg-white bg-opacity-20 px-3 py-1.5 rounded-lg hover:bg-opacity-30">Sign Out</button>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Today's Appointments", value: appointments.filter(a => new Date(a.appointment_date).toDateString() === new Date().toDateString()).length, color: 'text-blue-600' },
            { label: 'EHR Records Created', value: ehr.length, color: 'text-green-600' },
            { label: 'Active Prescriptions', value: prescriptions.filter(p => p.status === 'ACTIVE').length, color: 'text-purple-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="flex border-b">
            {['appointments', 'ehr', 'prescriptions'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium capitalize transition ${tab === t ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'ehr' ? 'Health Records' : t}
              </button>
            ))}
          </div>

          <div className="p-4">
            {msg && <div className="mb-3 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{msg}</div>}

            {tab === 'appointments' && (
              <div className="space-y-3">
                <h2 className="font-semibold text-gray-700 mb-3">My Appointments</h2>
                {appointments.map(a => (
                  <div key={a.id} className="border rounded-lg p-3 flex justify-between items-start">
                    <div>
                      <p className="font-medium text-sm">{a.patient_first} {a.patient_last}</p>
                      <p className="text-xs text-gray-400">{new Date(a.appointment_date).toLocaleString()}</p>
                      <p className="text-xs text-gray-600 mt-1">{a.reason}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[a.status]}`}>{a.status}</span>
                      {a.status === 'SCHEDULED' && (
                        <div className="flex gap-1">
                          <button onClick={() => updateApptStatus(a.id, 'CONFIRMED')} className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded">Confirm</button>
                          <button onClick={() => updateApptStatus(a.id, 'COMPLETED')} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">Complete</button>
                        </div>
                      )}
                      {a.status === 'CONFIRMED' && (
                        <button onClick={() => updateApptStatus(a.id, 'COMPLETED')} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">Mark Complete</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'ehr' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-gray-700">Electronic Health Records</h2>
                  <button onClick={() => setShowEhrForm(!showEhrForm)} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">+ New EHR</button>
                </div>
                {showEhrForm && (
                  <form onSubmit={createEHR} className="bg-blue-50 rounded-lg p-4 mb-4 space-y-3">
                    <h3 className="font-medium text-gray-700">New EHR Record</h3>
                    <select value={ehrForm.patient_id} onChange={e => setEhrForm({ ...ehrForm, patient_id: e.target.value })} required className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">Select Patient</option>
                      {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {[
                      ['diagnosis', 'Diagnosis *', true], ['symptoms', 'Symptoms'], ['treatment_plan', 'Treatment Plan'],
                      ['vital_signs', 'Vital Signs (BP, HR, Temp...)'], ['lab_results', 'Lab Results'], ['notes', 'Additional Notes']
                    ].map(([f, label, req]) => (
                      <input key={f} type="text" placeholder={label} value={ehrForm[f]} required={!!req}
                        onChange={e => setEhrForm({ ...ehrForm, [f]: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm" />
                    ))}
                    <div className="flex gap-2">
                      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Save Record</button>
                      <button type="button" onClick={() => setShowEhrForm(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
                    </div>
                  </form>
                )}
                <div className="space-y-3">
                  {ehr.map(r => (
                    <div key={r.id} className="border rounded-lg p-4">
                      <div className="flex justify-between mb-1">
                        <span className="font-medium text-sm">{r.patient_first} {r.patient_last}</span>
                        <span className="text-xs text-gray-400">{new Date(r.visit_date).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm"><span className="font-medium">Diagnosis:</span> {r.diagnosis}</p>
                      {r.symptoms && <p className="text-xs text-gray-500 mt-1">Symptoms: {r.symptoms}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'prescriptions' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-gray-700">Prescriptions</h2>
                  <button onClick={() => setShowPrescForm(!showPrescForm)} className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">+ Issue Prescription</button>
                </div>
                {showPrescForm && (
                  <form onSubmit={createPrescription} className="bg-blue-50 rounded-lg p-4 mb-4 space-y-3">
                    <h3 className="font-medium text-gray-700">Issue Prescription</h3>
                    <select value={prescForm.patient_id} onChange={e => setPrescForm({ ...prescForm, patient_id: e.target.value })} required className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">Select Patient</option>
                      {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <input type="text" placeholder="Medication Name *" value={prescForm.medication_name} onChange={e => setPrescForm({ ...prescForm, medication_name: e.target.value })} required className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="text" placeholder="Dosage *" value={prescForm.dosage} onChange={e => setPrescForm({ ...prescForm, dosage: e.target.value })} required className="border rounded-lg px-3 py-2 text-sm" />
                      <input type="text" placeholder="Frequency *" value={prescForm.frequency} onChange={e => setPrescForm({ ...prescForm, frequency: e.target.value })} required className="border rounded-lg px-3 py-2 text-sm" />
                      <input type="number" placeholder="Days *" value={prescForm.duration_days} onChange={e => setPrescForm({ ...prescForm, duration_days: e.target.value })} required min="1" className="border rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <input type="text" placeholder="Instructions" value={prescForm.instructions} onChange={e => setPrescForm({ ...prescForm, instructions: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <div className="flex gap-2">
                      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Issue</button>
                      <button type="button" onClick={() => setShowPrescForm(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
                    </div>
                  </form>
                )}
                <div className="space-y-3">
                  {prescriptions.map(p => (
                    <div key={p.id} className="border rounded-lg p-4">
                      <div className="flex justify-between">
                        <div>
                          <span className="font-medium text-sm">{p.medication_name}</span>
                          <span className="text-xs text-gray-500 ml-2">for {p.patient_first} {p.patient_last}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full ${p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{p.dosage} · {p.frequency} · {p.duration_days} days</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
