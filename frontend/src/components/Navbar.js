import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Search, PlusCircle, CheckCircle, Clock, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notificationAPI } from '../api/client';
import useNotificationStream from '../hooks/useNotificationStream';

export default function Navbar({ onOpenCommandPalette }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

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
        {/* Left Title / Location */}
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="IOE Pulchowk Campus" className="w-9 h-9 rounded-lg object-contain bg-brand-600" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-wider uppercase font-semibold text-brand-600">
                IOE Pulchowk Campus
              </span>
            </div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight">
              Support Desk Portal
            </h1>
          </div>
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
