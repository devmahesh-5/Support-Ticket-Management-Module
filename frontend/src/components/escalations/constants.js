export const DEPARTMENTS = [
  { value: "CIV", label: "Civil Engineering" },
  { value: "ELE", label: "Electrical Engineering" },
  { value: "COM", label: "Computer Engineering" },
  { value: "MEC", label: "Mechanical Engineering" },
  { value: "ARC", label: "Architecture" },
  { value: "APP", label: "Applied Sciences" },
  { value: "CIT", label: "IT Support" },
  { value: "FIN", label: "Finance" },
  { value: "ACA", label: "Academic Affairs" },
  { value: "LIB", label: "Library" },
  { value: "FAC", label: "Facilities" },
];

export const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
];

export const SUPPORT_LEVELS = [
  { value: 0, label: "Level 0 - Staff" },
  { value: 1, label: "Level 1 - Team Lead" },
  { value: 2, label: "Level 2 - Department HOD" },
  { value: 3, label: "Level 3 - Campus Admin" },
];

export const DELAY_PRESETS = [
  { value: 0, label: "Immediately" },
  { value: 30, label: "30 Minutes" },
  { value: 60, label: "1 Hour" },
  { value: 120, label: "2 Hours" },
  { value: 240, label: "4 Hours" },
  { value: 480, label: "8 Hours" },
  { value: 1440, label: "24 Hours" },
];

export const RULE_FIELDS = [
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
  { value: "sla_status", label: "SLA Status" },
  { value: "department", label: "Department" },
  { value: "category", label: "Category ID" },
  { value: "escalation_level", label: "Escalation Level" },
  { value: "no_activity_hours", label: "No Activity (hours)" },
  { value: "sla_resolution_pct", label: "SLA Resolution %" },
  { value: "sla_response_pct", label: "SLA Response %" },
];

export const RULE_OPS = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "gt", label: "greater than" },
  { value: "gte", label: "greater than or equal" },
  { value: "lt", label: "less than" },
  { value: "lte", label: "less than or equal" },
  { value: "in", label: "is one of" },
  { value: "contains", label: "contains" },
];

export const RULE_ACTIONS = [
  { value: "escalate_now", label: "Escalate Now" },
  { value: "increase_priority", label: "Increase Priority" },
  { value: "assign_user", label: "Assign User" },
  { value: "assign_level", label: "Assign Handler Level (0=Staff, 1=Team Lead, 2=HOD, 3=Campus Admin)" },
  { value: "add_to_escalation_queue", label: "Add To Escalation Queue" },
];

export const STATUS_LABELS = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
  REOPENED: "Reopened",
  ESCALATED_L1: "With Team Lead",
  ESCALATED_L2: "With HOD",
  ADMIN_REVIEW: "Admin Review",
};

export const SLA_STATUSES = [
  { value: "OK", label: "On Track", tone: "success" },
  { value: "APPROACHING", label: "Approaching SLA", tone: "warning" },
  { value: "BREACHED", label: "Breached", tone: "danger" },
];

export const DEPT_OPTIONS = [{ value: "", label: "Any Department" }, ...DEPARTMENTS];
export const PRIORITY_OPTIONS = [{ value: "", label: "Any Priority" }, ...PRIORITIES];
