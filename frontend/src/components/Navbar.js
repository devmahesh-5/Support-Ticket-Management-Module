import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { notificationAPI } from "../api/client";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const res = await notificationAPI.unreadCount();
        setUnread(res.data.unread_count);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  if (!user) return null;

  const roleLabels = {
    STUDENT: "Student", CR: "CR", STAFF: "Staff",
    DEPT_ADMIN: "HOD", CAMPUS_ADMIN: "Admin",
  };

  return (
    <nav className="navbar navbar-expand-lg navbar-dark bg-primary mb-4">
      <div className="container-fluid">
        <Link className="navbar-brand fw-bold" to="/">
          <i className="bi bi-ticket-perforated me-2"></i>
          Support Ticket System
        </Link>
        <button className="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navMenu">
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navMenu">
          <ul className="navbar-nav me-auto">
            <li className="nav-item"><Link className="nav-link" to="/"><i className="bi bi-speedometer2"></i> Dashboard</Link></li>
            <li className="nav-item"><Link className="nav-link" to="/tickets"><i className="bi bi-list-ul"></i> Tickets</Link></li>
            <li className="nav-item"><Link className="nav-link" to="/tickets/new"><i className="bi bi-plus-circle"></i> New Ticket</Link></li>
            {(user.role === "CAMPUS_ADMIN" || user.role === "DEPT_ADMIN") && (
              <li className="nav-item"><Link className="nav-link" to="/admin"><i className="bi bi-gear"></i> Admin</Link></li>
            )}
          </ul>
          <ul className="navbar-nav">
            <li className="nav-item position-relative me-3">
              <Link className="nav-link" to="/notifications">
                <i className="bi bi-bell"></i>
                {unread > 0 && (
                  <span className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Link>
            </li>
            <li className="nav-item dropdown">
              <a className="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown">
                <i className="bi bi-person-circle me-1"></i>
                {user.full_name || user.username}
                <span className="badge bg-light text-dark ms-2">{roleLabels[user.role] || user.role}</span>
              </a>
              <ul className="dropdown-menu dropdown-menu-end">
                <li><span className="dropdown-item-text small text-muted">{user.email}</span></li>
                <li><hr className="dropdown-divider" /></li>
                <li><button className="dropdown-item" onClick={handleLogout}><i className="bi bi-box-arrow-right me-2"></i>Logout</button></li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
