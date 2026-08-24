import React, { useEffect, useState } from "react";
import { z } from "zod";
import { escalationAPI, categoryAPI, departmentAPI } from "../../api/client";
import { Button } from "../ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Switch } from "../ui/switch";
import { Form, FormField, useForm } from "../ui/form";
import {
  DELAY_PRESETS, PRIORITIES, SUPPORT_LEVELS,
} from "./constants";

const policySchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  is_enabled: z.boolean(),
  department: z.string().optional(),
  category: z.any().optional().nullable(),
  priority: z.string().optional(),
  from_level: z.any().optional().nullable(),
  to_level: z.any().optional().nullable(),
  auto_escalate: z.boolean(),
  escalation_delay_minutes: z.coerce.number().min(0),
  increase_priority_on_breach: z.boolean(),
  escalate_critical_immediately: z.boolean(),
  notify_assigned_50: z.boolean(),
  notify_assigned_75: z.boolean(),
  notify_manager_50: z.boolean(),
  notify_manager_75: z.boolean(),
  notify_manager_90: z.boolean(),
  notify_manager_100: z.boolean(),
  notify_in_app: z.boolean(),
  notify_email: z.boolean(),
});

const emptyDefaults = {
  name: "", description: "", is_enabled: true, department: "", category: null, priority: "",
  from_level: null, to_level: null,
  auto_escalate: false, escalation_delay_minutes: 60,
  increase_priority_on_breach: false,
  escalate_critical_immediately: false,
  notify_assigned_50: true,
  notify_assigned_75: true,
  notify_manager_50: false,
  notify_manager_75: true,
  notify_manager_90: false,
  notify_manager_100: false,
  notify_in_app: true,
  notify_email: false,
};

const DEFAULT_MAPPING = { LOW: "MEDIUM", MEDIUM: "HIGH", HIGH: "CRITICAL", CRITICAL: "CRITICAL" };

function Section({ title, children }) {
  return (
    <div className="rounded-lg border border-slate-200 p-4 space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</h4>
      {children}
    </div>
  );
}

function ToggleRow({ label, field, form }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-sm text-slate-700">{label}</span>
      <FormField name={field} children={({ field: f }) => (
        <Switch checked={!!f.value} onCheckedChange={f.onChange} />
      )} />
    </div>
  );
}

function toFormValues(p) {
  if (!p) return { ...emptyDefaults };
  return {
    ...emptyDefaults,
    name: p.name, description: p.description || "", is_enabled: p.is_enabled,
    department: p.department || "", category: p.category || null, priority: p.priority || "",
    from_level: p.from_level ?? null, to_level: p.to_level ?? null,
    auto_escalate: p.auto_escalate, escalation_delay_minutes: p.escalation_delay_minutes,
    increase_priority_on_breach: p.increase_priority_on_breach,
    escalate_critical_immediately: p.escalate_critical_immediately,
    notify_assigned_50: p.notify_assigned_50 ?? true,
    notify_assigned_75: p.notify_assigned_75 ?? true,
    notify_manager_50: p.notify_manager_50 ?? false,
    notify_manager_75: p.notify_manager_75 ?? true,
    notify_manager_90: p.notify_manager_90 ?? false,
    notify_manager_100: p.notify_manager_100 ?? false,
    notify_in_app: p.notify_in_app ?? true,
    notify_email: p.notify_email ?? false,
  };
}

