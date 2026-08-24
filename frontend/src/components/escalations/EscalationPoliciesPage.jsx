import React, { useEffect, useMemo, useState } from "react";
import { useReactTable, getCoreRowModel, getSortedRowModel, flexRender } from "@tanstack/react-table";
import { Plus, Pencil, Trash2, ShieldAlert, BellRing, Settings } from "lucide-react";
import { escalationAPI, systemSettingAPI, departmentAPI } from "../../api/client";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { PRIORITIES } from "./constants";
import PolicyEditor from "./PolicyEditor";
import NotificationTypesTab from "./NotificationTypesTab";

export default function EscalationPoliciesPage() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [tab, setTab] = useState("policies");
  const [allowTwoWay, setAllowTwoWay] = useState(true);
  const [departments, setDepartments] = useState([]);

  const isCampusAdmin = user?.role === "CAMPUS_ADMIN";

  const load = () => escalationAPI.policies.list().then((res) => setPolicies(res.data.results || res.data || [])).catch(() => {});
  useEffect(() => {
    load();
    departmentAPI.list().then((res) => setDepartments(res.data.results || res.data || [])).catch(() => {});
    systemSettingAPI.get()
      .then((res) => setAllowTwoWay(res.data.allow_two_way_escalation))
      .catch(() => {});
  }, []);

  const handleToggleTwoWay = async (e) => {
    const val = e.target.checked;
    setAllowTwoWay(val);
    try {
      await systemSettingAPI.update({ allow_two_way_escalation: val });
    } catch {
      setAllowTwoWay(!val);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this policy?")) return;
    await escalationAPI.policies.remove(id).catch(() => {});
    load();
  };

  const deptLabel = (v) => (v ? departments.find((d) => d.code === v)?.name || v : "Any");
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
        const fmt = (v) => (v === 0 ? "L0" : v ? `L${v}` : null);
        return to !== null && to !== undefined
          ? <Badge variant="info">{from !== null && from !== undefined ? `${fmt(from)} → L${to}` : `Any → L${to}`}</Badge>
          : <Badge variant="outline">Next level</Badge>;
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

      {tab === "policies" && (
        <>
          {/* Direction control (moved from Admin > Escalation Policy) */}
          <div className="custom-card p-4 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Settings className="w-4 h-4 text-brand-600" />
                Escalation Policy &amp; Direction Control
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure whether tickets can be de-escalated back to lower management levels
                {isCampusAdmin ? "" : " (only the Campus Admin can change this)"}
              </p>
            </div>
            {isCampusAdmin ? (
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={allowTwoWay}
                  onChange={handleToggleTwoWay}
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            ) : (
              <span className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ${allowTwoWay ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                {allowTwoWay ? "De-escalation ON" : "De-escalation OFF"}
              </span>
            )}
          </div>

          <Card>
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
          </Card>
        </>
      )}

      <PolicyEditor open={open} onClose={() => setOpen(false)} onSaved={load} editing={editing} />
    </div>
  );
}
