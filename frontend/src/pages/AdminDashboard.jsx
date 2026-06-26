import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usersAPI, appointmentsAPI, ehrAPI } from '../api/api';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [stats, setStats] = useState({ patients: 0, doctors: 0, appointments: 0, records: 0 });
  const [msg, setMsg] = useState('');

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    try {
      const [usersRes, apptRes, auditRes, ehrRes] = await Promise.all([
        usersAPI.getAll(),
        appointmentsAPI.getAll(),
        usersAPI.getAuditLogs(),
        ehrAPI.getAll(),
      ]);
      const allUsers = usersRes.data.users || [];
      setUsers(allUsers);
      setAppointments(apptRes.data.appointments || []);
      setAuditLogs(auditRes.data.logs || []);
      setStats({
        patients: allUsers.filter(u => u.role === 'PATIENT').length,
        doctors: allUsers.filter(u => u.role === 'DOCTOR').length,
        appointments: apptRes.data.appointments?.length || 0,
        records: ehrRes.data.records?.length || 0,
      });
    } catch (err) { console.error(err); }
  };

  const toggleStatus = async (u) => {
    try {
      await usersAPI.setStatus(u.id, !u.is_active);
      setMsg(`User ${u.is_active ? 'deactivated' : 'activated'}`);
      loadAll();
    } catch (err) { setMsg(err.response?.data?.error || 'Failed'); }
  };

  const changeRole = async (userId, role) => {
    try {
      await usersAPI.setRole(userId, role);
      setMsg('Role updated');
      loadAll();
    } catch (err) { setMsg(err.response?.data?.error || 'Failed'); }
  };

  const roleColor = { ADMIN: 'bg-red-100 text-red-700', DOCTOR: 'bg-blue-100 text-blue-700', PATIENT: 'bg-green-100 text-green-700' };
  const apptStatusColor = { SCHEDULED: 'text-yellow-600', CONFIRMED: 'text-green-600', CANCELLED: 'text-red-600', COMPLETED: 'text-blue-600' };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="gradient-bg text-white px-6 py-4 flex justify-between items-center shadow">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center text-sm font-bold">{user.first_name[0]}</div>
          <div>
            <h1 className="font-bold">HealthCare HMS</h1>
            <p className="text-xs text-blue-100">Admin Control Panel — {user.first_name} {user.last_name}</p>
          </div>
        </div>
        <button onClick={logout} className="text-sm bg-white bg-opacity-20 px-3 py-1.5 rounded-lg hover:bg-opacity-30">Sign Out</button>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Patients', value: stats.patients, color: 'text-green-600', bg: 'bg-green-50' },
            { label: 'Doctors', value: stats.doctors, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Appointments', value: stats.appointments, color: 'text-purple-600', bg: 'bg-purple-50' },
            { label: 'EHR Records', value: stats.records, color: 'text-orange-600', bg: 'bg-orange-50' },
          ].map(s => (
            <div key={s.label} className={`${s.bg} rounded-xl p-4 shadow-sm border`}>
              <div className={`text-3xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-sm text-gray-600 mt-1">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="flex border-b overflow-x-auto">
            {['users', 'appointments', 'audit'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-3 text-sm font-medium capitalize whitespace-nowrap px-4 transition ${tab === t ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'audit' ? 'Audit Logs' : t}
              </button>
            ))}
          </div>

          <div className="p-4">
            {msg && <div className="mb-3 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">{msg}</div>}

            {tab === 'users' && (
              <div>
                <h2 className="font-semibold text-gray-700 mb-4">User Management — RBAC Administration</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        {['ID', 'Name', 'Email', 'Role', 'Status', 'Specialization', 'Joined', 'Actions'].map(h => (
                          <th key={h} className="px-3 py-2 font-medium text-gray-600 text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {users.map(u => (
                        <tr key={u.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{u.id}</td>
                          <td className="px-3 py-2 font-medium">{u.first_name} {u.last_name}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{u.email}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor[u.role]}`}>{u.role}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`text-xs ${u.is_active ? 'text-green-600' : 'text-red-500'}`}>{u.is_active ? 'Active' : 'Inactive'}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-400">{u.specialization || '—'}</td>
                          <td className="px-3 py-2 text-xs text-gray-400">{new Date(u.created_at).toLocaleDateString()}</td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button onClick={() => toggleStatus(u)}
                                className={`text-xs px-2 py-1 rounded ${u.is_active ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                                {u.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                              <select onChange={e => e.target.value && changeRole(u.id, e.target.value)} defaultValue=""
                                className="text-xs border rounded px-1 py-1">
                                <option value="">Role</option>
                                {['PATIENT', 'DOCTOR', 'ADMIN'].filter(r => r !== u.role).map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'appointments' && (
              <div>
                <h2 className="font-semibold text-gray-700 mb-4">All Appointments</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        {['ID', 'Patient', 'Doctor', 'Date & Time', 'Status', 'Reason'].map(h => (
                          <th key={h} className="px-3 py-2 font-medium text-gray-600 text-xs">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {appointments.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">{a.id}</td>
                          <td className="px-3 py-2">{a.patient_first} {a.patient_last}</td>
                          <td className="px-3 py-2">Dr. {a.doctor_first} {a.doctor_last}</td>
                          <td className="px-3 py-2 text-xs text-gray-500">{new Date(a.appointment_date).toLocaleString()}</td>
                          <td className="px-3 py-2"><span className={`text-xs font-medium ${apptStatusColor[a.status]}`}>{a.status}</span></td>
                          <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">{a.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'audit' && (
              <div>
                <h2 className="font-semibold text-gray-700 mb-4">Security Audit Trail — HIPAA Compliance Log</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        {['Timestamp', 'User', 'Role', 'Action', 'Resource', 'Resource ID', 'IP Address'].map(h => (
                          <th key={h} className="px-3 py-2 font-medium text-gray-600">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {auditLogs.map(l => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-3 py-1.5 text-gray-400">{new Date(l.timestamp).toLocaleString()}</td>
                          <td className="px-3 py-1.5 font-medium">{l.user_email || 'System'}</td>
                          <td className="px-3 py-1.5 text-gray-500">{l.user_role || '—'}</td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${l.action.includes('FAIL') ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{l.action}</span>
                          </td>
                          <td className="px-3 py-1.5 text-gray-500">{l.resource_type}</td>
                          <td className="px-3 py-1.5 text-gray-400">{l.resource_id || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-400">{l.ip_address || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
