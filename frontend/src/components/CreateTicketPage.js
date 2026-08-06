import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText, Send, X, CheckCircle2, HelpCircle } from 'lucide-react';
import { ticketAPI, categoryAPI } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStaff = ['STAFF', 'DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    title: '', 
    description: '', 
    category: '', 
    priority: 'MEDIUM',
    department: user?.department || '',
    is_class_level: user?.role === 'CR',
    class_section: user?.section || '',
    student_names: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    categoryAPI.list()
      .then((res) => {
        const data = res.data.results || res.data;
        setCategories(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
  }, []);

  const validForDept = (c) =>
    !c.target_department || c.target_department === 'HOD' || c.target_department === form.department;

  const visibleCategories = form.department
    ? categories.filter(validForDept)
    : categories;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'department') {
        const allowed = value ? categories.filter((c) =>
          !c.target_department || c.target_department === 'HOD' || c.target_department === value
        ) : categories;
        if (!allowed.some((c) => c.id === prev.category)) next.category = '';
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      const res = await ticketAPI.create(form);
      navigate(`/tickets/${res.data.id}`);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to submit ticket request. Please verify inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PlusCircle className="w-6 h-6 text-brand-600" />
            Create Support Ticket Request
          </h1>
          <p className="text-xs text-slate-500 mt-1">Submit your academic, technical, or administrative support issue</p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
          <X className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Form Card */}
      <div className="custom-card p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Issue Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Issue Summary Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              required
              maxLength={200}
              placeholder="Brief summary of the issue (e.g. Lab Computer Projector Not Working)"
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Department, Category & Priority Row */}
          <div className={`grid grid-cols-1 ${isStaff ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Target Department
              </label>
              <select
                name="department"
                value={form.department}
                onChange={handleChange}
                className="w-full px-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">General Support Desk</option>
                {[
                  { code: 'CIV', name: 'Civil Engineering' },
                  { code: 'ELE', name: 'Electrical Engineering' },
                  { code: 'COM', name: 'Computer Engineering' },
                  { code: 'MEC', name: 'Mechanical Engineering' },
                  { code: 'ARC', name: 'Architecture' },
                  { code: 'APP', name: 'Applied Sciences' },
                  { code: 'CIT', name: 'IT Support' },
                  { code: 'FIN', name: 'Finance Desk' },
                  { code: 'ACA', name: 'Academic Affairs' },
                  { code: 'LIB', name: 'Library' },
                  { code: 'FAC', name: 'Facilities' },
                ].map((d) => (
                  <option key={d.code} value={d.code}>{d.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                required
                className="w-full px-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select Category...</option>
                {visibleCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {isStaff && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Priority
                </label>
                <select
                  name="priority"
                  value={form.priority}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            )}
          </div>

          {/* Selected Category Estimated Time Banner */}
          {form.category && (() => {
            const selectedCatObj = categories.find(c => String(c.id) === String(form.category));
            if (!selectedCatObj) return null;
            return (
              <div className="p-3 bg-brand-50 dark:bg-brand-950/40 rounded-xl border border-brand-200 dark:border-brand-800 flex items-center justify-between text-xs text-brand-800 dark:text-brand-300">
                <div className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>
                    <strong className="font-semibold">{selectedCatObj.name}</strong> estimated response within <strong>{selectedCatObj.sla_response_hours}h</strong> and resolution within <strong>{selectedCatObj.sla_resolution_hours}h</strong>.
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Description Textarea */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Detailed Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              name="description"
              rows={6}
              value={form.description}
              onChange={handleChange}
              required
              placeholder="Provide exact details regarding your ticket issue, lab room number, or specific error message..."
              className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* CR Class-Level Option */}
          {user?.role === 'CR' && (
            <div className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800 space-y-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-purple-900 dark:text-purple-300 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded text-purple-600 focus:ring-purple-500"
                  checked={form.is_class_level}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_class_level: e.target.checked }))}
                />
                <span>Submit ticket on behalf of whole class section</span>
              </label>

              {form.is_class_level && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Class Section
                    </label>
                    <input
                      type="text"
                      name="class_section"
                      value={form.class_section}
                      onChange={handleChange}
                      placeholder="e.g. BCT-078-CD"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Affected Roll Numbers / Students
                    </label>
                    <input
                      type="text"
                      name="student_names"
                      value={form.student_names}
                      onChange={handleChange}
                      placeholder="Comma separated roll numbers"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => navigate('/tickets')}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary text-xs gap-1.5"
            >
              {submitting ? (
                <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              <span>Submit Ticket Request</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
