import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Search, PlusCircle, CheckCircle, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { notificationAPI } from '../api/client';

export default function Navbar({ onOpenCommandPalette }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const res = await notificationAPI.unreadCount();
        setUnread(res.data.unread_count || 0);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const now = new Date();
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#111827]/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-6 py-3 transition-colors">
      <div className="flex items-center justify-between gap-4">
        {/* Left Title / Location */}
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-wider uppercase font-semibold text-rose-600 dark:text-rose-400">
                Government of Nepal
              </span>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <span className="text-[10px] tracking-wider uppercase font-semibold text-brand-600 dark:text-brand-400">
                IOE Pulchowk Campus
              </span>
            </div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Support Desk Portal
            </h1>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-3">
          {/* Quick Search */}
          <button
            onClick={onOpenCommandPalette}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/60 dark:hover:bg-slate-700/80 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span>Search tickets...</span>
            <kbd className="text-[10px] bg-white dark:bg-slate-900 px-1 py-0.5 rounded text-slate-400 border border-slate-200 dark:border-slate-700">
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
            className="relative p-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-xs animate-pulse">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </Link>

          {/* Date Indicator */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
            <Clock className="w-3.5 h-3.5 text-brand-500" />
            <span>{formattedDate}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
