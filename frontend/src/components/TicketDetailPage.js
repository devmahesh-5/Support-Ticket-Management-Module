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
  Tag,
  Paperclip,
  Download,
  Trash2,
  X
} from 'lucide-react';
import { ticketAPI, userAPI, systemSettingAPI } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import FilePreview from './common/FilePreview';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'zip'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];

const isImageName = (name = '') => IMAGE_EXTENSIONS.includes(name.split('.').pop().toLowerCase());

const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const ThreadAttachment = ({ att, canDelete, onDelete }) => {
  const isImage = isImageName(att.filename);
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden min-w-0">
      {isImage ? (
        <a
          href={att.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block group"
          title="Open full size image"
        >
          <img
            src={att.file_url}
            alt={att.filename}
            className="w-full max-h-80 object-contain bg-slate-50 cursor-zoom-in group-hover:opacity-90 transition-opacity"
          />
        </a>
      ) : (
        <div className="flex items-center gap-4 p-4 bg-brand-50/40">
          <div className="h-16 w-16 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
            <FileText className="w-8 h-8 text-brand-600" />
          </div>
          <div className="min-w-0 flex-1">
            <a
              href={att.file_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-slate-800 truncate block hover:text-brand-600"
              title={att.filename}
            >
              {att.filename}
            </a>
            <span className="text-[11px] text-slate-500">
              {att.uploaded_by_name ? `by ${att.uploaded_by_name}` : 'by Unknown'}
              {att.file_size ? ` · ${formatFileSize(att.file_size)}` : ''}
            </span>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-slate-100">
        <div className="min-w-0">
          <a
            href={att.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-slate-700 truncate block hover:text-brand-600"
            title={att.filename}
          >
            {att.filename}
          </a>
          <span className="text-[10px] text-slate-400">
            {att.uploaded_by_name ? `by ${att.uploaded_by_name}` : 'by Unknown'}
            {att.file_size ? ` · ${formatFileSize(att.file_size)}` : ''}
            {att.uploaded_at ? ` · ${new Date(att.uploaded_at).toLocaleString()}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <a
            href={att.file_url}
            target="_blank"
            rel="noopener noreferrer"
            download={att.filename}
            className="p-1.5 text-slate-400 hover:text-brand-600 rounded transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </a>
          {canDelete && (
            <button
              onClick={() => onDelete(att)}
              className="p-1.5 text-slate-400 hover:text-rose-600 rounded transition-colors"
              title="Delete attachment"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

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
  const [replyFiles, setReplyFiles] = useState([]);
  const [replyFileError, setReplyFileError] = useState('');
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
          let list = tData.assigned_to ? [tData.assigned_to] : [];
          try {
            const usersRes = await userAPI.list(params);
            const usersData = usersRes.data.results || usersRes.data;
            if (Array.isArray(usersData)) {
              list = [...usersData, ...list];
            }
          } catch {}
          const seen = new Set();
          list = list.filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)));
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
    if (!reply.trim() && !replyFiles.length) return;
    setSubmitting(true);
    const formData = new FormData();
    formData.append('content', reply);
    formData.append('is_internal_note', isInternal);
    replyFiles.forEach(({ file }) => formData.append('file', file));
    try {
      const res = await ticketAPI.addMessage(id, formData);
      setTicket((prev) => ({
        ...prev,
        messages: [...(prev.messages || []), res.data],
      }));
      setReply('');
      setIsInternal(false);
      setReplyFiles((prev) => {
        prev.forEach(({ preview }) => preview && URL.revokeObjectURL(preview));
        return [];
      });
      setReplyFileError('');
    } catch (err) {
      const data = err.response?.data;
      let msg = 'Failed to post reply.';
      if (data?.content) msg = Array.isArray(data.content) ? data.content.join(' ') : data.content;
      else if (data?.error) msg = data.error;
      setReplyFileError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReplyFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const errors = [];
    const valid = [];
    files.forEach((file) => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        errors.push(`"${file.name}" has an unsupported file type.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}" exceeds the 10 MB limit.`);
        return;
      }
      valid.push({ file, preview: isImageName(file.name) ? URL.createObjectURL(file) : null });
    });
    setReplyFileError(errors.join(' '));
    setReplyFiles((prev) => [...prev, ...valid]);
    e.target.value = '';
  };

  const removeReplyFile = (index) => {
    setReplyFiles((prev) => {
      const item = prev[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleAttachmentDelete = async (attId) => {
    if (!window.confirm('Delete this attachment?')) return;
    try {
      await ticketAPI.deleteAttachment(id, attId);
      setTicket((prev) => ({
        ...prev,
        attachments: (prev.attachments || []).filter((a) => a.id !== attId),
        messages: (prev.messages || []).map((msg) => ({
          ...msg,
          attachments: (msg.attachments || []).filter((a) => a.id !== attId),
        })),
      }));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete attachment.');
    }
  };

  const canDeleteAttachment = (att) => att.uploaded_by === user?.id;

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
      setSelectedStaff(res.data.assigned_to?.id || '');
      if (res.data.assigned_to) {
        setUsers((prev) => prev.some((u) => u.id === res.data.assigned_to.id)
          ? prev
          : [res.data.assigned_to, ...prev]);
      }
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
      await ticketAPI.escalate(id);
      navigate('/tickets');
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to escalate ticket.');
    }
  };

  const handleDeescalate = async () => {
    if (!window.confirm('De-escalate this ticket back to previous management level?')) return;
    try {
      await ticketAPI.deescalate(id);
      if (isAdmin) {
        const res = await ticketAPI.detail(id);
        setTicket(res.data);
      } else {
        navigate('/tickets');
      }
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

              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  ticket.status === 'OPEN' ? 'bg-blue-100 text-blue-800' :
                  ticket.status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-800' :
                  ticket.status === 'RESOLVED' || ticket.status === 'CLOSED' ? 'bg-emerald-100 text-emerald-800' :
                  'bg-rose-100 text-rose-800'
                }`}>
                  {ticket.status?.replace('_', ' ')}
                </span>
                {ticket.sla_status === 'BREACHED' && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-600 text-white">
                    SLA Breached
                  </span>
                )}
              </div>
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
                  {(ticket.attachments || []).filter((a) => !a.message).length > 0 && (
                    <div className="mt-3 space-y-2">
                      {(ticket.attachments || []).filter((a) => !a.message).map((att) => (
                        <ThreadAttachment
                          key={att.id}
                          att={att}
                          canDelete={canDeleteAttachment(att)}
                          onDelete={() => handleAttachmentDelete(att.id)}
                        />
                      ))}
                    </div>
                  )}
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
                    {msg.attachments?.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {msg.attachments.map((att) => (
                          <ThreadAttachment
                            key={att.id}
                            att={att}
                            canDelete={canDeleteAttachment(att)}
                            onDelete={() => handleAttachmentDelete(att.id)}
                          />
                        ))}
                      </div>
                    )}
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
                  placeholder="Type your response or resolution note here... (optional if attaching files)"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
              </div>

              {replyFiles.length > 0 && (
                <ul className="space-y-2">
                  {replyFiles.map(({ file, preview }, i) => (
                    <li key={`${file.name}-${i}`} className="flex items-start gap-3 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                      <FilePreview src={preview} name={file.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <span className="text-xs text-slate-700 truncate block">{file.name}</span>
                        <span className="text-[10px] text-slate-400">{formatFileSize(file.size)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeReplyFile(i)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors shrink-0"
                        title="Remove file"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {replyFileError && (
                <p className="text-[11px] text-rose-600">{replyFileError}</p>
              )}

              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer hover:text-brand-600 transition-colors">
                    <Paperclip className="w-4 h-4" />
                    <span>Attach files</span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleReplyFileSelect}
                    />
                  </label>
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
                  disabled={submitting || (!reply.trim() && !replyFiles.length)}
                  className="btn-primary text-xs gap-1.5"
                >
                  {submitting ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>{replyFiles.length ? 'Post Reply with Attachment' : 'Post Reply'}</span>
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
                {ticket.category_name || 'Uncategorized'}
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
                {ticket.sla_status === 'BREACHED' && <span className="ml-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-600 text-white">Breached</span>}
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
