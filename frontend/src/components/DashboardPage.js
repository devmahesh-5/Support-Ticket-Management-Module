import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ticketAPI } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);

  useEffect(() => {
    ticketAPI.dashboard().then((res) => setStats(res.data)).catch(() => {});
  }, []);

  if (!stats) {
    return <div className="text-center py-5"><div className="spinner-border"></div></div>;
  }

  const cardStyle = {
    borderRadius: "12px", transition: "transform 0.2s",
    cursor: "pointer",
  };

  const isStaff = ["STAFF", "DEPT_ADMIN", "CAMPUS_ADMIN"].includes(user?.role);

  return (
    <div className="container-fluid">
      <h4 className="mb-4"><i className="bi bi-speedometer2 me-2"></i>Dashboard</h4>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card bg-primary text-white shadow" style={cardStyle}>
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div><h6 className="card-title mb-0">Open</h6></div>
                <i className="bi bi-envelope-open" style={{ fontSize: "1.5rem", opacity: 0.5 }}></i>
              </div>
              <h2 className="mt-2 mb-0">{stats.open}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-success text-white shadow" style={cardStyle}>
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div><h6 className="card-title mb-0">Closed</h6></div>
                <i className="bi bi-check-circle" style={{ fontSize: "1.5rem", opacity: 0.5 }}></i>
              </div>
              <h2 className="mt-2 mb-0">{stats.closed}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card bg-warning text-white shadow" style={cardStyle}>
            <div className="card-body">
              <div className="d-flex justify-content-between">
                <div><h6 className="card-title mb-0">Escalated</h6></div>
                <i className="bi bi-exclamation-triangle" style={{ fontSize: "1.5rem", opacity: 0.5 }}></i>
              </div>
              <h2 className="mt-2 mb-0">{stats.escalated}</h2>
            </div>
          </div>
        </div>
        {isStaff && (
          <div className="col-md-3">
            <div className="card bg-info text-white shadow" style={cardStyle}>
              <div className="card-body">
                <div className="d-flex justify-content-between">
                  <div><h6 className="card-title mb-0">My Tickets</h6></div>
                  <i className="bi bi-person" style={{ fontSize: "1.5rem", opacity: 0.5 }}></i>
                </div>
                <h2 className="mt-2 mb-0">{stats.my_tickets}</h2>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="row">
        <div className="col-md-8">
          <div className="card shadow-sm">
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <h6 className="mb-0"><i className="bi bi-clock-history me-2"></i>Recent Tickets</h6>
              <Link to="/tickets" className="btn btn-sm btn-outline-primary">View All</Link>
            </div>
            <div className="card-body p-0">
              {stats.recent?.length === 0 ? (
                <div className="p-4 text-center text-muted">No tickets yet</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>ID</th><th>Title</th><th>Status</th><th>Priority</th><th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recent?.map((t) => (
                        <tr key={t.id}>
                          <td><Link to={`/tickets/${t.id}`} className="text-decoration-none fw-medium">{t.ticket_id}</Link></td>
                          <td>{t.title?.substring(0, 50)}</td>
                          <td>
                            <span className={`badge bg-${t.status === "OPEN" ? "primary" : t.status === "IN_PROGRESS" ? "warning" : t.status === "RESOLVED" || t.status === "CLOSED" ? "success" : "danger"}`}>
                              {t.status?.replace("_", " ")}
                            </span>
                          </td>
                          <td>
                            <span className={`badge bg-${t.priority === "HIGH" ? "warning" : t.priority === "CRITICAL" ? "danger" : "secondary"}`}>
                              {t.priority}
                            </span>
                          </td>
                          <td className="small text-muted">{new Date(t.updated_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="col-md-4">
          {isStaff && stats.staff_metrics?.length > 0 && (
            <div className="card shadow-sm">
              <div className="card-header bg-white">
                <h6 className="mb-0"><i className="bi bi-people me-2"></i>Staff Metrics</h6>
              </div>
              <div className="card-body p-0">
                <ul className="list-group list-group-flush">
                  {stats.staff_metrics.map((s, i) => (
                    <li key={i} className="list-group-item d-flex justify-content-between align-items-center">
                      {s.name}
                      <span className="badge bg-primary rounded-pill">{s.tickets_handled}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
