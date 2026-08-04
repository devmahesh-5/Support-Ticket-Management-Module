import axios from "axios";

const API_BASE = process.env.REACT_APP_API_URL || "/api";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  xsrfCookieName: "csrftoken",
  xsrfHeaderName: "X-CSRFToken",
});

export const authAPI = {
  login: (data) => api.post("/auth/login/", data),
  logout: () => api.post("/auth/logout/"),
  me: () => api.get("/auth/me/"),
};

export const ticketAPI = {
  list: (params) => api.get("/tickets/", { params }),
  myTickets: (params) => api.get("/tickets/my_tickets/", { params }),
  departmentTickets: (params) => api.get("/tickets/department_tickets/", { params }),
  detail: (id) => api.get(`/tickets/${id}/`),
  create: (data) => api.post("/tickets/", data),
  addMessage: (id, data) => api.post(`/tickets/${id}/add_message/`, data),
  changeStatus: (id, data) => api.post(`/tickets/${id}/change_status/`, data),
  reassign: (id, data) => api.post(`/tickets/${id}/reassign/`, data),
  escalate: (id) => api.post(`/tickets/${id}/escalate/`),
  stats: () => api.get("/tickets/stats/"),
  dashboard: () => api.get("/tickets/dashboard/"),
  report: (params) => api.get("/tickets/report/", { params }),
  exportTickets: (params) => api.get("/tickets/export/", { params, responseType: "blob" }),
};

export const categoryAPI = {
  list: () => api.get("/tickets/categories/"),
};

export const userAPI = {
  list: () => api.get("/auth/users/"),
  create: (data) => api.post("/auth/users/", data),
  setAvailability: (data) => api.post("/auth/users/set_availability/", data),
};

export const notificationAPI = {
  list: () => api.get("/notifications/"),
  unreadCount: () => api.get("/notifications/unread_count/"),
  markRead: (id) => api.post(`/notifications/${id}/mark_read/`),
  markAllRead: () => api.post("/notifications/mark_all_read/"),
};

export default api;
