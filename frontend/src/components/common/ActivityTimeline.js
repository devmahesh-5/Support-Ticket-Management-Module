import React from 'react';
import { 
  PlusCircle, 
  UserCheck, 
  ArrowUpRight, 
  MessageSquare, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  Clock 
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ActivityTimeline({ activities = [] }) {
  const getEventIcon = (type) => {
    switch (type) {
      case 'CREATED':
        return { icon: PlusCircle, bg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400' };
      case 'ASSIGNED':
        return { icon: UserCheck, bg: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400' };
      case 'STATUS_CHANGE':
        return { icon: CheckCircle2, bg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400' };
      case 'ESCALATED':
        return { icon: AlertTriangle, bg: 'bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400' };
      case 'REPLY':
        return { icon: MessageSquare, bg: 'bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400' };
      case 'INTERNAL_NOTE':
        return { icon: Lock, bg: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' };
      default:
        return { icon: Clock, bg: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' };
    }
  };

  if (!activities || activities.length === 0) {
    return (
      <div className="py-8 text-center text-slate-400 text-sm">
        No recent activity record.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {activities.map((item, idx) => {
        const config = getEventIcon(item.type);
        const Icon = config.icon;
        return (
          <div key={item.id || idx} className="relative flex gap-3 pb-3 group">
            {/* Timeline Line */}
            {idx !== activities.length - 1 && (
              <span className="absolute top-8 left-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-slate-800" aria-hidden="true" />
            )}
            
            {/* Icon Bubble */}
            <div className={`relative flex h-8 w-8 items-center justify-center rounded-full ${config.bg} ring-4 ring-white dark:ring-slate-900 shrink-0 font-medium`}>
              <Icon className="w-4 h-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {item.user_name || 'System User'}
                </span>
                <span className="text-slate-400 text-[11px] shrink-0">
                  {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {item.description}
                {item.ticket_id && (
                  <Link 
                    to={`/tickets/${item.ticket_pk || item.ticket_id}`} 
                    className="ms-1 font-mono text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center"
                  >
                    #{item.ticket_id}
                    <ArrowUpRight className="w-3 h-3 ms-0.5" />
                  </Link>
                )}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
