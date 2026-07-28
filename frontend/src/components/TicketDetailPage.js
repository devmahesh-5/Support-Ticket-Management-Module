import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ticketAPI, userAPI, categoryAPI } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

export default function TicketDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [users, setUsers] = useState([]);
  const [reply, setReply] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [loading, setLoading] = useState(true);

  const isStaff = ["STAFF", "DEPT_ADMIN", "CAMPUS_ADMIN"].includes(user?.role);
  const isAdmin = ["DEPT_ADMIN", "CAMPUS_ADMIN"].includes(user?.role);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [ticketRes, usersRes] = await Promise.all([
          ticketAPI.detail(id),
          isAdmin ? userAPI.list() : Promise.resolve({ data: [] }),
        ]);
        setTicket(ticketRes.data);
        const usersData = usersRes.data.results || usersRes.data;
        setUsers(Array.isArray(usersData) ? usersData : []);
      } catch {} finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handleReply = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    const formData = new FormData();
    formData.append("content", reply);
    formData.append("is_internal_note", isInternal);
    try {
      const res = await ticketAPI.addMessage(id, formData);
      setTicket((prev) => ({
        ...prev,
        messages: [...prev.messages, res.data],
      }));
      setReply("");
    } catch {}
  };

  const changeStatus = async (status) => {
    try {
      const res = await ticketAPI.changeStatus(id, { status });
      setTicket(res.data);
    } catch {}
  };

  const handleReassign = async (userId) => {
    try {
      const res = await ticketAPI.reassign(id, { assigned_to: userId });
      setTicket(res.data);
    } catch {}
  };

  const handleEscalate = async () => {
    if (!window.confirm("Escalate this ticket?")) return;
    try {
      const res = await ticketAPI.escalate(id);
      setTicket(res.data);
    } catch {}
  };

  if (loading) return <div className="text-center py-5"><div className="spinner-border"></div></div>;
  if (!ticket) return <div className="alert alert-danger">Ticket not found</div>;

  const isCreator = user?.id === ticket.created_by?.id;
  const daysSinceClosed = ticket.closed_at
    ? (new Date() - new Date(ticket.closed_at)) / (1000 * 60 * 60 * 24)
    : 999;

  const getStatusActions = () => {
    const actions = [];
    switch (ticket.status) {
      case "OPEN":
        if (isStaff) actions.push({ status: "IN_PROGRESS", label: "Start Working", btnClass: "primary" });
        if (isCreator) actions.push({ status: "CLOSED", label: "Close Ticket", btnClass: "success" });
        break;
      case "IN_PROGRESS":
        if (isStaff) actions.push({ status: "RESOLVED", label: "Mark Resolved", btnClass: "success" });
        if (isCreator) actions.push({ status: "CLOSED", label: "Close Ticket", btnClass: "success" });
        break;
      case "RESOLVED":
        if (isCreator) actions.push({ status: "CLOSED", label: "Close Ticket", btnClass: "success" });
        break;
      case "CLOSED":
        if (isCreator && daysSinceClosed <= 30)
          actions.push({ status: "REOPENED", label: "Reopen Ticket", btnClass: "warning" });
        break;
      case "REOPENED":
        if (isStaff) actions.push({ status: "IN_PROGRESS", label: "Start Working", btnClass: "primary" });
        break;
      case "ESCALATED_L1":
      case "ESCALATED_L2":
        if (isAdmin) actions.push({ status: "IN_PROGRESS", label: "Accept & Work", btnClass: "primary" });
        if (isAdmin) actions.push({ status: "RESOLVED", label: "Resolve Directly", btnClass: "success" });
        break;
      case "ADMIN_REVIEW":
        if (user?.role === "CAMPUS_ADMIN") actions.push({ status: "RESOLVED", label: "Resolve", btnClass: "success" });
        break;
    }
    return actions;
  };

  const statusActions = getStatusActions();
  const canReassign = isAdmin;
  const canEscalate = isStaff && ticket.escalation_level < 2;

  return (
    <div className="container-fluid">
      <button className="btn btn-outline-secondary btn-sm mb-3" onClick={() => navigate("/tickets")}>
        <i className="bi bi-arrow-left me-1"></i>Back
      </button>

      <div className="card shadow-sm mb-4">
        <div className="card-header bg-white d-flex justify-content-between align-items-center">
          <div>
            <h5 className="mb-0">{ticket.ticket_id}: {ticket.title}</h5>
            <small className="text-muted">
              Created by {ticket.created_by?.full_name || ticket.created_by?.username}
              {ticket.created_by?.department && ` (${ticket.created_by.department})`}
            </small>
          </div>
          <div className="d-flex gap-2 flex-wrap">
            {statusActions.map((action) => (
              <button key={action.status}
                className={`btn btn-sm btn-${action.btnClass}`}
                onClick={() => changeStatus(action.status)}>
                <i className="bi bi-arrow-right-circle me-1"></i>{action.label}
              </button>
            ))}
            {canEscalate && (
              <button className="btn btn-sm btn-danger" onClick={handleEscalate}>
                <i className="bi bi-arrow-up-circle me-1"></i>Escalate
              </button>
            )}
          </div>
        </div>
        <div className="card-body">
          <div className="row mb-3">
            <div className="col-md-3">
              <small className="text-muted d-block">Status</small>
              <span className={`badge bg-${ticket.status === "OPEN" ? "primary" : ticket.status === "IN_PROGRESS" ? "warning" : ticket.status === "RESOLVED" || ticket.status === "CLOSED" ? "success" : "danger"} fs-6`}>
                {ticket.status?.replace("_", " ")}
              </span>
            </div>
            <div className="col-md-2">
              <small className="text-muted d-block">Priority</small>
              <span className={`badge bg-${ticket.priority === "HIGH" ? "warning" : ticket.priority === "CRITICAL" ? "danger" : "secondary"} fs-6`}>
                {ticket.priority}
              </span>
            </div>
            <div className="col-md-2">
              <small className="text-muted d-block">Category</small>
              <span>{ticket.category?.name || "Uncategorized"}</span>
            </div>
            <div className="col-md-3">
              <small className="text-muted d-block">Assigned To</small>
              {canReassign ? (
                <select className="form-select form-select-sm" value={ticket.assigned_to?.id || ""}
                  onChange={(e) => handleReassign(e.target.value)}>
                  <option value="">Unassigned</option>
                  {users.filter((u) => ["STAFF", "DEPT_ADMIN"].includes(u.role)).map((u) => (
                    <option key={u.id} value={u.id}>{u.full_name || u.username} ({u.role})</option>
                  ))}
                </select>
              ) : (
                <span>{ticket.assigned_to?.full_name || ticket.assigned_to?.username || "Unassigned"}</span>
              )}
            </div>
            {ticket.sla_deadline && (
              <div className="col-md-2">
                <small className="text-muted d-block">SLA Deadline</small>
                <span className={new Date(ticket.sla_deadline) < new Date() ? "text-danger fw-bold" : ""}>
                  {new Date(ticket.sla_deadline).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          <div className="mb-3">
            <h6>Description</h6>
            <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</p>
          </div>
        </div>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-header bg-white">
          <h6 className="mb-0"><i className="bi bi-chat-dots me-2"></i>Conversation Thread</h6>
        </div>
        <div className="card-body" style={{ maxHeight: "500px", overflowY: "auto" }}>
          {ticket.messages?.length === 0 && !ticket.description && (
            <div className="text-center text-muted py-3">No messages yet</div>
          )}
          {ticket.messages?.map((msg) => (
            <div key={msg.id} className={`d-flex mb-3 ${msg.author_role === "STUDENT" || msg.author_role === "CR" ? "" : "justify-content-end"}`}>
              <div className={`p-3 rounded-3 ${msg.is_internal_note ? "bg-warning bg-opacity-10 border border-warning" : msg.author_role === "STUDENT" || msg.author_role === "CR" ? "bg-light" : "bg-primary bg-opacity-10"}`}
                style={{ maxWidth: "75%" }}>
                {msg.is_internal_note && <span className="badge bg-warning text-dark mb-1">Internal Note</span>}
                <div className="d-flex justify-content-between mb-1">
                  <small className="fw-bold">{msg.author_name}</small>
                  <small className="text-muted ms-2">{new Date(msg.created_at).toLocaleString()}</small>
                </div>
                <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{msg.content}</p>
              </div>
            </div>
          ))}
          <div className="d-flex mb-3">
            <div className="p-3 rounded-3 bg-light" style={{ maxWidth: "75%" }}>
              <div className="d-flex justify-content-between mb-1">
                <small className="fw-bold">{ticket.created_by?.full_name || ticket.created_by?.username}</small>
                <small className="text-muted ms-2">{new Date(ticket.created_at).toLocaleString()}</small>
              </div>
              <p className="mb-0" style={{ whiteSpace: "pre-wrap" }}>{ticket.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="card-body">
          <form onSubmit={handleReply}>
            <div className="mb-2">
              <textarea className="form-control" rows="3" placeholder="Type your reply..."
                value={reply} onChange={(e) => setReply(e.target.value)} required></textarea>
            </div>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                {isStaff && (
                  <div className="form-check">
                    <input type="checkbox" className="form-check-input" id="internalNote"
                      checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                    <label className="form-check-label small" htmlFor="internalNote">Internal note (hidden from student)</label>
                  </div>
                )}
              </div>
              <button type="submit" className="btn btn-primary" disabled={!reply.trim()}>
                <i className="bi bi-send me-1"></i>Send
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="card shadow-sm mt-4">
        <div className="card-header bg-white">
          <h6 className="mb-0"><i className="bi bi-clock-history me-2"></i>Status History</h6>
        </div>
        <div className="card-body p-0">
          <ul className="list-group list-group-flush">
            {ticket.status_logs?.map((log, i) => (
              <li key={i} className="list-group-item py-2">
                <small>
                  <span className="fw-medium">{log.changed_by_name}</span>
                  {" changed status "}
                  {log.from_status && <><span className="badge bg-secondary">{log.from_status}</span> → </>}
                  <span className="badge bg-primary">{log.to_status}</span>
                  {log.note && <span className="ms-2 text-muted">- {log.note}</span>}
                  <span className="text-muted ms-2">{new Date(log.created_at).toLocaleString()}</span>
                </small>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
