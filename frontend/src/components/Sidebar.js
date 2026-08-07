import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Ticket, 
  PlusCircle, 
  ShieldCheck, 
  Bell, 
  LogOut, 
  ChevronLeft, 
  ChevronRight,
  UserCheck,
  UserX,
  Search,
  Gauge,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { userAPI } from '../api/client';

export default function Sidebar({ collapsed, setCollapsed, onOpenCommandPalette }) {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const setAvailability = async (isAvailable) => {
    if (isAvailable === user?.is_available) return;
    try {
      const res = await userAPI.setAvailability({ is_available: isAvailable });
      updateUser({ is_available: res.data.is_available });
    } catch {}
  };

  const isStaff = ['STAFF', 'DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);
  const isAdmin = ['DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);

  const roleLabels = {
    STUDENT: 'Student', 
    CR: 'CR', 
    STAFF: 'Staff',
    DEPT_ADMIN: 'HOD', 
    CAMPUS_ADMIN: 'Admin',
  };

  const navItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Tickets', icon: Ticket, path: '/tickets' },
    { name: 'New Ticket', icon: PlusCircle, path: '/tickets/new' },
    { name: 'Notifications', icon: Bell, path: '/notifications' },
  ];

  if (isAdmin) {
    navItems.push(
      { name: 'Admin Panel', icon: ShieldCheck, path: '/admin' },
      { name: 'SLA Dashboard', icon: Gauge, path: '/escalations/dashboard' },
      { name: 'Escalation Policies', icon: ShieldAlert, path: '/escalations/policies' },
    );
  }

  return (
    <aside className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ease-in-out bg-white border-e border-slate-200 flex flex-col justify-between ${collapsed ? 'w-20' : 'w-64'}`}>
      <div>
        {/* Logo & Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 shadow-md shadow-brand-500/20">
              <img src="/logo.png" alt="IOE Ticket Desk" className="w-full h-full object-contain bg-brand-600" />
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-sm text-slate-900 tracking-tight truncate">
                  IOE Ticket Desk
                </span>
                <span className="text-[11px] text-slate-500 truncate">
                  Pulchowk Campus
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Search Command Palette Trigger */}
        <div className="p-3">
          <button
            onClick={onOpenCommandPalette}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 bg-slate-100 hover:bg-slate-200/60 rounded-lg border border-slate-200/80 transition-all ${collapsed ? 'justify-center' : 'justify-between'}`}
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              {!collapsed && <span>Search (Ctrl+K)</span>}
            </div>
            {!collapsed && (
              <kbd className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded shadow-xs text-slate-500">
                ⌘K
              </kbd>
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="px-3 space-y-1 mt-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-50 text-brand-600 font-semibold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  } ${collapsed ? 'justify-center' : ''}`
                }
                title={collapsed ? item.name : undefined}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.name}</span>}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Controls & Profile */}
      <div className="p-3 border-t border-slate-200 space-y-3">
        {/* Staff Availability */}
        {isStaff && (
          <div className={`flex ${collapsed ? 'flex-col gap-2' : 'gap-2'}`}>
            <button
              onClick={() => setAvailability(true)}
              className={`flex flex-1 items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                user?.is_available
                  ? 'bg-emerald-500 text-white border border-emerald-500 shadow-sm'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
              }`}
              title="Set Available"
            >
              <UserCheck className="w-3.5 h-3.5" />
              {!collapsed && <span>Available</span>}
            </button>
            <button
              onClick={() => setAvailability(false)}
              className={`flex flex-1 items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all ${
                user?.is_available === false
                  ? 'bg-amber-500 text-white border border-amber-500 shadow-sm'
                  : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              }`}
              title="Set Busy"
            >
              <UserX className="w-3.5 h-3.5" />
              {!collapsed && <span>Busy</span>}
            </button>
          </div>
        )}

        {/* User Card */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} p-2 rounded-xl bg-slate-50 border border-slate-200/80`}>
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xs shrink-0">
              {(user?.full_name || user?.username || 'U')[0].toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-slate-800 truncate">
                  {user?.full_name || user?.username}
                </span>
                <span className="text-[10px] text-slate-500 truncate">
                  {roleLabels[user?.role] || user?.role}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
