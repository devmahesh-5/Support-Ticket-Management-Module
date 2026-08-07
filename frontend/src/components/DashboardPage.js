import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  PieChart as PieChartIcon,
  Flame
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import { ticketAPI } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mine, setMine] = useState(user?.role === 'STAFF' ? 'assigned' : '');

  const isStaff = ['STAFF', 'DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);
  const isAdmin = isStaff && user?.role !== 'STAFF';
  const isStudent = !isStaff;

  const load = (targetMine) => {
    setLoading(true);
    const params = isStaff && targetMine ? { mine: targetMine } : {};
    ticketAPI.dashboard(params)
      .then((res) => setStats(res.data))
      .catch(() => { })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(mine);
  }, [mine]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
          <span className="text-sm text-slate-500">Loading Enterprise Dashboard...</span>
        </div>
      </div>
    );
  }

  // Real backend metrics
  const openCount = stats?.open || 0;
  const closedCount = stats?.closed || 0;
  const escalatedCount = stats?.escalated || 0;
  const myTicketsCount = stats?.my_tickets || 0;
  const overdueCount = stats?.overdue || 0;

  // Real timeline dataset from backend
  const timelineData = (stats?.timeline && stats.timeline.length > 0)
    ? stats.timeline
    : [
      { day: 'Mon', created: 0, resolved: 0 },
      { day: 'Tue', created: 0, resolved: 0 },
      { day: 'Wed', created: 0, resolved: 0 },
      { day: 'Thu', created: 0, resolved: 0 },
      { day: 'Fri', created: 0, resolved: 0 },
      { day: 'Sat', created: 0, resolved: 0 },
      { day: 'Sun', created: 0, resolved: 0 },
    ];

  // Real priority distribution chart data
  const byPriority = stats?.by_priority || {};
  const priorityData = [
    { name: 'Critical', value: byPriority.CRITICAL || 0, color: '#ef4444' },
    { name: 'High', value: byPriority.HIGH || 0, color: '#f59e0b' },
    { name: 'Medium', value: byPriority.MEDIUM || 0, color: '#0070c7' },
    { name: 'Low', value: byPriority.LOW || 0, color: '#64748b' },
  ];

  const filterByStatus = (statusKey) => {
    navigate(`/tickets?status=${statusKey}`);
  };

  const filterByPriority = (priorityKey) => {
    navigate(`/tickets?priority=${priorityKey}`);
  };

  // Real overview bar chart dataset (open / resolved / overdue / escalated / assigned)
  const overviewData = [
    { name: 'Open', value: openCount, color: '#0070c7' },
    { name: 'Resolved', value: closedCount, color: '#10b981' },
    { name: 'Overdue', value: overdueCount, color: '#ef4444' },
    { name: 'Escalated', value: escalatedCount, color: '#f59e0b' },
    { name: 'Assigned to Me', value: myTicketsCount, color: '#8b5cf6' },
  ];

  const filterByOverview = (name) => {
    if (name === 'Open') return filterByStatus('OPEN');
    if (name === 'Resolved') return filterByStatus('RESOLVED');
    if (name === 'Escalated') return filterByStatus('ESCALATED_L1');
    if (name === 'Assigned to Me') return navigate('/tickets?mine=assigned');
    return navigate('/tickets');
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-brand-900 via-brand-800 to-slate-900 p-6 rounded-2xl text-white shadow-lg">
        <div>

          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {user?.full_name || user?.username}!
          </h1>

        </div>

        <div className="flex items-center gap-3">
          {isStaff && (
            <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1">
              {isAdmin && (
                <button
                  onClick={() => setMine('')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${mine === ''
                    ? 'bg-white text-brand-800 shadow-sm'
                    : 'text-brand-200 hover:text-white'
                    }`}
                >
                  All tickets
                </button>
              )}
              {[
                { value: 'assigned', label: 'Assigned' },
                { value: 'created', label: 'My Created' },
              ].map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setMine(tab.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${mine === tab.value
                    ? 'bg-white text-brand-800 shadow-sm'
                    : 'text-brand-200 hover:text-white'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
          <Link
            to="/tickets/new"
            className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 text-white font-medium text-xs shadow-md transition-all flex items-center gap-2"
          >
            <span>+ Create Ticket</span>
          </Link>
        </div>
      </div>

      {/* Charts Section */}
      {!isStudent && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Overview Bar Chart - real ticket counts */}
          <div className="lg:col-span-3 custom-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-brand-600" />
                  Ticket Overview
                </h3>
                <p className="text-xs text-slate-500">Open, resolved, overdue & escalated ticket counts (click a bar to filter)</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                Live
              </span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overviewData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" strokeOpacity={0.15} />
                  <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} interval={0} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} className="cursor-pointer" onClick={(entry) => filterByOverview(entry?.payload?.name)}>
                    {overviewData.map((entry, index) => (
                      <Cell key={`overview-cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Main Area Chart - Ticket Volume Timeline */}
          <div className="lg:col-span-2 custom-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-brand-600" />
                  Ticket Submission & Resolution Timeline
                </h3>
                <p className="text-xs text-slate-500">Real 7-day ticket submission vs resolution performance</p>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium">
                Last 7 Days
              </span>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0070c7" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#0070c7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" strokeOpacity={0.15} />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: 'none', color: '#fff', fontSize: '12px' }}
                  />
                  <Area type="monotone" dataKey="created" stroke="#0070c7" strokeWidth={3} fillOpacity={1} fill="url(#colorCreated)" name="Submitted" />
                  <Area type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorResolved)" name="Resolved" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut Chart - Priority Distribution */}
          <div className="custom-card p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <PieChartIcon className="w-5 h-5 text-amber-500" />
                  Priority Breakdown
                </h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">Click segment to filter ticket list</p>

              <div className="h-52 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={priorityData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                      onClick={(entry) => filterByPriority(entry.name.toUpperCase())}
                      className="cursor-pointer"
                    >
                      {priorityData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-100">
              {priorityData.map((item) => (
                <button
                  key={item.name}
                  onClick={() => filterByPriority(item.name.toUpperCase())}
                  className="flex items-center justify-between p-1.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-slate-600 font-medium">{item.name}</span>
                  </div>
                  <span className="font-semibold text-slate-900">{item.value}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Lower Section: Recent Tickets Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Tickets Table */}
        <div className="lg:col-span-3 custom-card overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900">Recent Ticket Requests</h3>
              <p className="text-xs text-slate-500">Active requests submitted by students & departments</p>
            </div>
            <Link to="/tickets" className="btn-secondary text-xs gap-1">
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3.5 px-4">Ticket ID</th>
                  <th className="py-3.5 px-4">Title</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Priority</th>
                  <th className="py-3.5 px-4 text-right">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {stats?.recent?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">No active tickets available</td>
                  </tr>
                ) : (
                  stats?.recent?.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-brand-600">
                        <Link to={`/tickets/${t.id}`}>{t.ticket_id}</Link>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 max-w-xs truncate">
                        <Link to={`/tickets/${t.id}`} className="hover:text-brand-600 transition-colors">
                          {t.title}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${t.status === 'OPEN' ? 'bg-blue-100 text-blue-800' :
                          t.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800' :
                            t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-800' :
                              'bg-rose-100 text-rose-800'
                          }`}>
                          {t.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded font-semibold text-[10px] ${t.priority === 'CRITICAL' ? 'bg-rose-500 text-white' :
                          t.priority === 'HIGH' ? 'bg-amber-500 text-white' :
                            'bg-slate-200 text-slate-700'
                          }`}>
                          {t.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-400">
                        {new Date(t.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
