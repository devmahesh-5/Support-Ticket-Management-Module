import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  FileSpreadsheet, 
  Users, 
  Tag, 
  Download, 
  ShieldCheck, 
  Save, 
  Check, 
  Plus, 
  Settings,
  ArrowUpDown,
  Pencil,
  Trash2
} from 'lucide-react';
import { userAPI, categoryAPI, ticketAPI, systemSettingAPI } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogClose } from './ui/dialog';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [tab, setTab] = useState('stats');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [allowTwoWay, setAllowTwoWay] = useState(true);
  const [savingCategory, setSavingCategory] = useState(null);

  const STAFF_ROLES = ['STAFF', 'DEPT_ADMIN', 'CAMPUS_ADMIN'];
  const STAFF_TYPE_BY_DEPARTMENT = {
    CIV: ['LAB', 'TEACHER'],
    ELE: ['LAB', 'TEACHER'],
    COM: ['LAB', 'TEACHER'],
    MEC: ['LAB', 'TEACHER'],
    ARC: ['LAB', 'TEACHER'],
    APP: ['LAB', 'TEACHER'],
    CIT: ['IT'],
    FIN: ['FINANCE'],
    ACA: ['ACADEMIC'],
    LIB: ['LIBRARY'],
    FAC: ['FACILITIES'],
  };
  const staffTypeOptions = (dept) => STAFF_TYPE_BY_DEPARTMENT[dept] || [];
  const DEPARTMENTS = [
    { value: 'CIV', label: 'Civil Engineering' },
    { value: 'ELE', label: 'Electrical Engineering' },
    { value: 'COM', label: 'Computer Engineering' },
    { value: 'MEC', label: 'Mechanical Engineering' },
    { value: 'ARC', label: 'Architecture' },
    { value: 'APP', label: 'Applied Sciences' },
    { value: 'CIT', label: 'IT Support' },
    { value: 'FIN', label: 'Finance' },
    { value: 'ACA', label: 'Academic Affairs' },
    { value: 'LIB', label: 'Library' },
    { value: 'FAC', label: 'Facilities' },
  ];
  const canManageAll = user?.role === 'CAMPUS_ADMIN';
  const isHod = user?.role === 'DEPT_ADMIN';

  const [newUser, setNewUser] = useState({
    username: '', 
    email: '', 
    password: '',
    first_name: '', 
    last_name: '', 
    role: user?.role === 'DEPT_ADMIN' ? 'STAFF' : 'STUDENT',
    department: user?.role === 'DEPT_ADMIN' ? (user.department || '') : '',
    staff_type: '',
    level: 1,
  });

  const [editingUser, setEditingUser] = useState(null);

  const [editedCategories, setEditedCategories] = useState({});

  useEffect(() => {
    userAPI.list().then((u) => setUsers(u.data.results || u.data || [])).catch(() => {});
    categoryAPI.list().then((c) => {
      const catList = c.data.results || c.data || [];
      setCategories(catList);
      const initialCatMap = {};
      catList.forEach((cat) => {
        initialCatMap[cat.id] = {
          sla_response_hours: cat.sla_response_hours,
          sla_resolution_hours: cat.sla_resolution_hours,
        };
      });
      setEditedCategories(initialCatMap);
    }).catch(() => {});
    
    ticketAPI.stats().then((s) => setStats(s.data)).catch(() => {});
    systemSettingAPI.get().then((s) => setAllowTwoWay(s.data.allow_two_way_escalation)).catch(() => {});
    loadReport();
  }, []);

  const loadReport = async (from = dateFrom, to = dateTo) => {
    setReportLoading(true);
    try {
      const params = {};
      if (from) params.start = from;
      if (to) params.end = to;
      const res = await ticketAPI.report(params);
      setReport(res.data);
    } catch {
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = {};
      if (dateFrom) params.start = dateFrom;
      if (dateTo) params.end = dateTo;
      const res = await ticketAPI.exportTickets(params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tickets_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (!newUser.password) {
      alert('Password is required to create a user.');
      return;
    }
    const payload = { ...newUser };
    if (isHod) {
      payload.role = 'STAFF';
      payload.department = user.department || '';
    }
    if (!payload.staff_type) delete payload.staff_type;
    try {
      await userAPI.create(payload);
      const res = await userAPI.list();
      setUsers(res.data.results || res.data || []);
      setNewUser({ username: '', email: '', password: '', first_name: '', last_name: '', role: isHod ? 'STAFF' : 'STUDENT', department: isHod ? (user.department || '') : '', staff_type: '', level: 1 });
      alert('User created successfully!');
    } catch (err) {
      alert(err?.response?.data?.password?.[0] || err?.response?.data?.username?.[0] || err?.response?.data?.email?.[0] || 'Failed to create user.');
    }
  };

  const updateUserLevel = async (userId, newLevel) => {
    try {
      await userAPI.update(userId, { level: newLevel });
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, level: newLevel } : u));
    } catch {}
  };

  const updateUser = async (e) => {
    e.preventDefault();
    const payload = { ...editingUser };
    delete payload.id;
    delete payload.full_name;
    delete payload.date_joined;
    delete payload.is_available;
    if (!payload.staff_type) delete payload.staff_type;
    if (!payload.department) delete payload.department;
    if (!payload.password) delete payload.password;
    if (payload.role !== 'STAFF') {
      delete payload.level;
      delete payload.staff_type;
    }
    if (isHod) {
      payload.role = 'STAFF';
      payload.department = editingUser.department || user.department || '';
    }
    try {
      const res = await userAPI.update(editingUser.id, payload);
      setUsers((prev) => prev.map((u) => u.id === editingUser.id ? res.data : u));
      setEditingUser(null);
      alert('User updated successfully!');
    } catch (err) {
      alert(err?.response?.data?.password?.[0] || err?.response?.data?.email?.[0] || 'Failed to update user.');
    }
  };

  const deleteUser = async (id, username) => {
    if (!window.confirm(`Delete user "${username}"? This cannot be undone.`)) return;
    try {
      await userAPI.remove(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      alert('User deleted.');
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to delete user.');
    }
  };

  const handleToggleTwoWay = async (e) => {
    const val = e.target.checked;
    setAllowTwoWay(val);
    try {
      await systemSettingAPI.update({ allow_two_way_escalation: val });
    } catch {}
  };

  const handleSaveCategory = async (catSlug, catName) => {
    setSavingCategory(catSlug);
    try {
      const payload = editedCategories[catName];
      const res = await categoryAPI.update(catSlug, payload);
      setCategories((prev) => prev.map((c) => c.slug === catSlug ? res.data : c));
      alert('Category estimated hours saved successfully!');
    } catch {
      alert('Failed to update category.');
    } finally {
      setSavingCategory(null);
    }
  };

  if (user?.role !== 'CAMPUS_ADMIN' && user?.role !== 'DEPT_ADMIN') {
    return (
      <div className="p-8 bg-rose-50 rounded-2xl border border-rose-200 text-rose-700 text-center font-medium text-sm">
        Access Denied. Campus Administrator or HOD clearance required.
      </div>
    );
  }

  const tabs = [
    { key: 'stats', label: 'Executive BI Stats', icon: BarChart3 },
    { key: 'reports', label: 'Analytics Reports', icon: FileSpreadsheet },
    { key: 'users', label: 'User Roster & Levels', icon: Users },
    { key: 'categories', label: 'Categories & Target Times', icon: Tag },
    { key: 'settings', label: 'Escalation Policy', icon: Settings },
  ];

  return (
    <div className="space-y-6">
      {/* Admin Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-brand-600" />
            Enterprise Administration & Policy Settings
          </h1>
          <p className="text-xs text-slate-500">Departmental metrics, staff escalation levels, 2-way policy, and category estimated target times</p>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto pb-px">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-b-2 whitespace-nowrap ${
                isActive
                  ? 'border-brand-600 text-brand-600 bg-slate-50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* STATS TAB */}
      {tab === 'stats' && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="custom-card p-5">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Tickets</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div>
            </div>
            <div className="custom-card p-5">
              <span className="text-xs font-semibold text-slate-500 uppercase">Closed / Resolved</span>
              <div className="text-2xl font-bold text-emerald-600 mt-1">{stats.by_status?.CLOSED || 0}</div>
            </div>
            <div className="custom-card p-5">
              <span className="text-xs font-semibold text-slate-500 uppercase">Overdue Tickets</span>
              <div className="text-2xl font-bold text-rose-600 mt-1">{stats.overdue || 0}</div>
            </div>
            <div className="custom-card p-5">
              <span className="text-xs font-semibold text-slate-500 uppercase">Avg Resolution Time</span>
              <div className="text-2xl font-bold text-brand-600 mt-1">
                {stats.avg_resolution_hours ? `${stats.avg_resolution_hours}h` : 'N/A'}
              </div>
            </div>
          </div>

          <div className="custom-card p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Tickets by Category Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Category</th>
                    <th className="p-3">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(stats.by_category || {}).map(([k, v]) => (
                    <tr key={k}>
                      <td className="p-3 font-medium text-slate-800">{k}</td>
                      <td className="p-3">
                        <span className="px-2.5 py-1 rounded-full bg-brand-100 text-brand-700 font-bold">
                          {v}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPORTS TAB */}
      {tab === 'reports' && (
        <div className="space-y-6">
          <div className="custom-card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="font-semibold text-slate-700">Date Range:</span>
              <input
                type="date"
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
              <button
                onClick={() => loadReport()}
                className="btn-primary text-xs"
              >
                Apply Range
              </button>
            </div>

            <button
              onClick={handleExport}
              className="btn-secondary text-xs gap-1.5"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Export Excel Report</span>
            </button>
          </div>

          {reportLoading ? (
            <div className="p-12 text-center text-slate-400">Loading BI Report Data...</div>
          ) : !report ? (
            <div className="p-8 text-center text-slate-400">No report data available.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="custom-card p-5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Weekly Ticket Submission Trend</h3>
                <div className="space-y-2 text-xs">
                  {report.weekly_trend?.map((w) => (
                    <div key={w.week} className="flex justify-between py-1.5 border-b border-slate-100">
                      <span className="text-slate-600">{w.week}</span>
                      <span className="font-bold text-brand-600">{w.tickets} tickets</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="md:col-span-2 custom-card p-5">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Staff Performance Leaderboard</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                      <tr>
                        <th className="p-2">Staff</th>
                        <th className="p-2">Dept</th>
                        <th className="p-2">Handled</th>
                        <th className="p-2">Open</th>
                        <th className="p-2">Avg Resp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.staff_metrics?.map((s, i) => (
                        <tr key={i}>
                          <td className="p-2 font-medium text-slate-900">{s.name}</td>
                          <td className="p-2 text-slate-500">{s.department || '-'}</td>
                          <td className="p-2 font-bold text-slate-800">{s.tickets_handled}</td>
                          <td className="p-2 text-amber-600">{s.open_tickets}</td>
                          <td className="p-2 text-slate-400">{s.avg_response_hours != null ? `${s.avg_response_hours}h` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* USERS TAB */}
      {tab === 'users' && (canManageAll || isHod) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="custom-card p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-600" /> Add New User
            </h3>
            <form onSubmit={createUser} className="space-y-3 text-xs">
              <input
                type="text"
                placeholder="Username *"
                required
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              />
              <input
                type="email"
                placeholder="Email"
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Password"
                required
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="First Name"
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={newUser.first_name}
                  onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                />
                <input
                  type="text"
                  placeholder="Last Name"
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={newUser.last_name}
                  onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  disabled={isHod}
                >
                  {!isHod && (
                    <>
                      <option value="STUDENT">Student</option>
                      <option value="CR">CR</option>
                      <option value="DEPT_ADMIN">Dept Admin (HOD)</option>
                      <option value="CAMPUS_ADMIN">Campus Admin</option>
                    </>
                  )}
                  <option value="STAFF">Staff</option>
                </select>
                {newUser.role === 'STAFF' && (
                  <select
                    className="p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={newUser.staff_type}
                    onChange={(e) => setNewUser({ ...newUser, staff_type: e.target.value })}
                  >
                    <option value="">Staff Type</option>
                    {staffTypeOptions(newUser.department).map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                )}
              </div>
              {isHod ? (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
                  Department: {user.department}
                </div>
              ) : (
                <select
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={newUser.department}
                  onChange={(e) => {
                    const dept = e.target.value;
                    const current = newUser.staff_type;
                    setNewUser({
                      ...newUser,
                      department: dept,
                      staff_type: staffTypeOptions(dept).includes(current) ? current : '',
                    });
                  }}
                >
                  <option value="">Department</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              )}
              {newUser.role === 'STAFF' && (
                <select
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={newUser.level}
                  onChange={(e) => setNewUser({ ...newUser, level: parseInt(e.target.value) })}
                >
                  <option value={1}>Level 1 Staff</option>
                  <option value={2}>Level 2 Staff (Senior)</option>
                </select>
              )}
              <button type="submit" className="w-full btn-primary text-xs">Create User</button>
            </form>
          </div>

          <div className="lg:col-span-2 custom-card p-5">
            <h3 className="text-sm font-bold text-slate-900 mb-4">Campus User Roster & Level Hierarchy</h3>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Username</th>
                    <th className="p-3">Full Name</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Escalation Level</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="p-3 font-mono font-medium text-brand-600">{u.username}</td>
                      <td className="p-3 font-medium text-slate-900">{u.full_name || '-'}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {u.role}
                        </span>
                        {STAFF_ROLES.includes(u.role) && u.staff_type && (
                          <span className="ms-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700">
                            {u.staff_type}
                          </span>
                        )}
                      </td>
                      <td className="p-3">
                        {u.role === 'STAFF' ? (
                          <select
                            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                            value={u.level || 1}
                            onChange={(e) => updateUserLevel(u.id, parseInt(e.target.value))}
                          >
                            <option value={1}>Level 1</option>
                            <option value={2}>Level 2</option>
                          </select>
                        ) : u.role === 'DEPT_ADMIN' ? (
                          <span className="px-2 py-1 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Level 3 (HOD)</span>
                        ) : u.role === 'CAMPUS_ADMIN' ? (
                          <span className="px-2 py-1 rounded text-[10px] font-semibold bg-amber-50 text-amber-600">Top (Admin)</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {canManageAll || u.role === 'STAFF' ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => setEditingUser({ ...u, password: '' })}
                              className="p-1.5 rounded hover:bg-brand-50 text-brand-600"
                              title="Edit user"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteUser(u.id, u.username)}
                              className="p-1.5 rounded hover:bg-rose-50 text-rose-500"
                              title="Delete user"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end text-slate-300">—</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* EDIT USER DIALOG */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        {editingUser && (
          <>
            <DialogHeader>
              <div>
                <DialogTitle>Edit User - {editingUser.username}</DialogTitle>
                <DialogDescription>Update profile, email, role, or reset the password.</DialogDescription>
              </div>
            </DialogHeader>
            <form onSubmit={updateUser} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Email</label>
                  <input
                    type="email"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Password (blank = keep current)</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Leave blank to keep current"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={editingUser.password || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, password: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">First Name</label>
                  <input
                    type="text"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={editingUser.first_name || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Last Name</label>
                  <input
                    type="text"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={editingUser.last_name || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Role</label>
                  <select
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                    disabled={isHod}
                  >
                    {!isHod && (
                      <>
                        <option value="STUDENT">Student</option>
                        <option value="CR">CR</option>
                        <option value="DEPT_ADMIN">Dept Admin (HOD)</option>
                        <option value="CAMPUS_ADMIN">Campus Admin</option>
                      </>
                    )}
                    <option value="STAFF">Staff</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Department</label>
                  {isHod ? (
                    <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                      {editingUser.department || 'None'}
                    </div>
                  ) : (
                    <select
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                      value={editingUser.department || ''}
                      onChange={(e) => {
                        const dept = e.target.value;
                        const current = editingUser.staff_type;
                        setEditingUser({
                          ...editingUser,
                          department: dept,
                          staff_type: staffTypeOptions(dept).includes(current) ? current : '',
                        });
                      }}
                    >
                      <option value="">None</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                {editingUser.role === 'STAFF' && (
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Staff Type</label>
                    <select
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                      value={editingUser.staff_type || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, staff_type: e.target.value })}
                    >
                      <option value="">None</option>
                      {staffTypeOptions(editingUser.department || user.department).map((st) => (
                        <option key={st} value={st}>{st}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Escalation Level</label>
                  {editingUser.role === 'STAFF' ? (
                    <select
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                      value={editingUser.level || 1}
                      onChange={(e) => setEditingUser({ ...editingUser, level: parseInt(e.target.value) })}
                    >
                      <option value={1}>Level 1 Staff</option>
                      <option value={2}>Level 2 Staff (Senior)</option>
                    </select>
                  ) : editingUser.role === 'DEPT_ADMIN' ? (
                    <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                      Level 3 (HOD)
                    </div>
                  ) : (
                    <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                      Top (no level)
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Phone</label>
                  <input
                    type="text"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={editingUser.phone || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 mt-6 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={!!editingUser.is_active}
                      onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.checked })}
                    />
                    <span className="text-slate-700 font-medium">Account Active</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <DialogClose onClick={() => setEditingUser(null)}>Cancel</DialogClose>
                <button type="submit" className="btn-primary text-xs">Save Changes</button>
              </div>
            </form>
          </>
        )}
      </Dialog>

      {/* CATEGORIES TAB WITH INLINE ESTIMATED HOURS EDITING */}
      {tab === 'categories' && (
        <div className="custom-card p-5 space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Category Configuration & Estimated Target Times</h3>
            <p className="text-xs text-slate-500">Edit estimated target response & resolution hours per category</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="p-3">Category Name</th>
                  <th className="p-3">Estimated Target Response (hrs)</th>
                  <th className="p-3">Estimated Target Resolution (hrs)</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => {
                  const itemState = editedCategories[c.id] || { sla_response_hours: c.sla_response_hours, sla_resolution_hours: c.sla_resolution_hours };
                  return (
                    <tr key={c.id}>
                      <td className="p-3 font-medium text-slate-900">{c.name}</td>
                      <td className="p-3">
                        <input
                          type="number"
                          min={1}
                          max={720}
                          className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                          value={itemState.sla_response_hours}
                          onChange={(e) => setEditedCategories((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], sla_response_hours: parseInt(e.target.value) || 0 }
                          }))}
                        />
                        <span className="ms-1 text-slate-400">hours</span>
                      </td>
                      <td className="p-3">
                        <input
                          type="number"
                          min={1}
                          max={720}
                          className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs"
                          value={itemState.sla_resolution_hours}
                          onChange={(e) => setEditedCategories((prev) => ({
                            ...prev,
                            [c.id]: { ...prev[c.id], sla_resolution_hours: parseInt(e.target.value) || 0 }
                          }))}
                        />
                        <span className="ms-1 text-slate-400">hours</span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleSaveCategory(c.slug, c.id)}
                          disabled={savingCategory === c.id}
                          className="btn-primary text-xs py-1 px-3 gap-1"
                        >
                          {savingCategory === c.id ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          <span>Save Changes</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ESCALATION POLICY SETTINGS TAB */}
      {tab === 'settings' && (
        <div className="custom-card p-6 space-y-4 max-w-2xl">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-brand-600" />
              Escalation Policy & Direction Control
            </h3>
            <p className="text-xs text-slate-500 mt-1">Configure whether tickets can be de-escalated back to lower management levels</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-slate-900 block">
                Allow 2-Way Escalation & De-escalation
              </span>
              <span className="text-xs text-slate-500 block mt-0.5">
                When enabled, senior staff / HODs can hand back escalated tickets to lower-level staff.
              </span>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={allowTwoWay}
                onChange={handleToggleTwoWay}
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
