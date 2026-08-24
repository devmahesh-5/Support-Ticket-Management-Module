import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Users,
  Tag,
  Download,
  ShieldCheck,
  Save,
  Check,
  Plus,
  ArrowUpDown,
  Pencil,
  Trash2
} from 'lucide-react';
import { userAPI, categoryAPI, ticketAPI, teamAPI, departmentAPI } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogClose } from './ui/dialog';

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [rosterFilter, setRosterFilter] = useState({ role: '', department: '' });
  const [categories, setCategories] = useState([]);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [tab, setTab] = useState('reports');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [staffFilter, setStaffFilter] = useState({ role: '', department: '', level: '' });

  const STAFF_ROLES = ['STAFF', 'TEAM_LEAD', 'DEPT_ADMIN', 'CAMPUS_ADMIN'];
  const LEVEL_LABELS = {
    0: 'Level 0 (Staff)',
    1: 'Level 1 (Team Lead)',
    2: 'Level 2 (HOD)',
    3: 'Level 3 (Campus Admin)',
  };
  // Dynamic departments (fetched from the API) shaped as select options.
  const [departments, setDepartments] = useState([]);
  const departmentOptions = departments
    .filter((d) => d.is_active !== false)
    .map((d) => ({ value: d.code, label: d.name }));

  // Categories are fully dynamic now: create/edit/delete with SLA fields.
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryForm, setCategoryForm] = useState({
    name: '', description: '', sla_response_hours: 24, sla_resolution_hours: 72, is_active: true,
  });

  // Departments dialog
  const [deptDialogOpen, setDeptDialogOpen] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({ code: '', name: '', description: '', is_active: true });

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
    sub_department: '',
  });

  const [editingUser, setEditingUser] = useState(null);

  // Teams (sub-departments) - created without a lead; leads are assigned
  // from the User Roster (role TEAM_LEAD + team) and synced automatically.
  const [teams, setTeams] = useState([]);
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [teamForm, setTeamForm] = useState({ name: '', department: '', description: '', is_active: true });
  const [teamDeptFilter, setTeamDeptFilter] = useState('');

  useEffect(() => {
    loadUsers();
    loadTeams();
    loadDepartments();
    loadCategories();
    loadReport();
  }, []);

  const loadReport = async (from = dateFrom, to = dateTo, sf = staffFilter) => {
    setReportLoading(true);
    try {
      const params = {};
      if (from) params.start = from;
      if (to) params.end = to;
      if (sf.role) params.staff_role = sf.role;
      if (sf.department) params.staff_department = sf.department;
      if (sf.level) params.staff_level = sf.level;
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
      // Backend tells us how many data rows were exported (excluding header).
      if (Number(res.headers['x-export-rows'] || '0') === 0) {
        alert('No tickets match the selected range - nothing to export.');
        return;
      }
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `tickets_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const loadUsers = (rf = rosterFilter) => {
    const params = {};
    if (rf.role) params.role = rf.role;
    if (rf.department) params.department = rf.department;
    userAPI.list(params)
      .then((res) => setUsers(res.data.results || res.data || []))
      .catch(() => {});
  };

  const loadTeams = () => {
    teamAPI.list().then((res) => setTeams(res.data.results || res.data || [])).catch(() => {});
  };

  const openTeamDialog = (team = null) => {
    setEditingTeam(team);
    setTeamForm(team
      ? {
          name: team.name,
          department: team.department || '',
          description: team.description || '',
          is_active: team.is_active !== false,
        }
      : { name: '', department: isHod ? (user.department || '') : '', description: '', is_active: true });
    setTeamDialogOpen(true);
  };

  const saveTeam = async (e) => {
    e.preventDefault();
    const payload = {
      name: teamForm.name,
      department: teamForm.department,
      description: teamForm.description,
      is_active: teamForm.is_active,
    };
    try {
      if (editingTeam) await teamAPI.update(editingTeam.id, payload);
      else await teamAPI.create(payload);
      setTeamDialogOpen(false);
      loadTeams();
      alert(editingTeam ? 'Team updated!' : 'Team created! Assign a lead from the User Roster tab (role: Team Lead).');
    } catch (err) {
      const data = err?.response?.data;
      alert(data?.name?.[0] || data?.detail || 'Failed to save team.');
    }
  };

  const deleteTeam = async (team) => {
    if (!window.confirm(`Delete team "${team.name}"? Members keep their accounts but lose team membership.`)) return;
    try {
      await teamAPI.remove(team.id);
      loadTeams();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to delete team.');
    }
  };

  const createUser = async (e) => {
    e.preventDefault();
    if (!newUser.password) {
      alert('Password is required to create a user.');
      return;
    }
    if (!newUser.department) {
      alert('Department is required to create a user.');
      return;
    }
    const payload = { ...newUser };
    if (isHod) {
      payload.department = user.department || '';
      // HODs can only create staff or team lead accounts.
      if (!['STAFF', 'TEAM_LEAD'].includes(payload.role)) {
        payload.role = 'STAFF';
      }
    }
    if (['STAFF', 'TEAM_LEAD'].includes(payload.role)) {
      payload.sub_department = newUser.sub_department ? Number(newUser.sub_department) : null;
    } else {
      delete payload.sub_department;
    }
    try {
      await userAPI.create(payload);
      const res = await userAPI.list();
      setUsers(res.data.results || res.data || []);
      setNewUser({ username: '', email: '', password: '', first_name: '', last_name: '', role: isHod ? 'STAFF' : 'STUDENT', department: isHod ? (user.department || '') : '', sub_department: '' });
      alert('User created successfully!');
    } catch (err) {
      alert(err?.response?.data?.password?.[0] || err?.response?.data?.username?.[0] || err?.response?.data?.email?.[0] || 'Failed to create user.');
    }
  };

  const updateUser = async (e) => {
    e.preventDefault();
    const payload = { ...editingUser };
    delete payload.id;
    delete payload.full_name;
    delete payload.date_joined;
    delete payload.is_available;
    if (!payload.department) delete payload.department;
    if (!payload.password) delete payload.password;
    if (['STAFF', 'TEAM_LEAD'].includes(payload.role)) {
      payload.sub_department = editingUser.sub_department ? Number(editingUser.sub_department) : null;
    } else {
      delete payload.sub_department;
    }
    if (isHod) {
      payload.department = editingUser.department || user.department || '';
      // HODs can only manage staff or team lead accounts.
      if (!['STAFF', 'TEAM_LEAD'].includes(payload.role)) {
        payload.role = 'STAFF';
      }
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

  const loadDepartments = () => {
    departmentAPI.list().then((res) => setDepartments(res.data.results || res.data || [])).catch(() => {});
  };

  const openDeptDialog = (dept = null) => {
    setEditingDept(dept);
    setDeptForm(dept
      ? { code: dept.code, name: dept.name, description: dept.description || '', is_active: dept.is_active !== false }
      : { code: '', name: '', description: '', is_active: true });
    setDeptDialogOpen(true);
  };

  const saveDept = async (e) => {
    e.preventDefault();
    try {
      if (editingDept) await departmentAPI.update(editingDept.id, deptForm);
      else await departmentAPI.create(deptForm);
      setDeptDialogOpen(false);
      loadDepartments();
      alert(editingDept ? 'Department updated!' : 'Department created!');
    } catch (err) {
      const data = err?.response?.data;
      alert(data?.code?.[0] || data?.name?.[0] || data?.detail || 'Failed to save department.');
    }
  };

  const deleteDept = async (dept) => {
    if (!window.confirm(`Deactivate department "${dept.name}"? Existing tickets keep their history.`)) return;
    try {
      await departmentAPI.remove(dept.id);
      loadDepartments();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to deactivate department.');
    }
  };

  const loadCategories = () => {
    categoryAPI.list().then((res) => setCategories(res.data.results || res.data || [])).catch(() => {});
  };

  const openCategoryDialog = (cat = null) => {
    setEditingCategory(cat);
    setCategoryForm(cat
      ? {
          name: cat.name,
          description: cat.description || '',
          sla_response_hours: cat.sla_response_hours ?? 24,
          sla_resolution_hours: cat.sla_resolution_hours ?? 72,
          is_active: cat.is_active !== false,
        }
      : { name: '', description: '', sla_response_hours: 24, sla_resolution_hours: 72, is_active: true });
    setCategoryDialogOpen(true);
  };

  const saveCategory = async (e) => {
    e.preventDefault();
    try {
      if (editingCategory) await categoryAPI.update(editingCategory.id, categoryForm);
      else await categoryAPI.create(categoryForm);
      setCategoryDialogOpen(false);
      loadCategories();
      alert(editingCategory ? 'Category updated!' : 'Category created!');
    } catch (err) {
      const data = err?.response?.data;
      alert(data?.name?.[0] || data?.detail || 'Failed to save category.');
    }
  };

  const deleteCategory = async (cat) => {
    if (!window.confirm(`Deactivate category "${cat.name}"? Existing tickets keep their history.`)) return;
    try {
      await categoryAPI.remove(cat.id);
      loadCategories();
    } catch (err) {
      alert(err?.response?.data?.detail || 'Failed to deactivate category.');
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
    { key: 'reports', label: 'Analytics Reports', icon: FileSpreadsheet },
    { key: 'users', label: 'User Roster', icon: Users },
    { key: 'teams', label: 'Teams & Team Leads', icon: Tag },
    { key: 'departments', label: 'Departments', icon: Tag },
    { key: 'categories', label: 'Categories & SLA Times', icon: Tag },
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

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-700">Filter Staff:</span>
              {canManageAll && (
                <select
                  className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  value={staffFilter.department}
                  onChange={(e) => { const v = { ...staffFilter, department: e.target.value }; setStaffFilter(v); loadReport(dateFrom, dateTo, v); }}
                >
                  <option value="">All Depts</option>
                  {departmentOptions.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              )}
              <select
                className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                value={staffFilter.role}
                onChange={(e) => { const v = { ...staffFilter, role: e.target.value }; setStaffFilter(v); loadReport(dateFrom, dateTo, v); }}
              >
                <option value="">All Roles</option>
                <option value="STAFF">Staff</option>
                <option value="TEAM_LEAD">Team Lead</option>
                <option value="HOD">HOD</option>
              </select>
              <select
                className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                value={staffFilter.level}
                onChange={(e) => { const v = { ...staffFilter, level: e.target.value }; setStaffFilter(v); loadReport(dateFrom, dateTo, v); }}
              >
                <option value="">All Levels</option>
                <option value="0">Level 0 (Staff)</option>
                <option value="1">Level 1 (Team Lead)</option>
                <option value="2">Level 2 (HOD)</option>
              </select>
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
                        <th className="p-2">Role</th>
                        <th className="p-2">Dept</th>
                        <th className="p-2">Team</th>
                        <th className="p-2">Level</th>
                        <th className="p-2">Assigned</th>
                        <th className="p-2">Resolved</th>
                        <th className="p-2">Open</th>
                        <th className="p-2">Overdue</th>
                        <th className="p-2">Breached</th>
                        <th className="p-2">Avg Resp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {report.staff_metrics?.map((s, i) => (
                        <tr key={i}>
                          <td className="p-2 font-medium text-slate-900">{s.name}</td>
                          <td className="p-2 text-slate-500">{s.role === 'DEPT_ADMIN' ? 'HOD' : s.role === 'TEAM_LEAD' ? 'Team Lead' : s.role}</td>
                          <td className="p-2 text-slate-500">{s.department || '-'}</td>
                          <td className="p-2 text-slate-500">{s.team || '-'}</td>
                          <td className="p-2 text-slate-500">{s.level ?? '-'}</td>
                          <td className="p-2 font-bold text-slate-800">{s.tickets_assigned}</td>
                          <td className="p-2 font-bold text-emerald-600">{s.resolved}</td>
                          <td className="p-2 text-amber-600">{s.open_tickets}</td>
                          <td className={`p-2 font-semibold ${s.overdue ? 'text-rose-600' : 'text-slate-400'}`}>{s.overdue}</td>
                          <td className={`p-2 font-semibold ${s.sla_breached ? 'text-rose-700' : 'text-slate-400'}`}>{s.sla_breached}</td>
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
                  <option value="TEAM_LEAD">Team Lead</option>
                </select>
                {isHod ? (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
                    Department: {user.department}
                  </div>
                ) : (
                  <select
                    required
                    className="p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={newUser.department}
                    onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                  >
                    <option value="">Department</option>
                    {departmentOptions.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                )}
              </div>
              {['STAFF', 'TEAM_LEAD'].includes(newUser.role) && (
                <select
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={newUser.sub_department || ''}
                  onChange={(e) => setNewUser({ ...newUser, sub_department: e.target.value })}
                >
                  <option value="">Team (sub-department)</option>
                  {teams
                    .filter((t) => !newUser.department || t.department === newUser.department)
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.department})</option>
                    ))}
                </select>
              )}
              {['STAFF', 'TEAM_LEAD'].includes(newUser.role) && (
                <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600">
                  Escalation level: {LEVEL_LABELS[newUser.role === 'TEAM_LEAD' ? 1 : 0]} (auto from role)
                </div>
              )}
              <button type="submit" className="w-full btn-primary text-xs">Create User</button>
            </form>
          </div>

          <div className="lg:col-span-2 custom-card p-5">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
              <h3 className="text-sm font-bold text-slate-900">Campus User Roster & Level Hierarchy</h3>
              {/* Roster filters */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                  value={rosterFilter.role}
                  onChange={(e) => { const v = { ...rosterFilter, role: e.target.value }; setRosterFilter(v); loadUsers(v); }}
                >
                  <option value="">All Roles</option>
                  <option value="STUDENT">Student</option>
                  <option value="CR">CR</option>
                  <option value="STAFF">Staff</option>
                  <option value="TEAM_LEAD">Team Lead</option>
                  <option value="DEPT_ADMIN">HOD</option>
                  <option value="CAMPUS_ADMIN">Campus Admin</option>
                </select>
                {canManageAll && (
                  <select
                    className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    value={rosterFilter.department}
                    onChange={(e) => { const v = { ...rosterFilter, department: e.target.value }; setRosterFilter(v); loadUsers(v); }}
                  >
                    <option value="">All Departments</option>
                    {departmentOptions.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                )}
                {(rosterFilter.role || rosterFilter.department) && (
                  <button
                    onClick={() => { setRosterFilter({ role: '', department: '' }); loadUsers({ role: '', department: '' }); }}
                    className="px-2 py-1.5 text-slate-500 hover:text-slate-700"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Username</th>
                    <th className="p-3">Full Name</th>
                    <th className="p-3">Role</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Team</th>
                    <th className="p-3">Escalation Level</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {!users.length && (
                    <tr><td colSpan={7} className="text-center py-8 text-slate-400">No users match the selected filters.</td></tr>
                  )}
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="p-3 font-mono font-medium text-brand-600">{u.username}</td>
                      <td className="p-3 font-medium text-slate-900">{u.full_name || '-'}</td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {u.role === 'TEAM_LEAD' ? 'Team Lead' : u.role}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600">{u.department || <span className="text-slate-300">—</span>}</td>
                      <td className="p-3">
                        {u.sub_department_detail ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-50 text-brand-700">
                            {u.sub_department_detail.name}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {u.role === 'STAFF' ? (
                          <span className="px-2 py-1 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Level 0 (Staff)</span>
                        ) : u.role === 'TEAM_LEAD' ? (
                          <span className="px-2 py-1 rounded text-[10px] font-semibold bg-brand-50 text-brand-700">Level 1 (Team Lead)</span>
                        ) : u.role === 'DEPT_ADMIN' ? (
                          <span className="px-2 py-1 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">Level 2 (HOD)</span>
                        ) : u.role === 'CAMPUS_ADMIN' ? (
                          <span className="px-2 py-1 rounded text-[10px] font-semibold bg-amber-50 text-amber-600">Level 3 (Campus Admin)</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        {canManageAll || (isHod && ['STAFF', 'TEAM_LEAD'].includes(u.role)) ? (
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
                    <option value="TEAM_LEAD">Team Lead</option>
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
                      onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })}
                    >
                      <option value="">None</option>
                      {departmentOptions.map((d) => (
                        <option key={d.value} value={d.value}>{d.label}</option>
                      ))}
                    </select>
                  )}
                </div>
                {['STAFF', 'TEAM_LEAD'].includes(editingUser.role) && (
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Team (sub-department)</label>
                    <select
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                      value={editingUser.sub_department || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, sub_department: e.target.value ? Number(e.target.value) : null })}
                    >
                      <option value="">None</option>
                      {teams
                        .filter((t) => !editingUser.department || t.department === editingUser.department)
                        .map((t) => (
                          <option key={t.id} value={t.id}>{t.name} ({t.department})</option>
                        ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Escalation Level</label>
                  {editingUser.role === 'STAFF' ? (
                    <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                      Level 0 (Staff)
                    </div>
                  ) : editingUser.role === 'TEAM_LEAD' ? (
                    <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                      Level 1 (Team Lead)
                    </div>
                  ) : editingUser.role === 'DEPT_ADMIN' ? (
                    <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                      Level 2 (HOD)
                    </div>
                  ) : (
                    <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                      Top (Campus Admin)
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

      {/* TEAMS TAB */}
      {tab === 'teams' && (
        <div className="custom-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Teams (Sub-departments) & Team Leads</h3>
              <p className="text-xs text-slate-500">Tickets are routed to a team's lead, who assigns them to team members. Staff levels: staff = 0, team lead = 1, HOD = 2.</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                value={teamDeptFilter}
                onChange={(e) => setTeamDeptFilter(e.target.value)}
              >
                <option value="">All Departments</option>
                {departmentOptions.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <button onClick={() => openTeamDialog(null)} className="btn-primary text-xs gap-1.5">
                <Plus className="w-4 h-4" /> New Team
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="p-3">Team</th>
                  <th className="p-3">Department</th>
                  <th className="p-3">Team Lead</th>
                  <th className="p-3">Members</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(teamDeptFilter ? teams.filter((t) => t.department === teamDeptFilter) : teams).map((t) => (
                  <tr key={t.id}>
                    <td className="p-3 font-medium text-slate-900">{t.name}</td>
                    <td className="p-3 text-slate-600">{t.department}</td>
                    <td className="p-3 text-slate-800">{t.lead_detail?.full_name || t.lead_detail?.username || <span className="text-rose-500 font-semibold">No lead assigned</span>}</td>
                    <td className="p-3 text-slate-500">{t.member_count ?? 0} staff</td>
                    <td className="p-3">
                      {t.is_active ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">Inactive</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => openTeamDialog(t)}
                          className="p-1.5 rounded hover:bg-brand-50 text-brand-600"
                          title="Edit team"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {canManageAll && (
                          <button
                            onClick={() => deleteTeam(t)}
                            className="p-1.5 rounded hover:bg-rose-50 text-rose-500"
                            title="Delete team"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!teams.length && (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-400">No teams yet. Create teams like "Lab" or "Academic" and assign team leads.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TEAM DIALOG */}
      <Dialog open={teamDialogOpen} onOpenChange={(open) => !open && setTeamDialogOpen(false)}>
        {teamDialogOpen && (
          <>
            <DialogHeader>
              <div>
                <DialogTitle>{editingTeam ? `Edit Team - ${editingTeam.name}` : 'New Team'}</DialogTitle>
                <DialogDescription>A team belongs to one department. Assign its lead from the User Roster tab afterwards.</DialogDescription>
              </div>
            </DialogHeader>
            <form onSubmit={saveTeam} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Team Name *</label>
                <input
                  type="text"
                  required
                  placeholder='e.g. "Lab", "Academic", "IT"'
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={teamForm.name}
                  onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Department *</label>
                {isHod ? (
                  <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg text-slate-600">
                    {user.department}
                  </div>
                ) : (
                  <select
                    required
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={teamForm.department}
                    onChange={(e) => setTeamForm({ ...teamForm, department: e.target.value })}
                  >
                    <option value="">Select department...</option>
                    {departmentOptions.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Description</label>
                <input
                  type="text"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={teamForm.description}
                  onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Teams are created without a lead. Assign one from the User Roster tab: set a member's
                role to <strong>Team Lead</strong> and pick this team - they become the team's lead automatically.
              </p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!teamForm.is_active}
                  onChange={(e) => setTeamForm({ ...teamForm, is_active: e.target.checked })}
                />
                <span className="text-slate-700 font-medium">Active</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <DialogClose onClick={() => setTeamDialogOpen(false)}>Cancel</DialogClose>
                <button type="submit" className="btn-primary text-xs">Save Team</button>
              </div>
            </form>
          </>
        )}
      </Dialog>

      {/* DEPARTMENTS TAB */}
      {tab === 'departments' && (
        <div className="custom-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Departments</h3>
              <p className="text-xs text-slate-500">Fully dynamic - create and manage the campus departments users can pick from.</p>
            </div>
            <button onClick={() => openDeptDialog(null)} className="btn-primary text-xs gap-1.5">
              <Plus className="w-4 h-4" /> New Department
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="p-3">Code</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departments.map((d) => (
                  <tr key={d.id}>
                    <td className="p-3 font-mono font-bold text-brand-600">{d.code}</td>
                    <td className="p-3 font-medium text-slate-900">{d.name}</td>
                    <td className="p-3">
                      {d.is_active ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">Inactive</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openDeptDialog(d)} className="p-1.5 rounded hover:bg-brand-50 text-brand-600" title="Edit department">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {canManageAll && d.is_active && (
                          <button onClick={() => deleteDept(d)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500" title="Deactivate department">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!departments.length && (
                  <tr><td colSpan={4} className="text-center py-8 text-slate-400">No departments yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DEPARTMENT DIALOG */}
      <Dialog open={deptDialogOpen} onOpenChange={(open) => !open && setDeptDialogOpen(false)}>
        {deptDialogOpen && (
          <>
            <DialogHeader>
              <div>
                <DialogTitle>{editingDept ? `Edit Department - ${editingDept.name}` : 'New Department'}</DialogTitle>
                <DialogDescription>Departments group teams (sub-departments) and are picked on every ticket.</DialogDescription>
              </div>
            </DialogHeader>
            <form onSubmit={saveDept} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Code * (short, unique)</label>
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="e.g. CSE"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg uppercase"
                    value={deptForm.code}
                    onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value.toUpperCase() })}
                    disabled={!!editingDept}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Computer Engineering"
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={deptForm.name}
                    onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Description</label>
                <input
                  type="text"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={deptForm.description}
                  onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!deptForm.is_active}
                  onChange={(e) => setDeptForm({ ...deptForm, is_active: e.target.checked })}
                />
                <span className="text-slate-700 font-medium">Active</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <DialogClose onClick={() => setDeptDialogOpen(false)}>Cancel</DialogClose>
                <button type="submit" className="btn-primary text-xs">Save Department</button>
              </div>
            </form>
          </>
        )}
      </Dialog>

      {/* CATEGORIES TAB - FULL CRUD */}
      {tab === 'categories' && (
        <div className="custom-card p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Categories & SLA Target Times</h3>
              <p className="text-xs text-slate-500">Categories only decide how fast a ticket should be handled - routing comes from the ticket's department &amp; team.</p>
            </div>
            <button onClick={() => openCategoryDialog(null)} className="btn-primary text-xs gap-1.5">
              <Plus className="w-4 h-4" /> New Category
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="p-3">Category Name</th>
                  <th className="p-3">Response SLA (hrs)</th>
                  <th className="p-3">Resolution SLA (hrs)</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-medium text-slate-900">{c.name}</td>
                    <td className="p-3 text-slate-700">{c.sla_response_hours}h</td>
                    <td className="p-3 text-slate-700">{c.sla_resolution_hours}h</td>
                    <td className="p-3">
                      {c.is_active ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Active</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-semibold">Inactive</span>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openCategoryDialog(c)} className="p-1.5 rounded hover:bg-brand-50 text-brand-600" title="Edit category">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {canManageAll && c.is_active && (
                          <button onClick={() => deleteCategory(c)} className="p-1.5 rounded hover:bg-rose-50 text-rose-500" title="Deactivate category">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!categories.length && (
                  <tr><td colSpan={5} className="text-center py-8 text-slate-400">No categories yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CATEGORY DIALOG */}
      <Dialog open={categoryDialogOpen} onOpenChange={(open) => !open && setCategoryDialogOpen(false)}>
        {categoryDialogOpen && (
          <>
            <DialogHeader>
              <div>
                <DialogTitle>{editingCategory ? `Edit Category - ${editingCategory.name}` : 'New Category'}</DialogTitle>
              </div>
            </DialogHeader>
            <form onSubmit={saveCategory} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Name *</label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  placeholder='e.g. "Lab Equipment", "Network"'
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Response SLA (hours) *</label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    required
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={categoryForm.sla_response_hours}
                    onChange={(e) => setCategoryForm({ ...categoryForm, sla_response_hours: parseInt(e.target.value) || 24 })}
                  />
                </div>
                <div>
                  <label className="block text-slate-600 mb-1 font-medium">Resolution SLA (hours) *</label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    required
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                    value={categoryForm.sla_resolution_hours}
                    onChange={(e) => setCategoryForm({ ...categoryForm, sla_resolution_hours: parseInt(e.target.value) || 72 })}
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 mb-1 font-medium">Description</label>
                <input
                  type="text"
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg"
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={!!categoryForm.is_active}
                  onChange={(e) => setCategoryForm({ ...categoryForm, is_active: e.target.checked })}
                />
                <span className="text-slate-700 font-medium">Active</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <DialogClose onClick={() => setCategoryDialogOpen(false)}>Cancel</DialogClose>
                <button type="submit" className="btn-primary text-xs">Save Category</button>
              </div>
            </form>
          </>
        )}
      </Dialog>
    </div>
  );
}
