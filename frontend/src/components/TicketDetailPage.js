import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  Send, 
  User, 
  Clock, 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  Lock, 
  FileText,
  CornerDownRight,
  UserCheck,
  ArrowDownCircle,
  Tag
} from 'lucide-react';
import { ticketAPI, userAPI, systemSettingAPI } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [users, setUsers] = useState([]);
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('MEDIUM');
  const [allowTwoWay, setAllowTwoWay] = useState(true);
  const [reply, setReply] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const isStaff = ['STAFF', 'DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);
  const isAdmin = ['DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ticketRes, settingRes] = await Promise.all([
          ticketAPI.detail(id),
          systemSettingAPI.get().catch(() => ({ data: { allow_two_way_escalation: true } })),
        ]);
        const tData = ticketRes.data;
        setTicket(tData);
        setSelectedStaff(tData.assigned_to?.id || '');
        setSelectedPriority(tData.priority || 'MEDIUM');
        setAllowTwoWay(settingRes.data.allow_two_way_escalation);

        if (isAdmin) {
          const params = tData.target_department ? { department: tData.target_department } : {};
          const usersRes = await userAPI.list(params);
          const usersData = usersRes.data.results || usersRes.data;
          let list = Array.isArray(usersData) ? usersData : [];
          if (tData.assigned_to && !list.some((u) => u.id === tData.assigned_to.id)) {
            list = [tData.assigned_to, ...list];
          }
          setUsers(list);
        }
      } catch {} finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id, isAdmin]);

  const handleReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSubmitting(true);
    const formData = new FormData();
    formData.append('content', reply);
    formData.append('is_internal_note', isInternal);
    try {
      const res = await ticketAPI.addMessage(id, formData);
      setTicket((prev) => ({
        ...prev,
        messages: [...(prev.messages || []), res.data],
      }));
      setReply('');
    } catch {} finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (status) => {
    try {
      const res = await ticketAPI.changeStatus(id, { status });
      setTicket(res.data);
    } catch {}
  };

  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await ticketAPI.reassign(id, { assigned_to: selectedStaff });
      setTicket(res.data);
      alert('Ticket assignment updated successfully!');
    } catch {}
  };

  const handlePrioritySubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await ticketAPI.changePriority(id, { priority: selectedPriority });
      setTicket(res.data);
      alert('Ticket priority updated successfully!');
    } catch {}
  };

  const handleEscalate = async () => {
    if (!window.confirm('Escalate this ticket to higher management level?')) return;
    try {
      const res = await ticketAPI.escalate(id);
      setTicket(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to escalate ticket.');
    }
  };

  const handleDeescalate = async () => {
    if (!window.confirm('De-escalate this ticket back to previous management level?')) return;
    try {
      const res = await ticketAPI.deescalate(id);
      setTicket(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to de-escalate ticket.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand-600"></div>
          <span className="text-sm text-slate-500">Loading Ticket Workspace...</span>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="custom-card p-12 text-center max-w-lg mx-auto">
        <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-800">Ticket Not Found</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">The ticket request may have been removed or access is restricted.</p>
        <Link to="/tickets" className="btn-primary text-xs">Return to Ticket Directory</Link>
      </div>
    );
  }

  const isCreator = user?.id === ticket.created_by?.id;
  const isAssignedStaff = user?.role === 'STAFF' && ticket.assigned_to?.id === user.id;
  const daysSinceClosed = ticket.closed_at
    ? (new Date() - new Date(ticket.closed_at)) / (1000 * 60 * 60 * 24)
    : 999;

  const getStatusActions = () => {
    const actions = [];
    switch (ticket.status) {
      case 'OPEN':
        if (isAssignedStaff) actions.push({ status: 'IN_PROGRESS', label: 'Start Working', btnClass: 'btn-primary' });
        if (isCreator) actions.push({ status: 'CLOSED', label: 'Close Ticket', btnClass: 'btn-secondary' });
        break;
      case 'IN_PROGRESS':
        if (isAssignedStaff) actions.push({ status: 'RESOLVED', label: 'Mark Resolved', btnClass: 'btn-primary' });
        if (isCreator) actions.push({ status: 'CLOSED', label: 'Close Ticket', btnClass: 'btn-secondary' });
        break;
      case 'RESOLVED':
        if (isCreator) actions.push({ status: 'CLOSED', label: 'Close Ticket', btnClass: 'btn-primary' });
        break;
      case 'CLOSED':
        if (isCreator && daysSinceClosed <= 30)
          actions.push({ status: 'REOPENED', label: 'Reopen Ticket', btnClass: 'btn-secondary' });
        break;
      case 'REOPENED':
        if (isAssignedStaff) actions.push({ status: 'IN_PROGRESS', label: 'Start Working', btnClass: 'btn-primary' });
        break;
      case 'ESCALATED_L1':
      case 'ESCALATED_L2':
        if (isAssignedStaff) actions.push({ status: 'IN_PROGRESS', label: 'Accept & Work', btnClass: 'btn-primary' });
        if (isAdmin) actions.push({ status: 'RESOLVED', label: 'Resolve Directly', btnClass: 'btn-secondary' });
        break;
      default:
        break;
    }
    return actions;
  };

  const statusActions = getStatusActions();
  const canReassign = isAdmin;
  const canEscalate = isStaff && ticket.escalation_level < 3 && !['RESOLVED', 'CLOSED'].includes(ticket.status);
  const canDeescalate = isStaff && ticket.escalation_level > 0 && allowTwoWay && !['RESOLVED', 'CLOSED'].includes(ticket.status);

  return (
    <div className="space-y-6">
      {/* Top Back Navigation & Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={() => navigate('/tickets')}
          className="btn-ghost text-xs gap-1.5 self-start"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Tickets List</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          {canDeescalate && (
            <button
              onClick={handleDeescalate}
              className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-300 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors flex items-center gap-1.5"
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              <span>De-escalate Ticket</span>
            </button>
          )}

          {canEscalate && (
            <button
              onClick={handleEscalate}
              className="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Escalate Ticket</span>
            </button>
          )}

          {statusActions.map((action) => (
            <button
              key={action.status}
              onClick={() => changeStatus(action.status)}
              className={`${action.btnClass} text-xs py-1.5 px-3`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: Ticket Title, Description, Conversation, Reply Input */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header Card */}
          <div className="custom-card p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="font-mono text-xs font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
                  {ticket.ticket_id}
                </span>
                <h1 className="text-xl font-bold text-slate-900 mt-2 leading-tight">
                  {ticket.title}
                </h1>
              </div>

              <span className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 ${
                ticket.status === 'OPEN' ? 'bg-blue-100 text-blue-800' :
                ticket.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800' :
                ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-800' :
                'bg-rose-100 text-rose-800'
              }`}>
                {ticket.status?.replace('_', ' ')}
              </span>
            </div>

            {/* Description Block */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Original Request Description
              </span>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                {ticket.description}
              </p>
            </div>
          </div>

          {/* Conversation Stream */}
          <div className="custom-card p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-200">
              <FileText className="w-4 h-4 text-brand-600" />
              Conversation & Reply History ({ticket.messages?.length || 0})
            </h3>

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
              {/* Creator original post entry */}
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xs shrink-0">
                  {(ticket.created_by?.full_name || ticket.created_by?.username || 'U')[0].toUpperCase()}
                </div>
                <div className="flex-1 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-bold text-slate-900">
                      {ticket.created_by?.full_name || ticket.created_by?.username}
                    </span>
                    <span className="text-slate-400">
                      {new Date(ticket.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap">
                    {ticket.description}
                  </p>
                </div>
              </div>

              {/* Messages loop */}
              {ticket.messages?.map((msg) => (
                <div 
                  key={msg.id}
                  className={`flex gap-3 ${msg.is_internal_note ? 'bg-amber-50/50 p-3 rounded-xl border border-amber-200' : ''}`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    msg.is_internal_note ? 'bg-amber-200 text-amber-800' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {(msg.author_name || 'U')[0].toUpperCase()}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{msg.author_name}</span>
                        {msg.is_internal_note && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500 text-white flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" /> Internal Note
                          </span>
                        )}
                      </div>
                      <span className="text-slate-400">{new Date(msg.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply Input Form */}
            <form onSubmit={handleReply} className="pt-4 border-t border-slate-200 space-y-3">
              <div>
                <textarea
                  rows={3}
                  className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  placeholder="Type your response or resolution note here..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  required
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  {isStaff && (
                    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        className="rounded text-amber-600 focus:ring-amber-500"
                        checked={isInternal}
                        onChange={(e) => setIsInternal(e.target.checked)}
                      />
                      <span>Mark as internal staff note (hidden from student)</span>
                    </label>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting || !reply.trim()}
                  className="btn-primary text-xs gap-1.5"
                >
                  {submitting ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>Post Reply</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Ticket Metadata Controls Sidebar */}
        <div className="space-y-6">
          {/* Metadata & Controls Card */}
          <div className="custom-card p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Ticket Parameters & Actions
            </h3>

            {/* Department */}
            <div className="flex justify-between items-center text-xs py-2 border-b border-slate-100">
              <span className="text-slate-500">Department</span>
              <span className="font-semibold text-slate-800">
                {ticket.department || 'General Support'}
              </span>
            </div>

            {/* Priority Level with Explicit Update Button */}
            <div className="py-2 border-b border-slate-100 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Priority Level</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  ticket.priority === 'CRITICAL' ? 'bg-rose-500 text-white' :
                  ticket.priority === 'HIGH' ? 'bg-amber-500 text-white' :
                  'bg-slate-200 text-slate-700'
                }`}>
                  {ticket.priority}
                </span>
              </div>
              {isStaff && (
                <form onSubmit={handlePrioritySubmit} className="flex gap-2 pt-1">
                  <select
                    className="flex-1 px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    value={selectedPriority}
                    onChange={(e) => setSelectedPriority(e.target.value)}
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                  <button type="submit" className="btn-secondary text-[11px] py-1 px-2.5">
                    Update Priority
                  </button>
                </form>
              )}
            </div>

            {/* Category */}
            <div className="flex justify-between items-center text-xs py-2 border-b border-slate-100">
              <span className="text-slate-500">Category</span>
              <span className="font-medium text-brand-600">
                {ticket.category?.name || 'Uncategorized'}
              </span>
            </div>

            {/* Staff Assignment with Explicit Update Button */}
            <div className="py-2 border-b border-slate-100 space-y-1.5">
              <span className="text-xs text-slate-500 block">Assigned Staff</span>
              {canReassign ? (
                <form onSubmit={handleReassignSubmit} className="space-y-2">
                  <select
                    className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
                    value={selectedStaff}
                    onChange={(e) => setSelectedStaff(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {users.filter(u => ['STAFF', 'DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(u.role)).map(u => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username} ({u.role === 'DEPT_ADMIN' ? 'HOD' : u.role === 'CAMPUS_ADMIN' ? 'Admin' : `${u.role} - L${u.level || 1}`})
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="w-full btn-secondary text-xs py-1.5">
                    Update Assignment
                  </button>
                </form>
              ) : (
                <span className="text-xs font-semibold text-slate-800 block">
                  {ticket.assigned_to?.full_name || ticket.assigned_to?.username || 'Unassigned'}
                </span>
              )}
            </div>

            {/* Estimated Completion Deadline (Derived from Category) */}
            <div className="flex justify-between items-center text-xs py-2 border-b border-slate-100">
              <span className="text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Estimated Completion Time
              </span>
              <span className={`font-semibold ${ticket.sla_deadline && new Date(ticket.sla_deadline) < new Date() ? 'text-rose-600 font-bold' : 'text-slate-800'}`}>
                {ticket.sla_deadline ? new Date(ticket.sla_deadline).toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>

          {/* Audit History Logs (VISIBLE ONLY TO STAFF / ADMIN / HOD) */}
          {isStaff && (
            <div className="custom-card p-5">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
                Status Change History (Staff Only)
              </h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {ticket.status_logs?.map((log, i) => (
                  <div key={i} className="text-xs p-2 bg-slate-50 rounded-lg border border-slate-100">
                    <div className="flex justify-between text-slate-400 text-[10px]">
                      <span className="font-semibold text-slate-700">{log.changed_by_name}</span>
                      <span>{new Date(log.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="text-slate-600 mt-1">
                      {log.from_status ? `${log.from_status} → ` : ''}
                      <span className="font-semibold text-brand-600">{log.to_status}</span>
                      {log.note && <span className="block text-[11px] text-slate-500 italic mt-0.5">{log.note}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
