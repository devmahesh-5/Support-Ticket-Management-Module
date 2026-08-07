import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, AlertOctagon, Clock, Inbox, UserX, Gauge } from "lucide-react";
import { escalationAPI, userAPI } from "../../api/client";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { PRIORITIES } from "./constants";

const fmt = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

const SECTION_TONE = {
  approaching: "warning",
  breached: "danger",
  escalation_queue: "info",
  waiting_assignment: "default",
};

function RowActions({ row, mode, staff, reload }) {
  const [expanded, setExpanded] = useState(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
      setExpanded(null);
      reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-1">
        {mode !== "waiting_assignment" && (
          <Button variant="outline" size="sm" onClick={() => { setExpanded(expanded === "assign" ? null : "assign"); }}>
            Assign
          </Button>
        )}
        {mode === "escalation_queue" && (
          <Button variant="outline" size="sm" onClick={() => run(() => escalationAPI.dashboard.keepOwner(row.id))}>
            Keep Owner
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => { setExpanded(expanded === "priority" ? null : "priority"); }}>
          Priority
        </Button>
        <Button variant="ghost" size="sm" className="text-emerald-600" onClick={() => run(() => escalationAPI.dashboard.resolve(row.id))}>
          Resolve
        </Button>
      </div>

      {expanded === "assign" && (
        <div className="flex items-center gap-1.5">
          <select
            className="h-8 rounded-md border border-slate-300 bg-transparent px-2 text-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">Select staff...</option>
            {staff.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
            ))}
          </select>
          <Button size="sm" disabled={!value || busy} onClick={() => value && run(() => escalationAPI.dashboard.assign(row.id, { assigned_to: Number(value) }))}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded(null)}>Cancel</Button>
        </div>
      )}

      {expanded === "priority" && (
        <div className="flex items-center gap-1.5">
          <select
            className="h-8 rounded-md border border-slate-300 bg-transparent px-2 text-xs"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          >
            <option value="">Select priority...</option>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <Button size="sm" disabled={!value || busy} onClick={() => value && run(() => escalationAPI.dashboard.increasePriority(row.id, { priority: value }))}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setExpanded(null)}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function DashboardTable({ title, rows, mode, staff, reload, emptyText }) {
  const columns = useMemo(() => [
    { accessorKey: "ticket_id", header: "ID", cell: (c) => <span className="font-mono text-xs">{c.getValue()}</span> },
    { accessorKey: "title", header: "Title", cell: (c) => <span className="line-clamp-1 max-w-[280px]">{c.getValue()}</span> },
    { accessorKey: "category_name", header: "Category" },
    { accessorKey: "priority", header: "Priority", cell: (c) => <Badge variant={c.getValue() === "CRITICAL" ? "danger" : c.getValue() === "HIGH" ? "warning" : "info"}>{c.getValue()}</Badge> },
    { id: "assignee", header: "Assignee", cell: (c) => c.row.original.assigned_to_name || <span className="text-amber-600">Unassigned</span> },
    { accessorKey: "sla_deadline", header: "SLA Deadline", cell: (c) => <span className="font-mono text-xs">{fmt(c.getValue())}</span> },
  ], []);

  const header = (id) => columns.find((c) => c.id === id)?.header || columns.find((c) => c.accessorKey === id)?.header;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <Badge variant={SECTION_TONE[mode]}>{rows.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => <TableHead key={c.id || c.accessorKey}>{header(c.id || c.accessorKey)}</TableHead>)}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {columns.map((c) => {
                  const key = c.id || c.accessorKey;
                  const value = row[c.accessorKey];
                  return <TableCell key={key}>{c.cell ? c.cell({ getValue: () => value, row: { original: row } }) : (value ?? "—")}</TableCell>;
                })}
                <TableCell className="text-right">
                  <RowActions row={row} mode={mode} staff={staff} reload={reload} />
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-8 text-slate-400">{emptyText}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

const KPIS = [
  { key: "approaching", label: "Approaching SLA", icon: Clock, tone: "text-amber-500", bg: "bg-amber-50" },
  { key: "breached", label: "Breached SLA", icon: AlertOctagon, tone: "text-rose-500", bg: "bg-rose-50" },
  { key: "escalation_queue", label: "Escalation Queue", icon: Inbox, tone: "text-brand-600", bg: "bg-brand-50" },
  { key: "waiting_assignment", label: "Waiting Assignment", icon: UserX, tone: "text-sky-500", bg: "bg-sky-50" },
];

export default function EscalationDashboardPage() {
  const [data, setData] = useState(null);
  const [staff, setStaff] = useState([]);

  const load = () => {
    escalationAPI.dashboard.get().then((res) => setData(res.data)).catch(() => {});
    userAPI.list()
      .then((res) => setStaff((res.data.results || res.data || []).filter((u) => ["STAFF", "DEPT_ADMIN", "CAMPUS_ADMIN"].includes(u.role))))
      .catch(() => {});
  };
  useEffect(load, []);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Gauge className="w-6 h-6 text-brand-600" /> Escalation Dashboard
          </h1>
          <p className="text-xs text-slate-500">Tickets tracked by the SLA escalation engine. Take direct action below.</p>
        </div>
        <Badge variant="outline">
          {data.average_breach_hours === null ? "No breaches yet" : `Avg breach age: ${data.average_breach_hours}h`}
        </Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map((k) => {
          const Icon = k.icon;
          const count = data.counts?.[k.key] ?? 0;
          return (
            <Card key={k.key}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${k.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${k.tone}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-500">{k.label}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DashboardTable
        title="Approaching SLA"
        mode="approaching"
        rows={data.approaching}
        staff={staff}
        reload={load}
        emptyText="No tickets approaching their SLA."
      />
      <DashboardTable
        title="SLA Breached"
        mode="breached"
        rows={data.breached}
        staff={staff}
        reload={load}
        emptyText="No breached tickets. "
      />
      <DashboardTable
        title="Escalation Queue"
        mode="escalation_queue"
        rows={data.escalation_queue}
        staff={staff}
        reload={load}
        emptyText="Escalation queue is empty."
      />
      <DashboardTable
        title="Waiting Assignment"
        mode="waiting_assignment"
        rows={data.waiting_assignment}
        staff={staff}
        reload={load}
        emptyText="All open tickets are assigned."
      />

      {data.longest_breached?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-rose-500" /> Longest Breached</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Breached Since</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.longest_breached.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.ticket_id}</TableCell>
                    <TableCell className="line-clamp-1 max-w-xs">{r.title}</TableCell>
                    <TableCell className="font-mono text-xs">{fmt(r.sla_breached_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
