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
  detail: (id) => api.get(`/tickets/${id}/`),
  create: (data) => api.post("/tickets/", data),
  uploadAttachment: (id, formData) => api.post(`/tickets/${id}/upload_attachment/`, formData),
  deleteAttachment: (id, attachmentId) => api.delete(`/tickets/${id}/delete_attachment/`, { params: { attachment_id: attachmentId } }),
  addMessage: (id, data) => api.post(`/tickets/${id}/add_message/`, data),
  changeStatus: (id, data) => api.post(`/tickets/${id}/change_status/`, data),
  changePriority: (id, data) => api.post(`/tickets/${id}/change_priority/`, data),
  reassign: (id, data) => api.post(`/tickets/${id}/reassign/`, data),
  escalate: (id) => api.post(`/tickets/${id}/escalate/`),
  deescalate: (id) => api.post(`/tickets/${id}/deescalate/`),
  stats: () => api.get("/tickets/stats/"),
  dashboard: (params) => api.get("/tickets/dashboard/", { params }),
  report: (params) => api.get("/tickets/report/", { params }),
  exportTickets: (params) => api.get("/tickets/export/", { params, responseType: "blob" }),
};

export const categoryAPI = {
  list: () => api.get("/tickets/categories/"),
  update: (id, data) => api.patch(`/tickets/categories/${id}/`, data),
};

export const userAPI = {
  list: (params) => api.get("/auth/users/", { params }),
  create: (data) => api.post("/auth/users/", data),
  update: (id, data) => api.patch(`/auth/users/${id}/`, data),
  remove: (id) => api.delete(`/auth/users/${id}/`),
  setAvailability: (data) => api.post("/auth/users/set_availability/", data),
};

export const systemSettingAPI = {
  get: () => api.get("/tickets/settings/policy/"),
  update: (data) => api.post("/tickets/settings/policy/", data),
};

export const notificationAPI = {
  list: () => api.get("/notifications/"),
  unreadCount: () => api.get("/notifications/unread_count/"),
  markRead: (id) => api.post(`/notifications/${id}/mark_read/`),
  markAllRead: () => api.post("/notifications/mark_all_read/"),
  settings: {
    list: () => api.get("/notifications/settings/"),
    update: (id, data) => api.patch(`/notifications/settings/${id}/`, data),
  },
};

export const escalationAPI = {
  policies: {
    list: () => api.get("/escalations/policies/"),
    create: (data) => api.post("/escalations/policies/", data),
    update: (id, data) => api.patch(`/escalations/policies/${id}/`, data),
    remove: (id) => api.delete(`/escalations/policies/${id}/`),
  },
  rules: {
    list: (policyId) => api.get("/escalations/rules/", { params: { policy: policyId } }),
    create: (data) => api.post("/escalations/rules/", data),
    update: (id, data) => api.patch(`/escalations/rules/${id}/`, data),
    remove: (id) => api.delete(`/escalations/rules/${id}/`),
  },
  dashboard: {
    get: () => api.get("/escalations/dashboard/dashboard/"),
    assign: (id, data) => api.post(`/escalations/dashboard/${id}/assign/`, data),
    keepOwner: (id) => api.post(`/escalations/dashboard/${id}/keep_owner/`),
    increasePriority: (id, data) => api.post(`/escalations/dashboard/${id}/increase_priority/`, data),
    resolve: (id) => api.post(`/escalations/dashboard/${id}/resolve/`),
  },
};

export default api;
