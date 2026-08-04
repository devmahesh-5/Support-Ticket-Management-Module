import React, { useState, useEffect } from "react";
import { userAPI, categoryAPI, ticketAPI } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [tab, setTab] = useState("stats");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [newUser, setNewUser] = useState({
    username: "", email: "", password: "password123",
    first_name: "", last_name: "", role: "STUDENT", department: "",
  });

  useEffect(() => {
    userAPI.list().then((u) => setUsers(u.data.results || u.data)).catch(() => {});
    categoryAPI.list().then((c) => setCategories(c.data.results || c.data)).catch(() => {});
    ticketAPI.stats().then((s) => setStats(s.data)).catch(() => {});
    loadReport();
  }, []);

  const loadReport = async (from = dateFrom, to = dateTo) => {
    setReportLoading(true);
    try {
      const params = {};
      if (from) params.start = from;
      if (to) params.end = to;
      const res = await ticketAPI.report(params);
      setReport(res.data);
    } catch {
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = {};
      if (dateFrom) params.start = dateFrom;
      if (dateTo) params.end = dateTo;
      const res = await ticketAPI.exportTickets(params);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `tickets_report_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {}
  };

  const createUser = async (e) => {
    e.preventDefault();
    try {
      await userAPI.create(newUser);
      const res = await userAPI.list();
      setUsers(res.data.results || res.data);
      setNewUser({ username: "", email: "", password: "password123", first_name: "", last_name: "", role: "STUDENT", department: "" });
    } catch {}
  };

  if (user?.role !== "CAMPUS_ADMIN" && user?.role !== "DEPT_ADMIN") {
    return <div className="alert alert-danger">Access denied. Admin only.</div>;
  }

  const tabs = [
    { key: "stats", label: "Statistics", icon: "bi-bar-chart" },
    { key: "reports", label: "Reports", icon: "bi-file-earmark-bar-graph" },
    { key: "users", label: "Users", icon: "bi-people" },
    { key: "categories", label: "Categories", icon: "bi-tags" },
  ];

  return (
    <div className="container-fluid">
      <h4 className="mb-4"><i className="bi bi-gear me-2"></i>Admin Panel</h4>

      <ul className="nav nav-tabs mb-4">
        {tabs.map((t) => (
          <li key={t.key} className="nav-item">
            <button className={`nav-link ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
              <i className={`bi ${t.icon} me-1`}></i>{t.label}
            </button>
          </li>
        ))}
      </ul>

      {tab === "stats" && stats && (
        <div className="row g-3">
          <div className="col-md-3">
            <div className="card bg-primary text-white shadow">
              <div className="card-body"><h2>{stats.total}</h2><div>Total Tickets</div></div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-success text-white shadow">
              <div className="card-body"><h2>{stats.by_status?.CLOSED || 0}</h2><div>Closed</div></div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-danger text-white shadow">
              <div className="card-body"><h2>{stats.overdue}</h2><div>Overdue</div></div>
            </div>
          </div>
          <div className="col-md-3">
            <div className="card bg-info text-white shadow">
              <div className="card-body">
                <h2>{stats.avg_resolution_hours ? `${stats.avg_resolution_hours}h` : "N/A"}</h2>
                <div>Avg Resolution</div>
              </div>
            </div>
          </div>
          <div className="col-12">
            <div className="card shadow-sm">
              <div className="card-header bg-white"><h6 className="mb-0">By Category</h6></div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead><tr><th>Category</th><th>Count</th></tr></thead>
                    <tbody>
                      {Object.entries(stats.by_category || {}).map(([k, v]) => (
                        <tr key={k}><td>{k}</td><td><span className="badge bg-primary">{v}</span></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "reports" && (
        <div>
          <div className="card shadow-sm mb-4">
            <div className="card-body d-flex flex-wrap align-items-center gap-2">
              <label className="form-label mb-0">From</label>
              <input type="date" className="form-control form-control-sm" style={{ maxWidth: "160px" }}
                value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              <label className="form-label mb-0 ms-2">To</label>
              <input type="date" className="form-control form-control-sm" style={{ maxWidth: "160px" }}
                value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={() => loadReport()}>
                <i className="bi bi-funnel me-1"></i>Apply
              </button>
              <button className="btn btn-success btn-sm ms-auto" onClick={handleExport}>
                <i className="bi bi-file-earmark-excel me-1"></i>Export to Excel
              </button>
            </div>
          </div>

          {reportLoading ? (
            <div className="text-center py-5"><div className="spinner-border"></div></div>
          ) : !report ? (
            <div className="alert alert-info">No report data available.</div>
          ) : (
            <>
              <div className="row g-3 mb-4">
                <div className="col-md-2">
                  <div className="card bg-primary text-white shadow"><div className="card-body"><h2>{report.total}</h2><div>Total</div></div></div>
                </div>
                <div className="col-md-2">
                  <div className="card bg-success text-white shadow"><div className="card-body"><h2>{(report.by_status?.CLOSED || 0) + (report.by_status?.RESOLVED || 0)}</h2><div>Closed/Resolved</div></div></div>
                </div>
                <div className="col-md-2">
                  <div className="card bg-danger text-white shadow"><div className="card-body"><h2>{report.overdue}</h2><div>Overdue</div></div></div>
                </div>
                <div className="col-md-3">
                  <div className="card bg-info text-white shadow"><div className="card-body"><h2>{report.avg_resolution_hours ? `${report.avg_resolution_hours}h` : "N/A"}</h2><div>Avg Resolution</div></div></div>
                </div>
                <div className="col-md-3">
                  <div className="card bg-warning text-white shadow"><div className="card-body"><h2>{report.missed_deadline_pct != null ? `${report.missed_deadline_pct}%` : "N/A"}</h2><div>Missed Deadline</div></div></div>
                </div>
              </div>

              <div className="row g-3 mb-4">
                <div className="col-md-4">
                  <div className="card shadow-sm h-100">
                    <div className="card-header bg-white"><h6 className="mb-0">By Category</h6></div>
                    <div className="card-body">
                      {Object.entries(report.by_category || {}).length === 0 ? (
                        <div className="text-muted">No data</div>
                      ) : (
                        Object.entries(report.by_category).map(([k, v]) => {
                          const max = Math.max(...Object.values(report.by_category), 1);
                          return (
                            <div key={k} className="mb-2">
                              <div className="d-flex justify-content-between small">
                                <span>{k}</span><span className="fw-bold">{v}</span>
                              </div>
                              <div className="progress" style={{ height: "6px" }}>
                                <div className="progress-bar" style={{ width: `${(v / max) * 100}%` }}></div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="card shadow-sm h-100">
                    <div className="card-header bg-white"><h6 className="mb-0">Weekly Trend</h6></div>
                    <div className="card-body">
                      {report.weekly_trend?.length === 0 ? (
                        <div className="text-muted">No assigned tickets</div>
                      ) : (
                        report.weekly_trend?.map((w) => (
                          <div key={w.week} className="d-flex justify-content-between small mb-1 border-bottom pb-1">
                            <span>{w.week}</span><span className="badge bg-primary">{w.tickets}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="col-md-4">
                  <div className="card shadow-sm h-100">
                    <div className="card-header bg-white"><h6 className="mb-0">Staff Metrics</h6></div>
                    <div className="card-body p-0">
                      <div className="table-responsive">
                        <table className="table table-sm mb-0">
                          <thead className="table-light">
                            <tr><th>Staff</th><th>Dept</th><th>Handled</th><th>Open</th><th>Avg Resp</th></tr>
                          </thead>
                          <tbody>
                            {report.staff_metrics?.length === 0 ? (
                              <tr><td colSpan="5" className="text-muted">No staff</td></tr>
                            ) : (
                              report.staff_metrics?.map((s, i) => (
                                <tr key={i}>
                                  <td>{s.name}</td>
                                  <td>{s.department || "-"}</td>
                                  <td>{s.tickets_handled}</td>
                                  <td>{s.open_tickets}</td>
                                  <td>{s.avg_response_hours != null ? `${s.avg_response_hours}h` : "-"}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card shadow-sm">
                <div className="card-header bg-white"><h6 className="mb-0">By Status</h6></div>
                <div className="card-body">
                  {Object.entries(report.by_status || {}).map(([k, v]) => (
                    <span key={k} className="badge bg-secondary me-2 p-2">{k}: {v}</span>
                  ))}
                  {Object.keys(report.by_status || {}).length === 0 && <span className="text-muted">No data</span>}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === "users" && user?.role === "CAMPUS_ADMIN" && (
        <div className="row">
          <div className="col-md-5">
            <div className="card shadow-sm">
              <div className="card-header bg-white"><h6 className="mb-0">Add New User</h6></div>
              <div className="card-body">
                <form onSubmit={createUser}>
                  <div className="row mb-2">
                    <div className="col-6">
                      <input type="text" className="form-control form-control-sm" placeholder="Username" required
                        value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
                    </div>
                    <div className="col-6">
                      <input type="email" className="form-control form-control-sm" placeholder="Email"
                        value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="row mb-2">
                    <div className="col-6">
                      <input type="text" className="form-control form-control-sm" placeholder="First Name"
                        value={newUser.first_name} onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })} />
                    </div>
                    <div className="col-6">
                      <input type="text" className="form-control form-control-sm" placeholder="Last Name"
                        value={newUser.last_name} onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })} />
                    </div>
                  </div>
                  <div className="row mb-2">
                    <div className="col-6">
                      <select className="form-select form-select-sm" value={newUser.role}
                        onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}>
                        <option value="STUDENT">Student</option>
                        <option value="CR">CR</option>
                        <option value="STAFF">Staff</option>
                        <option value="DEPT_ADMIN">Dept Admin</option>
                        <option value="CAMPUS_ADMIN">Campus Admin</option>
                      </select>
                    </div>
                    <div className="col-6">
                      <select className="form-select form-select-sm" value={newUser.department}
                        onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}>
                        <option value="">No Dept</option>
                        <option value="CIV">Civil</option>
                        <option value="ELE">Electrical</option>
                        <option value="COM">Computer</option>
                        <option value="MEC">Mechanical</option>
                        <option value="ARC">Architecture</option>
                        <option value="APP">Applied Sciences</option>
                      </select>
                    </div>
                  </div>
                  <button type="submit" className="btn btn-primary btn-sm w-100">Add User</button>
                </form>
              </div>
            </div>
          </div>
          <div className="col-md-7">
            <div className="card shadow-sm">
              <div className="card-header bg-white"><h6 className="mb-0">Users</h6></div>
              <div className="card-body p-0">
                <div className="table-responsive" style={{ maxHeight: "400px" }}>
                  <table className="table table-sm table-hover mb-0">
                    <thead className="table-light">
                      <tr><th>Username</th><th>Name</th><th>Role</th><th>Dept</th></tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.id}>
                          <td>{u.username}</td>
                          <td>{u.full_name}</td>
                          <td><span className="badge bg-secondary">{u.role}</span></td>
                          <td>{u.department || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "categories" && user?.role === "CAMPUS_ADMIN" && (
        <div className="card shadow-sm">
          <div className="card-header bg-white"><h6 className="mb-0">Categories</h6></div>
          <div className="card-body">
            <div className="table-responsive">
              <table className="table table-hover">
                <thead><tr><th>Name</th><th>SLA Response (hrs)</th><th>SLA Resolution (hrs)</th></tr></thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id}>
                      <td className="fw-medium">{c.name}</td>
                      <td>{c.sla_response_hours}</td>
                      <td>{c.sla_resolution_hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