export default function PolicyEditor({ open, onClose, onSaved, editing }) {
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [mapping, setMapping] = useState(DEFAULT_MAPPING);

  const form = useForm({ schema: policySchema, defaultValues: emptyDefaults });

  useEffect(() => {
    if (open) {
      form.reset(toFormValues(editing));
      setMapping(editing?.priority_mapping || DEFAULT_MAPPING);
      categoryAPI.list().then((res) => setCategories(res.data.results || res.data || [])).catch(() => {});
      departmentAPI.list().then((res) => setDepartments(res.data.results || res.data || [])).catch(() => {});
    }
  }, [open, editing]);

  const submit = async (values) => {
    const payload = {
      ...values,
      department: values.department || null,
      category: values.category || null,
      priority: values.priority || null,
      from_level: values.from_level ?? null,
      to_level: values.to_level ?? null,
      priority_mapping: mapping,
    };
    try {
      if (editing) await escalationAPI.policies.update(editing.id, payload);
      else await escalationAPI.policies.create(payload);
      onSaved();
      onClose();
    } catch (e) {
      alert(e.response?.data?.detail || Object.values(e.response?.data || {})[0]?.[0] || "Failed to save policy.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose} className="max-w-3xl">
      <DialogHeader>
        <DialogTitle>{editing ? "Edit Escalation Policy" : "New Escalation Policy"}</DialogTitle>
        <DialogDescription>Applies to all tickets matching its scope. SLA hours come from the category - this policy controls when and where tickets escalate.</DialogDescription>
      </DialogHeader>

      <Form form={form} onSubmit={submit} className="space-y-4">
        <Section title="General">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField name="name" label="Name" children={({ field }) => <Input {...field} placeholder="e.g. Network Critical SLA" />} />
            <FormField name="department" label="Department (optional)" children={({ field }) => (
              <Select {...field} value={field.value || ""} onChange={(e) => field.onChange(e.target.value)}>
                <option value="">Any Department</option>
                {departments.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
              </Select>
            )} />
            <FormField name="category" label="Category (optional)" children={({ field }) => (
              <Select {...field} value={field.value || ""} onChange={(e) => field.onChange(e.target.value || null)}>
                <option value="">Any Category</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </Select>
            )} />
            <FormField name="priority" label="Priority (optional)" children={({ field }) => (
              <Select {...field} value={field.value || ""} onChange={(e) => field.onChange(e.target.value)}>
                <option value="">Any Priority</option>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            )} />
            <FormField name="from_level" label="From level (ticket currently handled at)" children={({ field }) => (
              <Select {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">Any level</option>
                {SUPPORT_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            )} />
            <FormField name="to_level" label="To level (escalate to)" children={({ field }) => (
              <Select {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">Next level after current</option>
                {SUPPORT_LEVELS.filter((l) => l.value > 0).map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            )} />
          </div>
          <FormField name="description" label="Description" children={({ field }) => <Input {...field} />} />
          <ToggleRow label="Policy enabled" field="is_enabled" form={form} />
        </Section>

        <Section title="SLA">
          <p className="text-xs text-slate-600">
            SLA deadlines are taken from the ticket's <strong>category</strong> (response and resolution hours set on the category),
            counted as plain elapsed time from ticket creation. This policy does not define SLA hours - it only defines when and
            where to escalate on breach.
          </p>
        </Section>

        <Section title="Notifications & SLA Warnings">
          <div className="space-y-3">
            <div>
              <h5 className="text-xs font-semibold text-slate-600 mb-1">Assignee SLA Warnings</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <ToggleRow label="Notify Assignee at 50% SLA" field="notify_assigned_50" form={form} />
                <ToggleRow label="Notify Assignee at 75% SLA" field="notify_assigned_75" form={form} />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-2">
              <h5 className="text-xs font-semibold text-slate-600 mb-1">Department HOD / Manager Warnings</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <ToggleRow label="Notify Manager/HOD at 50% SLA" field="notify_manager_50" form={form} />
                <ToggleRow label="Notify Manager/HOD at 75% SLA" field="notify_manager_75" form={form} />
                <ToggleRow label="Notify Manager/HOD at 90% SLA" field="notify_manager_90" form={form} />
                <ToggleRow label="Notify Manager/HOD at 100% SLA (Breach)" field="notify_manager_100" form={form} />
              </div>
            </div>
            <div className="border-t border-slate-100 pt-2">
              <h5 className="text-xs font-semibold text-slate-600 mb-1">Delivery Channels</h5>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <ToggleRow label="In-App Notifications" field="notify_in_app" form={form} />
                <ToggleRow label="Email Notifications" field="notify_email" form={form} />
              </div>
            </div>
          </div>
        </Section>

        <Section title="Auto Escalation">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToggleRow label="Enable auto escalation" field="auto_escalate" form={form} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700 whitespace-nowrap">Escalation delay</span>
              <FormField name="escalation_delay_minutes" children={({ field }) => {
                const current = Number(field.value || 0);
                return (
                  <Select value={current} onChange={(e) => field.onChange(Number(e.target.value))}>
                    {DELAY_PRESETS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                  </Select>
                );
              }} />
            </div>
          </div>
          <p className="text-xs text-slate-600 mt-2">
            On SLA breach after the delay: if ON, the ticket is auto-assigned to staff at the <strong>To level</strong>.
            If OFF, the ticket is pushed to the <strong>escalation queue</strong> where the HOD/admin sees it and assigns it manually.
          </p>
        </Section>

        <Section title="Priority Rules">
          <ToggleRow label="Increase priority on SLA breach" field="increase_priority_on_breach" form={form} />
          {form.watch("increase_priority_on_breach") && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
              {PRIORITIES.map((p) => (
                <div key={p.value} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1">
                  <span className="text-xs font-medium text-slate-700">{p.label} breaches to</span>
                  <select className="h-8 rounded-md border border-slate-300 bg-transparent px-2 text-xs" value={mapping[p.value]} onChange={(e) => setMapping((m) => ({ ...m, [p.value]: e.target.value }))}>
                    {PRIORITIES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Special Rules">
          <ToggleRow label="Escalate critical tickets immediately" field="escalate_critical_immediately" form={form} />
        </Section>

        <div className="flex justify-end gap-2 pt-2">
          <DialogClose onClick={onClose}>Cancel</DialogClose>
          <Button type="submit">{editing ? "Save Policy" : "Create Policy"}</Button>
        </div>
      </Form>
    </Dialog>
  );
}
