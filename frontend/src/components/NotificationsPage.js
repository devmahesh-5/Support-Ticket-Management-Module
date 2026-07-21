import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { notificationAPI } from "../api/client";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    notificationAPI.list().then((res) => {
      setNotifications(res.data.results || res.data);
    }).catch(() => {});
  }, []);

  const markRead = async (id) => {
    await notificationAPI.markRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllRead = async () => {
    await notificationAPI.markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleClick = (notif) => {
    if (!notif.is_read) markRead(notif.id);
    if (notif.ticket) {
      navigate(`/tickets/${notif.ticket}`);
    }
  };

  return (
    <div className="container-fluid">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="mb-0"><i className="bi bi-bell me-2"></i>Notifications</h4>
        <button className="btn btn-sm btn-outline-primary" onClick={markAllRead}>
          Mark All Read
        </button>
      </div>

      <div className="card shadow-sm">
        {notifications.length === 0 ? (
          <div className="card-body text-center py-5">
            <i className="bi bi-bell-slash" style={{ fontSize: "3rem", color: "#ccc" }}></i>
            <p className="mt-2 text-muted">No notifications</p>
          </div>
        ) : (
          <div className="list-group list-group-flush">
            {notifications.map((n) => (
              <button key={n.id}
                className={`list-group-item list-group-item-action d-flex gap-3 py-3 ${!n.is_read ? "bg-light fw-medium" : ""}`}
                onClick={() => handleClick(n)}>
                <div>
                  <i className={`bi ${n.notification_type === "ASSIGNMENT" ? "bi-person-plus" : n.notification_type === "REPLY" ? "bi-chat" : n.notification_type === "ESCALATION" ? "bi-arrow-up" : "bi-info-circle"} fs-4 ${!n.is_read ? "text-primary" : "text-muted"}`}></i>
                </div>
                <div className="text-start">
                  <div>{n.title}</div>
                  <small className="text-muted">{n.message}</small>
                  <div className="small text-muted mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {!n.is_read && <div className="ms-auto"><span className="badge bg-primary rounded-pill">New</span></div>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
