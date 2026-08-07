import React, { useEffect, useMemo, useState } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, ShieldAlert, BellRing } from "lucide-react";
import { escalationAPI } from "../../api/client";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { PRIORITIES, DEPARTMENTS } from "./constants";
import PolicyEditor from "./PolicyEditor";
import NotificationTypesTab from "./NotificationTypesTab";

export default function EscalationPoliciesPage() {
  const [policies, setPolicies] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("policies");

  const load = () => escalationAPI.policies.list().then((res) => setPolicies(res.data.results || res.data || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm("Delete this policy?")) return;
    await escalationAPI.policies.remove(id).catch(() => {});
    load();
  };

  const deptLabel = (v) => (v ? DEPARTMENTS.find((d) => d.value === v)?.label || v : "Any");
  const prioLabel = (v) => (v ? PRIORITIES.find((p) => p.value === v)?.label || v : "Any");

  const columns = useMemo(() => [
    { accessorKey: "name", header: "Policy", cell: (c) => (
        <div>
          <span className="font-medium text-slate-900">{c.getValue()}</span>
          {c.row.original.description && <p className="text-xs text-slate-400 truncate max-w-xs">{c.row.original.description}</p>}
        </div>
      ) },
    { accessorKey: "department", header: "Dept", cell: (c) => deptLabel(c.getValue()) },
    { accessorKey: "category_name", header: "Category", cell: (c) => c.getValue() || "Any" },
    { accessorKey: "priority", header: "Priority", cell: (c) => prioLabel(c.getValue()) },
    { id: "levels", header: "Escalation", cell: (c) => {
        const from = c.row.original.from_level;
        const to = c.row.original.to_level;
        return to ? <Badge variant="info">{from ? `L${from} → L${to}` : `Any → L${to}`}</Badge> : <Badge variant="outline">Next level</Badge>;
      } },
    { accessorKey: "auto_escalate", header: "Auto", cell: (c) => c.getValue() ? <Badge variant="warning">Escalates</Badge> : <Badge variant="outline">Off</Badge> },
    { accessorKey: "is_enabled", header: "Status", cell: (c) => c.getValue() ? <Badge variant="success">Enabled</Badge> : <Badge variant="info">Disabled</Badge> },
    { id: "actions", header: "", cell: (c) => (
        <div className="flex gap-1 justify-end">
          <Button variant="ghost" size="icon" onClick={() => { setEditing(c.row.original); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => remove(c.row.original.id)}><Trash2 className="h-4 w-4 text-rose-500" /></Button>
        </div>
      ) },
  ], []);

  const table = useReactTable({ data: policies, columns, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-brand-600" /> Escalation Policies
          </h1>
          <p className="text-xs text-slate-500">SLA thresholds, notifications, auto escalation and rules - all configuration, no code.</p>
        </div>
        <div className="flex gap-2">
          {tab === "policies" && (
            <Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> New Policy</Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab("policies")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${tab === "policies" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          Escalation Policies
        </button>
        <button
          type="button"
          onClick={() => setTab("types")}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors flex items-center gap-2 ${tab === "types" ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}
        >
          <BellRing className="h-4 w-4" /> Notification Types
        </button>
      </div>

      {tab === "types" && <NotificationTypesTab />}

      {tab === "policies" && <Card>
        <CardHeader><CardTitle>Policies ({policies.length})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>{hg.headers.map((h) => <TableHead key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</TableHead>)}</TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>{row.getVisibleCells().map((cell) => <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>
              ))}
              {!policies.length && <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No escalation policies yet. Create one to start automating SLA enforcement.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>}

      <PolicyEditor open={open} onClose={() => setOpen(false)} onSaved={load} editing={editing} />
    </div>
  );
}
