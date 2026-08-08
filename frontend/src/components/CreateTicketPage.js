import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, Send, X, CheckCircle2, HelpCircle, Upload } from 'lucide-react';
import { ticketAPI, categoryAPI, userAPI } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import FilePreview from './common/FilePreview';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'md', 'zip'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg'];

const isImageName = (name = '') => IMAGE_EXTENSIONS.includes(name.split('.').pop().toLowerCase());

export default function CreateTicketPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isStaff = ['STAFF', 'DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(user?.role);
  const [categories, setCategories] = useState([]);
  const [staffList, setStaffList] = useState([]);
  const [form, setForm] = useState({
    title: '', 
    description: '', 
    category: '', 
    priority: 'MEDIUM',
    department: user?.department || '',
    is_class_level: user?.role === 'CR',
    class_section: user?.section || '',
    student_names: '',
    assigned_to: '',
  });
  const [attachments, setAttachments] = useState([]);
  const [attachmentError, setAttachmentError] = useState('');
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

  useEffect(() => {
    if (!isStaff) return;
    const params = form.department ? { department: form.department } : {};
    userAPI.list(params)
      .then((res) => {
        const data = res.data.results || res.data || [];
        const assignable = Array.isArray(data)
          ? data.filter((u) => ['STAFF', 'DEPT_ADMIN', 'CAMPUS_ADMIN'].includes(u.role))
          : [];
        setStaffList(assignable);
      })
      .catch(() => {});
  }, [isStaff, form.department]);

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
        next.assigned_to = '';
      }
      return next;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        assigned_to: form.assigned_to ? Number(form.assigned_to) : null,
      };
      const res = await ticketAPI.create(payload);

      if (attachments.length) {
        const fd = new FormData();
        attachments.forEach(({ file }) => fd.append('file', file));
        try {
          await ticketAPI.uploadAttachment(res.data.id, fd);
        } catch (uploadErr) {
          alert('Ticket created, but one or more attachments could not be uploaded. You can add them on the ticket page.');
        }
      }

      navigate(`/tickets/${res.data.id}`);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to submit ticket request. Please verify inputs.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAttachmentSelect = (e) => {
    const files = Array.from(e.target.files || []);
    const errors = [];
    const valid = [];
    files.forEach((file) => {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        errors.push(`"${file.name}" has an unsupported file type.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}" exceeds the 10 MB limit.`);
        return;
      }
      valid.push(file);
    });
    setAttachmentError(errors.join(' '));
    setAttachments((prev) => [
      ...prev,
      ...valid.map((file) => ({ file, preview: isImageName(file.name) ? URL.createObjectURL(file) : null })),
    ]);
    e.target.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => {
      const item = prev[index];
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <PlusCircle className="w-6 h-6 text-brand-600" />
            Create Support Ticket Request
          </h1>
          <p className="text-xs text-slate-500 mt-1">Submit your academic, technical, or administrative support issue</p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
          <X className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Form Card */}
      <div className="custom-card p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Issue Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
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
              className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Department, Category & Priority Row */}
          <div className={`grid grid-cols-1 ${isStaff ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Target Department
              </label>
              <select
                name="department"
                value={form.department}
                onChange={handleChange}
                required
                className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select Department...</option>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Category <span className="text-rose-500">*</span>
              </label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                required
                className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Select Category...</option>
                {visibleCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {isStaff && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Priority
                </label>
                <select
                  name="priority"
                  value={form.priority}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            )}
          </div>

          {/* Assign To (staff/admin only) */}
          {isStaff && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Assign To
              </label>
              <select
                name="assigned_to"
                value={form.assigned_to}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">Auto-assign to Level 1 staff</option>
                {staffList.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.username} ({u.role === 'DEPT_ADMIN' ? 'HOD' : u.role === 'CAMPUS_ADMIN' ? 'Admin' : u.department || 'Staff'})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-400 mt-1">Leave empty to route automatically to the available Level 1 staff.</p>
            </div>
          )}

          {/* Selected Category Estimated Time Banner */}
          {form.category && (() => {
            const selectedCatObj = categories.find(c => String(c.id) === String(form.category));
            if (!selectedCatObj) return null;
            return (
              <div className="p-3 bg-brand-50 rounded-xl border border-brand-200 flex items-center justify-between text-xs text-brand-800">
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
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Detailed Description <span className="text-rose-500">*</span>
            </label>
            <textarea
              name="description"
              rows={6}
              value={form.description}
              onChange={handleChange}
              required
              placeholder="Provide exact details regarding your ticket issue, lab room number, or specific error message..."
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Attachments */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Attachments (optional)
            </label>
            <label className="flex flex-col items-center justify-center gap-2 px-4 py-6 bg-slate-50 border border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors">
              <Upload className="w-6 h-6 text-slate-400" />
              <span className="text-xs text-slate-500">Click to select files (max 10 MB each)</span>
              <input
                type="file"
                multiple
                className="hidden"
                onChange={handleAttachmentSelect}
              />
            </label>

            {attachmentError && (
              <p className="text-[11px] text-rose-600 mt-1.5">{attachmentError}</p>
            )}

            {attachments.length > 0 && (
              <ul className="mt-3 space-y-2">
                {attachments.map(({ file, preview }, i) => (
                  <li key={`${file.name}-${i}`} className="flex items-start gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <FilePreview src={preview} name={file.name} />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs text-slate-700 truncate block">{file.name}</span>
                      <span className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors shrink-0"
                      title="Remove file"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* CR Class-Level Option */}
          {user?.role === 'CR' && (
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 space-y-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-purple-900 cursor-pointer">
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
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Class Section
                    </label>
                    <input
                      type="text"
                      name="class_section"
                      value={form.class_section}
                      onChange={handleChange}
                      placeholder="e.g. BCT-078-CD"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 mb-1">
                      Affected Roll Numbers / Students
                    </label>
                    <input
                      type="text"
                      name="student_names"
                      value={form.student_names}
                      onChange={handleChange}
                      placeholder="Comma separated roll numbers"
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
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
