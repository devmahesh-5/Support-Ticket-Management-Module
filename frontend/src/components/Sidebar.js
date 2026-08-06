import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Ticket, 
  PlusCircle, 
  ShieldCheck, 
  Bell, 
  LogOut, 
  Sun, 
  Moon, 
  ChevronLeft, 
  ChevronRight,
  Headphones,
  UserCheck,
  UserX,
  Search,
  Gauge,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { userAPI } from '../api/client';

export default function Sidebar({ collapsed, setCollapsed, onOpenCommandPalette }) {
  const { user, logout, updateUser } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleToggleAvailability = async () => {
    try {
      const res = await userAPI.setAvailability({ is_available: !user.is_available });
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
    <aside className={`fixed top-0 left-0 z-40 h-screen transition-all duration-300 ease-in-out bg-white dark:bg-[#111827] border-e border-slate-200 dark:border-slate-800/80 flex flex-col justify-between ${collapsed ? 'w-20' : 'w-64'}`}>
      <div>
        {/* Logo & Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shrink-0 shadow-md shadow-brand-500/20">
              <Headphones className="w-5 h-5" />
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-sm text-slate-900 dark:text-white tracking-tight truncate">
                  IOE Ticket Desk
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Pulchowk Campus
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Quick Search Command Palette Trigger */}
        <div className="p-3">
          <button
            onClick={onOpenCommandPalette}
            className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg border border-slate-200/80 dark:border-slate-700/50 transition-all ${collapsed ? 'justify-center' : 'justify-between'}`}
          >
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400" />
              {!collapsed && <span>Search (Ctrl+K)</span>}
            </div>
            {!collapsed && (
              <kbd className="font-mono text-[10px] bg-white dark:bg-slate-700 px-1.5 py-0.5 rounded shadow-xs text-slate-500 dark:text-slate-300">
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
                      ? 'bg-brand-50 dark:bg-brand-950/50 text-brand-600 dark:text-brand-400 font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
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
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
        {/* Dark Mode & Staff Availability */}
        <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between'}`}>
          <button
            onClick={toggleDarkMode}
            className="flex items-center gap-2 p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
            {!collapsed && <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{darkMode ? 'Light Theme' : 'Dark Theme'}</span>}
          </button>

          {isStaff && (
            <button
              onClick={handleToggleAvailability}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                user?.is_available
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
              }`}
              title={user?.is_available ? 'Currently Available' : 'Currently Busy'}
            >
              {user?.is_available ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
              {!collapsed && <span>{user?.is_available ? 'Available' : 'Busy'}</span>}
            </button>
          )}
        </div>

        {/* User Card */}
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'} p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800`}>
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-300 font-bold flex items-center justify-center text-xs shrink-0">
              {(user?.full_name || user?.username || 'U')[0].toUpperCase()}
            </div>
            {!collapsed && (
              <div className="flex flex-col truncate">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {user?.full_name || user?.username}
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {roleLabels[user?.role] || user?.role}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
