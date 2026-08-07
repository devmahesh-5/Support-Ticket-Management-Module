import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { escalationAPI, categoryAPI } from "../../api/client";
import { Button } from "../ui/button";
import { Dialog, DialogHeader, DialogTitle, DialogDescription, DialogClose } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select } from "../ui/select";
import { Switch } from "../ui/switch";
import { Form, FormField, useForm } from "../ui/form";
import {
  DELAY_PRESETS, DEPARTMENTS, PRIORITIES,
  RULE_ACTIONS, RULE_FIELDS, RULE_OPS, SUPPORT_LEVELS,
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
  notify_assigned_50: z.boolean(),
  notify_assigned_75: z.boolean(),
  notify_assigned_custom: z.boolean(),
  notify_assigned_custom_pct: z.any().optional().nullable(),
  notify_manager_50: z.boolean(),
  notify_manager_75: z.boolean(),
  notify_manager_90: z.boolean(),
  notify_manager_100: z.boolean(),
  notify_manager_custom: z.boolean(),
  notify_manager_custom_pct: z.any().optional().nullable(),
  notify_in_app: z.boolean(),
  notify_email: z.boolean(),
  notify_sms: z.boolean(),
  auto_escalate: z.boolean(),
  escalation_delay_minutes: z.coerce.number().min(0),
  increase_priority_on_breach: z.boolean(),
  escalate_critical_immediately: z.boolean(),
});

const emptyDefaults = {
  name: "", description: "", is_enabled: true, department: "", category: null, priority: "",
  from_level: null, to_level: null,
  notify_assigned_50: true, notify_assigned_75: true, notify_assigned_custom: false, notify_assigned_custom_pct: null,
  notify_manager_50: false, notify_manager_75: true, notify_manager_90: false, notify_manager_100: false,
  notify_manager_custom: false, notify_manager_custom_pct: null,
  notify_in_app: true, notify_email: false, notify_sms: false,
  auto_escalate: false, escalation_delay_minutes: 60,
  increase_priority_on_breach: false,
  escalate_critical_immediately: false,
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
    from_level: p.from_level || null, to_level: p.to_level || null,
    notify_assigned_50: p.notify_assigned_50, notify_assigned_75: p.notify_assigned_75,
    notify_assigned_custom: p.notify_assigned_custom, notify_assigned_custom_pct: p.notify_assigned_custom_pct,
    notify_manager_50: p.notify_manager_50, notify_manager_75: p.notify_manager_75,
    notify_manager_90: p.notify_manager_90, notify_manager_100: p.notify_manager_100,
    notify_manager_custom: p.notify_manager_custom, notify_manager_custom_pct: p.notify_manager_custom_pct,
    notify_in_app: p.notify_in_app, notify_email: p.notify_email, notify_sms: p.notify_sms,
    auto_escalate: p.auto_escalate, escalation_delay_minutes: p.escalation_delay_minutes,
    increase_priority_on_breach: p.increase_priority_on_breach,
    escalate_critical_immediately: p.escalate_critical_immediately,
  };
}

