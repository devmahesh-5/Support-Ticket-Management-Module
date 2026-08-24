import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  ShieldCheck,
  Bell,
  ChevronLeft,
  ChevronRight,
  Search,
  Gauge,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Sidebar({ collapsed, setCollapsed, onOpenCommandPalette }) {
  const { user } = useAuth();

  const isStaff = ['STAFF', 'TEAM_LEAD', 'DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);
  const isAdmin = ['DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);

  const roleLabels = {
    STUDENT: 'Student',
    CR: 'CR',
    STAFF: 'Staff',
    TEAM_LEAD: 'Team Lead',
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

      {/* Availability toggle now lives in the top navbar. */}
    </aside>
  );
}
