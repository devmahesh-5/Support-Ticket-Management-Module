import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, Search, PlusCircle, CheckCircle, Clock, AlertTriangle, X,
  LogOut, User as UserIcon, UserCheck, UserX,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notificationAPI, userAPI } from '../api/client';
import useNotificationStream from '../hooks/useNotificationStream';

const ROLE_LABELS = {
  STUDENT: 'Student',
  CR: 'Class Representative',
  STAFF: 'Staff',
  TEAM_LEAD: 'Team Lead',
  DEPT_ADMIN: 'HOD',
  CAMPUS_ADMIN: 'Campus Admin',
};

const SUPPORT_ROLES = ['STAFF', 'TEAM_LEAD', 'DEPT_ADMIN', 'CAMPUS_ADMIN'];

const isSupportRole = (u) => SUPPORT_ROLES.includes(u?.role);

const getInitials = (u) => {
  const name = u?.full_name || u?.username || 'U';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
};

function ProfileRow({ icon: Icon, label, value, tone = 'text-slate-800' }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-400 font-medium flex items-center gap-1.5 shrink-0">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </span>
      <span className={`font-semibold text-right truncate ${tone}`}>{value || '—'}</span>
    </div>
  );
}

export default function Navbar({ onOpenCommandPalette }) {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef(null);

  const isStaff = ['STAFF', 'TEAM_LEAD', 'DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);

  const setAvailability = async (isAvailable) => {
    if (isAvailable === user?.is_available) return;
    try {
      const res = await userAPI.setAvailability({ is_available: isAvailable });
      updateUser({ is_available: res.data.is_available });
    } catch {}
  };

  // Close the profile dropdown on any outside click.
  useEffect(() => {
    const onClickAway = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const handleLogout = async () => {
    setProfileOpen(false);
    await logout();
    navigate('/login');
  };

  const showToast = (notif) => {
    setToast(notif);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  const connected = useNotificationStream((notif) => {
    if (notif?.id) setUnread((prev) => prev + 1);
    if (notif?.notification_type === 'ESCALATION') showToast(notif);
  });

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const res = await notificationAPI.unreadCount();
        setUnread(res.data.unread_count || 0);
      } catch { }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, connected ? 60000 : 10000);
    return () => clearInterval(interval);
  }, [user, connected]);

  const openToast = () => {
    if (!toast) return;
    setToast(null);
    navigate('/notifications');
  };

  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Availability toggle (replaces the logo/title block) */}
        <div className="flex items-center gap-3">
          {isStaff && (
            <div
              className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200/70"
              title="Your assignment availability"
            >
              <button
                onClick={() => setAvailability(true)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  user?.is_available !== false
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-400 hover:text-emerald-600'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Available</span>
              </button>
              <button
                onClick={() => setAvailability(false)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  user?.is_available === false
                    ? 'bg-white text-amber-600 shadow-sm'
                    : 'text-slate-400 hover:text-amber-600'
                }`}
              >
                <UserX className="w-3.5 h-3.5" />
                <span>Busy</span>
              </button>
            </div>
          )}
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          {/* Quick Search */}
          <button
            onClick={onOpenCommandPalette}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200/60 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search tickets...</span>
            <kbd className="text-[10px] bg-white px-1 py-0.5 rounded text-slate-400 border border-slate-200">
              Ctrl+K
            </kbd>
          </button>

          {/* Create New Ticket */}
          <Link
            to="/tickets/new"
            className="btn-primary py-1.5 px-3 text-xs gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">New Ticket</span>
          </Link>

          {/* Notifications Bell */}
          <Link
            to="/notifications"
            className="relative p-2 rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            title={connected ? "Notifications (live)" : "Notifications"}
          >
            <Bell className="w-5 h-5" />
            {connected && (
              <span className="absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
            )}
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs animate-pulse">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>

          {/* Date Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200/60">
            <Clock className="w-3.5 h-3.5 text-brand-500" />
            <span>{formattedDate}</span>
          </div>

          {/* Profile Avatar & Dropdown */}
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => setProfileOpen((o) => !o)}
              className="w-9 h-9 rounded-full bg-brand-600 text-white font-bold text-xs flex items-center justify-center ring-2 ring-offset-1 ring-brand-200 hover:ring-brand-400 transition-all shadow-sm"
              title="Your profile"
            >
              {getInitials(user)}
            </button>

            {profileOpen && (
              <div className="absolute right-0 top-11 w-72 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50 animate-fade-in-down">
                {/* Personal information header */}
                <div className="bg-gradient-to-r from-brand-800 to-brand-900 p-4 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur text-white font-bold flex items-center justify-center text-sm shrink-0">
                    {getInitials(user)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-white truncate">
                      {user?.full_name || user?.username}
                    </p>
                    <p className="text-[11px] text-brand-200 truncate">
                      {ROLE_LABELS[user?.role] || user?.role}
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="p-3 space-y-2 text-xs border-b border-slate-100">
                  <ProfileRow icon={UserIcon} label="Username" value={user?.username} />
                  <ProfileRow label="Email" value={user?.email || '—'} />
                  <ProfileRow
                    label="Department"
                    value={
                      user?.sub_department_detail
                        ? `${user.sub_department_detail.name} (${user.department || '-'})`
                        : user?.department || '—'
                    }
                  />
                  <ProfileRow label="Phone" value={user?.phone || '—'} />
                  {isSupportRole(user) && (
                    <ProfileRow
                      label="Availability"
                      value={user?.is_available === false ? 'Busy' : 'Available'}
                      tone={user?.is_available === false ? 'text-amber-600' : 'text-emerald-600'}
                    />
                  )}
                </div>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Real-time escalation toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 max-w-sm animate-slide-in-right">
          <div
            onClick={openToast}
            className="flex items-start gap-3 bg-slate-900 text-white p-4 rounded-xl shadow-2xl border border-slate-700 cursor-pointer hover:bg-slate-800 transition-colors"
          >
            <span className="p-2 rounded-lg bg-rose-500/20 shrink-0">
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{toast.title}</p>
              <p className="text-[11px] text-slate-300 mt-0.5 line-clamp-2">{toast.message}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setToast(null); }}
              className="text-slate-400 hover:text-white transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
