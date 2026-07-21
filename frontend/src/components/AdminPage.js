import React, { useState, useEffect } from "react";
import { userAPI, categoryAPI, ticketAPI } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stats, setStats] = useState(null);
  const [tab, setTab] = useState("stats");
  const [newUser, setNewUser] = useState({
    username: "", email: "", password: "password123",
    first_name: "", last_name: "", role: "STUDENT", department: "",
  });

  useEffect(() => {
    Promise.all([
      userAPI.list(),
      categoryAPI.list(),
      ticketAPI.stats(),
    ]).then(([u, c, s]) => {
      setUsers(u.data.results || u.data);
      setCategories(c.data.results || c.data);
      setStats(s.data);
    }).catch(() => {});
  }, []);

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
