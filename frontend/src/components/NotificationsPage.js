import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, UserPlus, MessageSquare, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { notificationAPI } from '../api/client';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    notificationAPI.list()
      .then((res) => setNotifications(res.data.results || res.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const markRead = async (id) => {
    await notificationAPI.markRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllRead = async () => {
    await notificationAPI.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClick = (notif) => {
    if (!notif.is_read) markRead(notif.id);
    if (notif.ticket) {
      navigate(`/tickets/${notif.ticket}`);
    }
  };

  const getNotifIcon = (type) => {
    switch (type) {
      case 'ASSIGNMENT':
        return { icon: UserPlus, bg: 'bg-purple-100 text-purple-600 dark:bg-purple-950 dark:text-purple-300' };
      case 'REPLY':
        return { icon: MessageSquare, bg: 'bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-300' };
      case 'ESCALATION':
        return { icon: AlertTriangle, bg: 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300' };
      default:
        return { icon: Info, bg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Bell className="w-6 h-6 text-brand-600" />
            Notification Center
          </h1>
          <p className="text-xs text-slate-500">Live system updates, assignment alerts, and reply feeds</p>
        </div>

        <button
          onClick={markAllRead}
          className="btn-secondary text-xs gap-1.5"
        >
          <CheckCheck className="w-4 h-4 text-emerald-600" />
          <span>Mark All as Read</span>
        </button>
      </div>

      {/* Notifications List Container */}
      <div className="custom-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            Fetching notification feeds...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No Notifications</h3>
            <p className="text-xs text-slate-400 mt-1">You are all caught up on support activity!</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((n) => {
              const iconConfig = getNotifIcon(n.notification_type);
              const Icon = iconConfig.icon;
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`p-4 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                    !n.is_read ? 'bg-brand-50/40 dark:bg-brand-950/20' : ''
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${iconConfig.bg} shrink-0`}>
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-sm ${!n.is_read ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-300'}`}>
                        {n.title}
                      </h4>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {new Date(n.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                      {n.message}
                    </p>
                  </div>

                  {!n.is_read && (
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-600 shrink-0 mt-1.5" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
