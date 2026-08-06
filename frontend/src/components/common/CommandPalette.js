import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, LayoutDashboard, Ticket, PlusCircle, Shield, Bell, X, ArrowRight } from 'lucide-react';
import { ticketAPI } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

export default function CommandPalette({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else onClose(false); // toggle trigger outside
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!query.trim() || !isOpen) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await ticketAPI.list({ search: query });
        setResults((res.data.results || res.data).slice(0, 5));
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [query, isOpen]);

  if (!isOpen) return null;

  const navigateTo = (path) => {
    navigate(path);
    onClose();
    setQuery('');
  };

  const pages = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Tickets List', icon: Ticket, path: '/tickets' },
    { name: 'Create New Ticket', icon: PlusCircle, path: '/tickets/new' },
    { name: 'Notifications', icon: Bell, path: '/notifications' },
  ];

  if (user?.role === 'CAMPUS_ADMIN' || user?.role === 'DEPT_ADMIN') {
    pages.push({ name: 'Admin Panel & Analytics', icon: Shield, path: '/admin' });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-900/60 backdrop-blur-sm transition-opacity">
      <div 
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center px-4 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-slate-400 me-3 shrink-0" />
          <input
            type="text"
            className="w-full py-4 bg-transparent text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none text-base"
            placeholder="Type a command or search tickets..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {/* Quick Navigation Links */}
          {!query.trim() && (
            <div className="mb-2">
              <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Quick Navigation
              </div>
              {pages.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.path}
                    onClick={() => navigateTo(p.path)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                      <span>{p.name}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-400" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Ticket Search Results */}
          {query.trim() && (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Matching Tickets
              </div>
              {loading ? (
                <div className="p-4 text-center text-slate-400 text-sm">Searching tickets...</div>
              ) : results.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-sm">No tickets found matching "{query}"</div>
              ) : (
                results.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => navigateTo(`/tickets/${t.id}`)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <div className="truncate me-2">
                      <span className="font-mono text-xs font-medium text-brand-600 dark:text-brand-400 me-2">
                        {t.ticket_id}
                      </span>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                        {t.title}
                      </span>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 uppercase">
                      {t.status?.replace('_', ' ')}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>Navigate with arrows or click</span>
          <span className="font-mono bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">ESC to close</span>
        </div>
      </div>
    </div>
  );
}
