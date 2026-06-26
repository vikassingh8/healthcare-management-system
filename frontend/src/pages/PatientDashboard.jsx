import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { appointmentsAPI, ehrAPI, prescriptionsAPI, usersAPI } from '../api/api';

export default function PatientDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('appointments');
  const [appointments, setAppointments] = useState([]);
  const [ehr, setEhr] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [showBooking, setShowBooking] = useState(false);
  const [booking, setBooking] = useState({ doctor_id: '', appointment_date: '', reason: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [appt, ehrRes, prescRes, docRes] = await Promise.all([
        appointmentsAPI.getAll(),
        ehrAPI.getAll(),
        prescriptionsAPI.getAll(),
        usersAPI.getAll(),
      ]);
      setAppointments(appt.data.appointments || []);
      setEhr(ehrRes.data.records || []);
      setPrescriptions(prescRes.data.prescriptions || []);
      setDoctors(docRes.data.users || []);
    } catch (err) {
      console.error(err);
    }
  };

  const bookAppointment = async (e) => {
    e.preventDefault();
    setMsg('');
    try {
      await appointmentsAPI.create(booking);
      setMsg('Appointment booked successfully!');
      setShowBooking(false);
      setBooking({ doctor_id: '', appointment_date: '', reason: '' });
      loadData();
    } catch (err) {
      setMsg(err.response?.data?.error || 'Booking failed');
    }
  };

  const cancelAppt = async (id) => {
    if (!window.confirm('Cancel this appointment?')) return;
    try {
      await appointmentsAPI.updateStatus(id, 'CANCELLED');
      loadData();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed');
    }
  };

  const statusColor = { SCHEDULED: 'bg-yellow-100 text-yellow-800', CONFIRMED: 'bg-green-100 text-green-800', CANCELLED: 'bg-red-100 text-red-800', COMPLETED: 'bg-blue-100 text-blue-800' };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="gradient-bg text-white px-6 py-4 flex justify-between items-center shadow">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-sm font-bold">
            {user.first_name[0]}
          </div>
          <div>
            <h1 className="font-bold">HealthCare HMS</h1>
            <p className="text-xs text-blue-100">Patient Portal — {user.first_name} {user.last_name}</p>
          </div>
        </div>
        <button onClick={logout} className="text-sm bg-white bg-opacity-20 px-3 py-1.5 rounded-lg hover:bg-opacity-30">Sign Out</button>
      </header>

      <div className="max-w-5xl mx-auto p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Appointments', value: appointments.length, color: 'text-blue-600' },
            { label: 'EHR Records', value: ehr.length, color: 'text-green-600' },
            { label: 'Prescriptions', value: prescriptions.filter(p => p.status === 'ACTIVE').length, color: 'text-purple-600' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-4 shadow-sm border">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
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
            {msg && <div className="mb-3 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">{msg}</div>}

            {tab === 'appointments' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="font-semibold text-gray-700">My Appointments</h2>
                  <button onClick={() => setShowBooking(!showBooking)}
                    className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
                    + Book Appointment
                  </button>
                </div>

                {showBooking && (
                  <form onSubmit={bookAppointment} className="bg-blue-50 rounded-lg p-4 mb-4 space-y-3">
                    <h3 className="font-medium text-gray-700">Book New Appointment</h3>
                    <select value={booking.doctor_id} onChange={e => setBooking({ ...booking, doctor_id: e.target.value })} required
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">Select Doctor</option>
                      {doctors.map(d => (
                        <option key={d.id} value={d.id}>Dr. {d.first_name} {d.last_name} — {d.specialization}</option>
                      ))}
                    </select>
                    <input type="datetime-local" value={booking.appointment_date} onChange={e => setBooking({ ...booking, appointment_date: e.target.value })} required
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <input type="text" placeholder="Reason for visit" value={booking.reason} onChange={e => setBooking({ ...booking, reason: e.target.value })} required
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                    <div className="flex gap-2">
                      <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm">Confirm</button>
                      <button type="button" onClick={() => setShowBooking(false)} className="border px-4 py-2 rounded-lg text-sm">Cancel</button>
                    </div>
                  </form>
                )}

                <div className="space-y-3">
                  {appointments.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No appointments yet</p>}
                  {appointments.map(a => (
                    <div key={a.id} className="border rounded-lg p-3 flex justify-between items-start">
                      <div>
                        <p className="font-medium text-sm">Dr. {a.doctor_first} {a.doctor_last}</p>
                        <p className="text-xs text-gray-500">{a.specialization} · {new Date(a.appointment_date).toLocaleString()}</p>
                        <p className="text-xs text-gray-600 mt-1">{a.reason}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[a.status]}`}>{a.status}</span>
                        {['SCHEDULED', 'CONFIRMED'].includes(a.status) && (
                          <button onClick={() => cancelAppt(a.id)} className="text-xs text-red-500 hover:underline">Cancel</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'ehr' && (
              <div className="space-y-3">
                <h2 className="font-semibold text-gray-700 mb-3">My Health Records</h2>
                {ehr.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No health records yet</p>}
                {ehr.map(r => (
                  <div key={r.id} className="border rounded-lg p-4">
                    <div className="flex justify-between mb-2">
                      <span className="font-medium text-sm">Dr. {r.doctor_first} {r.doctor_last}</span>
                      <span className="text-xs text-gray-400">{new Date(r.visit_date).toLocaleDateString()}</span>
                    </div>
                    <div className="text-sm space-y-1">
                      <p><span className="font-medium text-gray-600">Diagnosis:</span> {r.diagnosis}</p>
                      {r.symptoms && <p><span className="font-medium text-gray-600">Symptoms:</span> {r.symptoms}</p>}
                      {r.treatment_plan && <p><span className="font-medium text-gray-600">Treatment:</span> {r.treatment_plan}</p>}
                      {r.vital_signs && <p><span className="font-medium text-gray-600">Vitals:</span> {r.vital_signs}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'prescriptions' && (
              <div className="space-y-3">
                <h2 className="font-semibold text-gray-700 mb-3">My Prescriptions</h2>
                {prescriptions.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No prescriptions yet</p>}
                {prescriptions.map(p => (
                  <div key={p.id} className="border rounded-lg p-4">
                    <div className="flex justify-between mb-2">
                      <span className="font-bold text-sm">{p.medication_name}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-0.5">
                      <p>{p.dosage} · {p.frequency} · {p.duration_days} days</p>
                      {p.instructions && <p className="text-gray-500 text-xs">{p.instructions}</p>}
                      <p className="text-xs text-gray-400">Prescribed by Dr. {p.doctor_first} {p.doctor_last} on {new Date(p.issued_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
