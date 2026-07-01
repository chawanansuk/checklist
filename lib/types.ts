/** Shared application types mirroring the database schema. */

export type UserRole = "owner" | "manager" | "staff";
export type TaskStatus =
  | "todo"
  | "in_progress"
  | "done"
  | "overdue"
  | "skipped";
export type RecurFreq =
  | "once"
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";
export type ScheduleBasis = "fixed" | "from_completion";
export type ChecklistItemType = "check" | "number" | "text" | "photo";

export interface ChecklistItem {
  key: string;
  label: string;
  type: ChecklistItemType;
  required?: boolean;
  unit?: string;
}

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  line_user_id: string | null;
  line_is_friend: boolean;
  active: boolean;
  created_at: string;
}

export interface Property {
  id: string;
  code: string;
  name_th: string;
  area: string | null;
  line_group_id: string | null;
  active: boolean;
}

export interface TaskTemplate {
  id: string;
  property_id: string | null;
  category: string;
  title_th: string;
  description: string | null;
  checklist: ChecklistItem[];
  assignee_id: string | null;
  assignee_role: UserRole | null;
  priority: number;
  freq: RecurFreq;
  interval: number;
  byweekday: number[] | null;
  bymonthday: number | null;
  month: number | null;
  anchor_date: string;
  time_of_day: string;
  schedule_basis: ScheduleBasis;
  reminder_lead_hours: number;
  overdue_escalation_hours: number;
  requires_photo: boolean;
  active: boolean;
  created_at: string;
}

export interface TaskInstance {
  id: string;
  template_id: string | null;
  property_id: string | null;
  title_th: string;
  category: string;
  checklist: ChecklistItem[];
  assignee_id: string | null;
  claimed_by: string | null;
  priority: number;
  schedule_basis: ScheduleBasis;
  due_at: string;
  status: TaskStatus;
  result: Record<string, unknown>;
  note: string | null;
  completed_at: string | null;
  completed_by: string | null;
  reminded_at: string | null;
  created_at: string;
}

export interface TaskPhoto {
  id: string;
  instance_id: string;
  url: string;
  uploaded_by: string | null;
  created_at: string;
}
