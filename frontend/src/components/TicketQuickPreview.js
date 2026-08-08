import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, ExternalLink, Clock, User, Shield, AlertCircle, MessageSquare } from 'lucide-react';
import { ticketAPI } from '../api/client';

export default function TicketQuickPreview({ ticketId, onClose }) {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ticketId) return;
    setLoading(true);
    ticketAPI.detail(ticketId)
      .then((res) => setTicket(res.data))
      .catch(() => setTicket(null))
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (!ticketId) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/50 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl border-s border-slate-200 flex flex-col justify-between transform transition-transform duration-300">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
              {ticket?.ticket_id || 'Ticket Preview'}
            </span>
            <span className="text-xs text-slate-400">Quick Drawer</span>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="flex-1 p-6 flex items-center justify-center text-slate-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
          </div>
        ) : !ticket ? (
          <div className="flex-1 p-6 text-center text-slate-400">
            Failed to load ticket details.
          </div>
        ) : (
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">
                {ticket.title}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Created on {new Date(ticket.created_at).toLocaleString()}
              </p>
            </div>

            {/* Badges */}
            <div className="flex flex-wrap gap-2">
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-brand-100 text-brand-800">
                {ticket.status?.replace('_', ' ')}
              </span>
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-100 text-slate-800">
                Priority: {ticket.priority}
              </span>
              {ticket.category_name && (
                <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">
                  {ticket.category_name}
                </span>
              )}
            </div>

            {/* Description */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Description
              </span>
              <p className="text-sm text-slate-700 whitespace-pre-wrap">
                {ticket.description}
              </p>
            </div>

            {/* Metadata list */}
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5" /> Requester
                </span>
                <span className="font-medium text-slate-800">
                  {ticket.created_by?.full_name || ticket.created_by?.username}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> Assigned Staff
                </span>
                <span className="font-medium text-slate-800">
                  {ticket.assigned_to?.full_name || ticket.assigned_to?.username || 'Unassigned'}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> Estimated Completion Time
                </span>
                <span className={`font-medium ${ticket.sla_deadline && new Date(ticket.sla_deadline) < new Date() ? 'text-rose-600 font-bold' : 'text-slate-800'}`}>
                  {ticket.sla_deadline ? new Date(ticket.sla_deadline).toLocaleString() : 'Not Set'}
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Total Replies
                </span>
                <span className="font-medium text-slate-800">
                  {ticket.messages?.length || 0} messages
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button 
            onClick={onClose}
            className="btn-secondary text-xs"
          >
            Close
          </button>
          <Link
            to={`/tickets/${ticketId}`}
            className="btn-primary text-xs gap-1.5"
            onClick={onClose}
          >
            <span>Open Full Page</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
