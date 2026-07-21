import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ticketAPI } from "../api/client";

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED", "REOPENED", "ESCALATED_L1", "ESCALATED_L2"];
const PRIORITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export default function TicketListPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "";
  const priority = searchParams.get("priority") || "";
  const search = searchParams.get("search") || "";

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      if (priority) params.priority = priority;
      if (search) params.search = search;
      const res = await ticketAPI.list(params);
      setTickets(res.data.results || res.data);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTickets(); }, [searchParams]);

  const updateFilter = (key, value) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value);
    else params.delete(key);
    setSearchParams(params);
  };

  const colorMap = {
    OPEN: "primary", IN_PROGRESS: "warning", RESOLVED: "success",
    CLOSED: "secondary", REOPENED: "info", ESCALATED_L1: "danger", ESCALATED_L2: "danger",
  };
  const priorityMap = {
    LOW: "secondary", MEDIUM: "primary", HIGH: "warning", CRITICAL: "danger",
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0"><i className="bi bi-list-ul me-2"></i>Tickets</h4>
        <Link to="/tickets/new" className="btn btn-primary"><i className="bi bi-plus-lg me-1"></i>New Ticket</Link>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-md-4">
              <label className="form-label small">Search</label>
              <input type="text" className="form-control" placeholder="Search by ID, title, or description..."
                value={search} onChange={(e) => updateFilter("search", e.target.value)} />
            </div>
            <div className="col-md-2">
              <label className="form-label small">Status</label>
              <select className="form-select" value={status} onChange={(e) => updateFilter("status", e.target.value)}>
                <option value="">All</option>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small">Priority</label>
              <select className="form-select" value={priority} onChange={(e) => updateFilter("priority", e.target.value)}>
                <option value="">All</option>
                {PRIORITY_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="col-md-2">
              <button className="btn btn-outline-secondary w-100" onClick={() => setSearchParams({})}>Clear</button>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5"><div className="spinner-border"></div></div>
      ) : tickets.length === 0 ? (
        <div className="card shadow-sm">
          <div className="card-body text-center py-5">
            <i className="bi bi-inbox" style={{ fontSize: "3rem", color: "#ccc" }}></i>
            <p className="mt-2 text-muted">No tickets found</p>
            <Link to="/tickets/new" className="btn btn-primary">Create First Ticket</Link>
          </div>
        </div>
      ) : (
        <div className="card shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>ID</th><th>Title</th><th>Category</th><th>Status</th><th>Priority</th>
                  <th>Assigned To</th><th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td><Link to={`/tickets/${t.id}`} className="text-decoration-none fw-medium">{t.ticket_id}</Link></td>
                    <td>{t.title?.substring(0, 60)}</td>
                    <td><span className="badge bg-light text-dark">{t.category_name}</span></td>
                    <td><span className={`badge bg-${colorMap[t.status] || "secondary"}`}>{t.status?.replace("_", " ")}</span></td>
                    <td><span className={`badge bg-${priorityMap[t.priority] || "secondary"}`}>{t.priority}</span></td>
                    <td className="small">{t.assigned_to_name || "-"}</td>
                    <td className="small text-muted">{new Date(t.updated_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