function RulesEditor({ policy, reload }) {
  const [rules, setRules] = useState([]);
  const [draft, setDraft] = useState(null);
  const [draftIndex, setDraftIndex] = useState(-1);

  useEffect(() => {
    if (policy) escalationAPI.rules.list(policy.id).then((res) => setRules(res.data.results || res.data || [])).catch(() => {});
  }, [policy]);

  const addDraft = () => setDraft({ name: "", order: rules.length, is_active: true, conditions: [], actions: [] });
  const editDraft = (r, i) => { setDraft({ ...r }); setDraftIndex(i); };

  const addCondition = () => {
    setDraft((d) => ({ ...d, conditions: [...d.conditions, { field: "priority", op: "eq", value: "" }] }));
  };
  const updateCondition = (i, key, value) => {
    setDraft((d) => {
      const conditions = d.conditions.map((c, idx) => (idx === i ? { ...c, [key]: value } : c));
      return { ...d, conditions };
    });
  };
  const removeCondition = (i) => setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, idx) => idx !== i) }));

  const addAction = () => setDraft((d) => ({ ...d, actions: [...d.actions, { action: "notify", target: "assigned", message: "" }] }));
  const updateAction = (i, key, value) => {
    setDraft((d) => {
      const actions = d.actions.map((a, idx) => (idx === i ? { ...a, [key]: value } : a));
      return { ...d, actions };
    });
  };
  const removeAction = (i) => setDraft((d) => ({ ...d, actions: d.actions.filter((_, idx) => idx !== i) }));

  const saveRule = async () => {
    if (!draft.name) return alert("Rule name is required");
    const clean = {
      ...draft,
      conditions: draft.conditions.map((c) => ({
        field: c.field, op: c.op, value: c.value === "" ? null : c.value,
      })),
      actions: draft.actions.map((a) => {
        const out = { action: a.action };
        if (a.action === "notify") { out.target = a.target || "assigned"; out.message = a.message || ""; }
        if (a.action === "increase_priority") out.value = a.value || "HIGH";
        if (a.action === "assign_user") out.user_id = Number(a.user_id) || null;
        if (a.action === "assign_level") out.level_id = Number(a.level_id) || null;
        return out;
      }),
    };
    try {
      if (draftIndex >= 0) await escalationAPI.rules.update(draft.id, clean);
      else await escalationAPI.rules.create({ ...clean, policy: policy.id });
      setDraft(null);
      const res = await escalationAPI.rules.list(policy.id);
      setRules(res.data.results || res.data || []);
      reload();
    } catch (e) {
      alert("Failed to save rule: " + (e.response?.data?.detail || e.response?.data?.conditions?.[0] || ""));
    }
  };

  const removeRule = async (r) => {
    if (!window.confirm("Delete this rule?")) return;
    await escalationAPI.rules.remove(r.id).catch(() => {});
    const res = await escalationAPI.rules.list(policy.id);
    setRules(res.data.results || res.data || []);
  };

  const actionRow = (a, i) => (
    <div key={i} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 p-2">
      <select className="h-8 rounded-md border border-slate-300 bg-transparent px-2 text-xs" value={a.action} onChange={(e) => updateAction(i, "action", e.target.value)}>
        {RULE_ACTIONS.map((ra) => <option key={ra.value} value={ra.value}>{ra.label}</option>)}
      </select>
      {a.action === "increase_priority" && (
        <select className="h-8 rounded-md border border-slate-300 bg-transparent px-2 text-xs" value={a.value || "HIGH"} onChange={(e) => updateAction(i, "value", e.target.value)}>
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      )}
      {a.action === "notify" && (
        <>
          <select className="h-8 rounded-md border border-slate-300 bg-transparent px-2 text-xs" value={a.target || "assigned"} onChange={(e) => updateAction(i, "target", e.target.value)}>
            <option value="assigned">Assigned Staff</option>
            <option value="manager">Manager / HOD</option>
            <option value="creator">Creator</option>
          </select>
          <input className="h-8 flex-1 rounded-md border border-slate-300 bg-transparent px-2 text-xs" placeholder="Message" value={a.message || ""} onChange={(e) => updateAction(i, "message", e.target.value)} />
        </>
      )}
      {a.action === "assign_user" && (
        <input type="number" className="h-8 w-24 rounded-md border border-slate-300 bg-transparent px-2 text-xs" placeholder="User ID" value={a.user_id || ""} onChange={(e) => updateAction(i, "user_id", e.target.value)} />
      )}
      {a.action === "assign_level" && (
        <select className="h-8 rounded-md border border-slate-300 bg-transparent px-2 text-xs" value={a.level_id || ""} onChange={(e) => updateAction(i, "level_id", e.target.value)}>
          <option value="">Level...</option>
          {SUPPORT_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
      )}
      <button type="button" onClick={() => removeAction(i)} className="ml-auto text-rose-500"><Trash2 className="h-4 w-4" /></button>
    </div>
  );

  return (
    <Section title="Escalation Rules (IF / THEN)">
      {rules.length > 0 && (
        <div className="space-y-2">
          {rules.map((r, i) => (
            <div key={r.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 p-2">
              <div className="text-xs">
                <span className="font-semibold text-slate-800">{r.name}</span>
                <span className="ml-2 text-slate-400">IF {JSON.stringify(r.conditions)} THEN {JSON.stringify(r.actions)}</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => editDraft(r, i)}>Edit</Button>
                <Button variant="ghost" size="sm" onClick={() => removeRule(r)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft ? (
        <div className="space-y-3 rounded border border-brand-200 bg-brand-50/40 p-3">
          <div className="flex items-center gap-2">
            <input className="h-8 flex-1 rounded-md border border-slate-300 bg-transparent px-2 text-xs" placeholder="Rule name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <label className="flex items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Active</label>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">When (all must match)</p>
            <div className="space-y-2">
              {draft.conditions.map((c, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className="h-8 rounded-md border border-slate-300 bg-transparent px-2 text-xs" value={c.field} onChange={(e) => updateCondition(i, "field", e.target.value)}>
                    {RULE_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                  <select className="h-8 rounded-md border border-slate-300 bg-transparent px-2 text-xs" value={c.op} onChange={(e) => updateCondition(i, "op", e.target.value)}>
                    {RULE_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input className="h-8 w-32 flex-1 rounded-md border border-slate-300 bg-transparent px-2 text-xs" placeholder="Value" value={c.value ?? ""} onChange={(e) => updateCondition(i, "value", e.target.value)} />
                  <button type="button" onClick={() => removeCondition(i)} className="text-rose-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addCondition}><Plus className="h-3.5 w-3.5" /> Add Condition</Button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold text-slate-600">Then (run in order)</p>
            <div className="space-y-2">
              {draft.actions.map(actionRow)}
              <Button type="button" variant="outline" size="sm" onClick={addAction}><Plus className="h-3.5 w-3.5" /> Add Action</Button>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
            <Button type="button" size="sm" onClick={saveRule}>Save Rule</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={addDraft}><Plus className="h-3.5 w-3.5" /> Add Rule</Button>
      )}
    </Section>
  );
}

export default function PolicyEditor({ open, onClose, onSaved, editing }) {
  const [categories, setCategories] = useState([]);
  const [mapping, setMapping] = useState(DEFAULT_MAPPING);
  const [delayCustom, setDelayCustom] = useState(false);

  const form = useForm({ schema: policySchema, defaultValues: emptyDefaults });

  useEffect(() => {
    if (open) {
      form.reset(toFormValues(editing));
      setMapping(editing?.priority_mapping || DEFAULT_MAPPING);
      setDelayCustom(!DELAY_PRESETS.some((d) => d.value === editing?.escalation_delay_minutes));
      categoryAPI.list().then((res) => setCategories(res.data.results || res.data || [])).catch(() => {});
    }
  }, [open, editing]);

  const submit = async (values) => {
    const payload = {
      ...values,
      department: values.department || null,
      category: values.category || null,
      priority: values.priority || null,
      from_level: values.from_level || null,
      to_level: values.to_level || null,
      priority_mapping: mapping,
      notify_assigned_custom_pct: values.notify_assigned_custom ? Number(values.notify_assigned_custom_pct) : null,
      notify_manager_custom_pct: values.notify_manager_custom ? Number(values.notify_manager_custom_pct) : null,
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
                {DEPARTMENTS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </Select>
            )} />
            <FormField name="category" label="Category (optional)" children={({ field }) => (
              <Select {...field} value={field.value || ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Any Category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )} />
            <FormField name="priority" label="Priority (optional)" children={({ field }) => (
              <Select {...field} value={field.value || ""} onChange={(e) => field.onChange(e.target.value)}>
                <option value="">Any Priority</option>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            )} />
            <FormField name="from_level" label="From level" children={({ field }) => (
              <Select {...field} value={field.value || ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Any level</option>
                {SUPPORT_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </Select>
            )} />
            <FormField name="to_level" label="To level" children={({ field }) => (
              <Select {...field} value={field.value || ""} onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Next level after current</option>
                {SUPPORT_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
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

        <Section title="Notifications">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600">Notify Assigned Staff at</p>
              <ToggleRow label="50%" field="notify_assigned_50" form={form} />
              <ToggleRow label="75%" field="notify_assigned_75" form={form} />
              <div className="flex items-center gap-2">
                <ToggleRow label="Custom" field="notify_assigned_custom" form={form} />
                {form.watch("notify_assigned_custom") && (
                  <FormField name="notify_assigned_custom_pct" children={({ field }) => (
                    <Input type="number" min={1} max={99} className="w-20 h-8" {...field} onChange={(e) => field.onChange(e.target.value)} />
                  )} />
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-slate-600">Notify Manager / HOD at</p>
              <ToggleRow label="50%" field="notify_manager_50" form={form} />
              <ToggleRow label="75%" field="notify_manager_75" form={form} />
              <ToggleRow label="90%" field="notify_manager_90" form={form} />
              <ToggleRow label="100%" field="notify_manager_100" form={form} />
              <div className="flex items-center gap-2">
                <ToggleRow label="Custom" field="notify_manager_custom" form={form} />
                {form.watch("notify_manager_custom") && (
                  <FormField name="notify_manager_custom_pct" children={({ field }) => (
                    <Input type="number" min={1} max={99} className="w-20 h-8" {...field} onChange={(e) => field.onChange(e.target.value)} />
                  )} />
                )}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2">
            <ToggleRow label="In-App" field="notify_in_app" form={form} />
            <ToggleRow label="Email" field="notify_email" form={form} />
            <ToggleRow label="SMS (future)" field="notify_sms" form={form} />
          </div>
        </Section>

        <Section title="Auto Escalation">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ToggleRow label="Enable auto escalation" field="auto_escalate" form={form} />
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-700 whitespace-nowrap">Escalation delay</span>
              <FormField name="escalation_delay_minutes" children={({ field }) => {
                const current = Number(field.value || 0);
                const isPreset = !delayCustom;
                return (
                  <div className="flex items-center gap-2">
                    {isPreset ? (
                      <Select value={current} onChange={(e) => field.onChange(Number(e.target.value))}>
                        {DELAY_PRESETS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                      </Select>
                    ) : (
                      <Input type="number" min={0} value={current} onChange={(e) => field.onChange(e.target.value)} className="w-28" />
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={() => setDelayCustom(!isPreset)}>
                      {isPreset ? "Custom" : "Preset"}
                    </Button>
                  </div>
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

        {editing && <RulesEditor policy={editing} reload={onSaved} />}

        <div className="flex justify-end gap-2 pt-2">
          <DialogClose onClick={onClose}>Cancel</DialogClose>
          <Button type="submit">{editing ? "Save Policy" : "Create Policy"}</Button>
        </div>
      </Form>
    </Dialog>
  );
}
