import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { 
  Search, 
  PlusCircle, 
  Eye, 
  Download, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  ArrowUpDown,
  Ticket as TicketIcon
} from 'lucide-react';
import { ticketAPI } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import TicketQuickPreview from './TicketQuickPreview';

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'REOPENED', 'ESCALATED_L1', 'ESCALATED_L2'];
const PRIORITY_OPTIONS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PAGE_SIZE = 10;

export default function TicketListPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [ordering, setOrdering] = useState('-updated_at');
  const [globalFilter, setGlobalFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [previewTicketId, setPreviewTicketId] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const isStaff = user?.role === 'STAFF';
  const mineParam = searchParams.get('mine') || (isStaff ? 'assigned' : '');
  const statusParam = searchParams.get('status') || '';
  const priorityParam = searchParams.get('priority') || '';

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(globalFilter.trim()), 300);
    return () => clearTimeout(timer);
  }, [globalFilter]);

  const load = useCallback(async (targetPage) => {
    setLoading(true);
    try {
      const params = { page: targetPage, page_size: PAGE_SIZE, ordering };
      if (statusParam) params.status = statusParam;
      if (priorityParam) params.priority = priorityParam;
      if (debouncedSearch) params.search = debouncedSearch;
      if (isStaff) params.mine = mineParam;
      const res = await ticketAPI.list(params);
      setTickets(res.data.results || []);
      setTotalCount(res.data.count ?? (res.data.results?.length || 0));
      setPage(targetPage);
    } catch {} finally {
      setLoading(false);
    }
  }, [ordering, statusParam, priorityParam, debouncedSearch, isStaff, mineParam]);

  useEffect(() => {
    load(1);
  }, [load]);

  const updateParamFilter = (key, val) => {
    const params = new URLSearchParams(searchParams);
    if (val) params.set(key, val);
    else params.delete(key);
    setSearchParams(params);
  };

  const toggleSort = (field) => {
    setOrdering((prev) => {
      if (prev === `-${field}`) return field;
      return `-${field}`;
    });
  };

  const handleExportCSV = () => {
    if (!tickets.length) return;
    const headers = ['Ticket ID', 'Title', 'Category', 'Status', 'Priority', 'Assigned To', 'Updated At'];
    const rows = tickets.map(t => [
      t.ticket_id,
      `"${t.title.replace(/"/g, '""')}"`,
      t.category_name || 'General',
      t.status,
      t.priority,
      t.assigned_to_name || 'Unassigned',
      new Date(t.updated_at).toLocaleString()
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ticket_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const shownFrom = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const shownTo = Math.min(page * PAGE_SIZE, totalCount);

  const renderSortHeader = (label, field) => (
    <button
      onClick={() => toggleSort(field)}
      className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-white"
      title="Sort"
    >
      <span>{label}</span>
      <ArrowUpDown className="w-3 h-3 text-slate-400" />
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <TicketIcon className="w-6 h-6 text-brand-600" />
            Support Tickets Directory
          </h1>
          <p className="text-xs text-slate-500">Manage, inspect, and track student and staff support requests</p>
        </div>

        {isStaff && (
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
            {[
              { value: 'assigned', label: 'Assigned to me' },
              { value: 'created', label: 'My created tickets' },
            ].map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set('mine', tab.value);
                  setSearchParams(params);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  mineParam === tab.value
                    ? 'bg-white dark:bg-slate-900 text-brand-600 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="btn-secondary text-xs gap-1.5"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
          <Link
            to="/tickets/new"
            className="btn-primary text-xs gap-1.5"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create Ticket</span>
          </Link>
        </div>
      </div>

      {/* Filter Controls Card */}
      <div className="custom-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-center">
          {/* Global Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              placeholder="Search by ID, title..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
            />
          </div>

          {/* Status Select */}
          <div>
            <select
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={statusParam}
              onChange={(e) => updateParamFilter('status', e.target.value)}
            >
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          </div>

          {/* Priority Select */}
          <div>
            <select
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={priorityParam}
              onChange={(e) => updateParamFilter('priority', e.target.value)}
            >
              <option value="">All Priorities</option>
              {PRIORITY_OPTIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setGlobalFilter('');
                setSearchParams({});
              }}
              className="w-full btn-secondary text-xs gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>
      </div>

      {/* Ticket Table Container */}
      <div className="custom-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto mb-2"></div>
            <span className="text-xs">Fetching active ticket directory...</span>
          </div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center">
            <TicketIcon className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-700 dark:text-slate-300">No tickets found</h3>
            <p className="text-xs text-slate-400 mt-1 mb-4">Try clearing filters or create a new ticket request.</p>
            <Link to="/tickets/new" className="btn-primary text-xs">Create Ticket</Link>
          </div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">{renderSortHeader('ID', 'ticket_id')}</th>
                    <th className="py-3.5 px-4">{renderSortHeader('Title', 'title')}</th>
                    <th className="py-3.5 px-4">Category</th>
                    <th className="py-3.5 px-4">{renderSortHeader('Status', 'status')}</th>
                    <th className="py-3.5 px-4">{renderSortHeader('Priority', 'priority')}</th>
                    <th className="py-3.5 px-4">Assigned To</th>
                    <th className="py-3.5 px-4">{renderSortHeader('Updated', 'updated_at')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {tickets.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Link 
                            to={`/tickets/${t.id}`}
                            className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline"
                          >
                            {t.ticket_id}
                          </Link>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              setPreviewTicketId(t.id);
                            }}
                            className="p-1 text-slate-400 hover:text-brand-600 rounded transition-colors"
                            title="Quick preview"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="max-w-xs sm:max-w-sm truncate font-medium text-slate-900 dark:text-slate-100">
                          <Link to={`/tickets/${t.id}`} className="hover:text-brand-600 dark:hover:text-brand-400">
                            {t.title}
                          </Link>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {t.category_name || 'General'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const color = 
                            t.status === 'OPEN' ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' :
                            t.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                            t.status === 'RESOLVED' || t.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                            'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300';
                          return (
                            <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${color}`}>
                              {t.status?.replace('_', ' ')}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4">
                        {(() => {
                          const badge = 
                            t.priority === 'CRITICAL' ? 'bg-rose-600 text-white' :
                            t.priority === 'HIGH' ? 'bg-amber-500 text-white' :
                            t.priority === 'MEDIUM' ? 'bg-brand-600 text-white' :
                            'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300';
                          return (
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badge}`}>
                              {t.priority}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-slate-600 dark:text-slate-400">
                          {t.assigned_to_name || 'Unassigned'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs text-slate-400">
                          {new Date(t.updated_at).toLocaleDateString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Showing <span className="font-semibold text-slate-800 dark:text-slate-200">{totalCount === 0 ? 0 : shownFrom}-{shownTo}</span> of <span className="font-semibold text-slate-800 dark:text-slate-200">{totalCount}</span> tickets
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => load(page - 1)}
                  disabled={page <= 1}
                  className="p-1.5 rounded-lg btn-secondary text-xs disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-600 dark:text-slate-400 font-medium px-2">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => load(page + 1)}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-lg btn-secondary text-xs disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Preview Slide-Over Drawer */}
      <TicketQuickPreview 
        ticketId={previewTicketId} 
        onClose={() => setPreviewTicketId(null)} 
      />
    </div>
  );
}
