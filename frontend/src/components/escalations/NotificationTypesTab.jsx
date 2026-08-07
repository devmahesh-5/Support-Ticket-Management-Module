import React, { useEffect, useState } from "react";
import { BellRing, Mail, Info } from "lucide-react";
import { notificationAPI } from "../../api/client";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Switch } from "../ui/switch";

const TYPE_META = {
  ASSIGNMENT: { label: "Assignment", desc: "A ticket is assigned to you" },
  REPLY: { label: "Reply", desc: "Someone replies to your ticket" },
  STATUS_CHANGE: { label: "Status Change", desc: "Ticket status changes (e.g. resolved, closed)" },
  REASSIGNMENT: { label: "Reassignment", desc: "A ticket is reassigned to you" },
  ESCALATION: { label: "Escalation", desc: "A ticket is escalated/de-escalated" },
  DEADLINE_WARNING: { label: "Deadline Warning", desc: "Ticket approaches its SLA deadline" },
};

const CHANNELS = [
  { key: "in_app", label: "In-App", icon: BellRing, locked: true },
  { key: "email", label: "Email", icon: Mail },
];

export default function NotificationTypesTab() {
  const [settings, setSettings] = useState([]);
  const [saved, setSaved] = useState("");

  const load = () => notificationAPI.settings.list()
    .then((res) => setSettings(res.data.results || res.data || []))
    .catch(() => {});

  useEffect(() => { load(); }, []);

  const rows = settings;

  const toggle = async (setting, key, value) => {
    setSaved("");
    const prev = settings;
    setSettings(settings.map((s) => s.id === setting.id ? { ...s, [key]: value } : s));
    try {
      await notificationAPI.settings.update(setting.id, { [key]: value });
      setSaved(`${TYPE_META[setting.notification_type]?.label || setting.notification_type} ${key} updated`);
    } catch {
      setSettings(prev);
      setSaved("Failed to save - please try again");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <CardTitle>Notification Types</CardTitle>
        {saved && <span className="text-xs text-emerald-600">{saved}</span>}
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-800 mb-4">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Emails for each notification type are controlled here. In-App
            notifications are always on and cannot be disabled.
          </span>
        </div>

        <div className="space-y-3">
          {rows.map((s) => (
            <div key={s.notification_type} className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-4">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">
                  {TYPE_META[s.notification_type]?.label || s.type_label || s.notification_type}
                </p>
                <p className="text-xs text-slate-500">{TYPE_META[s.notification_type]?.desc || s.notification_type}</p>
              </div>
              <div className="flex items-center gap-5 shrink-0">
                {CHANNELS.map(({ key, label, icon: Icon, locked }) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <Icon className="h-4 w-4 text-slate-400" />
                    <span className="text-xs text-slate-600">{label}</span>
                    <Switch
                      checked={!!s[key]}
                      disabled={locked}
                      onCheckedChange={(v) => toggle(s, key, v)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
