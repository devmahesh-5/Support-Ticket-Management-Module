import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ticketAPI, categoryAPI } from "../api/client";
import { useAuth } from "../contexts/AuthContext";

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    title: "", description: "", category: "", priority: "MEDIUM",
    department: user?.department || "",
    is_class_level: user?.role === "CR",
    class_section: user?.section || "",
    student_names: "",
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    categoryAPI.list().then((res) => {
      const data = res.data.results || res.data;
      setCategories(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  const handleChange = (e) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await ticketAPI.create(form);
      navigate(`/tickets/${res.data.id}`);
    } catch (err) {
      alert("Failed to create ticket: " + (err.response?.data?.error || "Unknown error"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container-fluid">
      <h4 className="mb-4"><i className="bi bi-plus-circle me-2"></i>Create New Ticket</h4>
      <div className="card shadow-sm">
        <div className="card-body p-4">
          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label">Title <span className="text-danger">*</span></label>
              <input type="text" className="form-control" name="title" value={form.title}
                onChange={handleChange} required placeholder="Brief summary of the issue" maxLength={200} />
            </div>

            <div className="row mb-3">
              <div className="col-md-6">
                <label className="form-label">Category <span className="text-danger">*</span></label>
                <select className="form-select" name="category" value={form.category} onChange={handleChange} required>
                  <option value="">Select category...</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Priority</label>
                <select className="form-select" name="priority" value={form.priority} onChange={handleChange}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
              <div className="col-md-3">
                <label className="form-label">Department</label>
                <select className="form-select" name="department" value={form.department} onChange={handleChange}>
                  <option value="">General</option>
                  {[
                    { code: "CIV", name: "Civil Engineering" },
                    { code: "ELE", name: "Electrical Engineering" },
                    { code: "COM", name: "Computer Engineering" },
                    { code: "MEC", name: "Mechanical Engineering" },
                    { code: "ARC", name: "Architecture" },
                    { code: "APP", name: "Applied Sciences" },
                  ].map((d) => (
                    <option key={d.code} value={d.code}>{d.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label">Description <span className="text-danger">*</span></label>
              <textarea className="form-control" name="description" rows="5" value={form.description}
                onChange={handleChange} required placeholder="Describe the issue in detail"></textarea>
            </div>

            {user?.role === "CR" && (
              <div className="mb-3">
                <div className="form-check mb-2">
                  <input type="checkbox" className="form-check-input" id="classLevel"
                    checked={form.is_class_level}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_class_level: e.target.checked }))} />
                  <label className="form-check-label" htmlFor="classLevel">This ticket is for the whole class</label>
                </div>
                {form.is_class_level && (
                  <div className="row">
                    <div className="col-md-4">
                      <label className="form-label">Class/Section</label>
                      <input type="text" className="form-control" name="class_section" value={form.class_section} onChange={handleChange} />
                    </div>
                    <div className="col-md-8">
                      <label className="form-label">Affected Students (comma-separated)</label>
                      <input type="text" className="form-control" name="student_names" value={form.student_names}
                        onChange={handleChange} placeholder="Roll numbers or names" />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? <span className="spinner-border spinner-border-sm me-1"></span> : null}
                Submit Ticket
              </button>
              <button type="button" className="btn btn-outline-secondary" onClick={() => navigate("/tickets")}>Cancel</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
