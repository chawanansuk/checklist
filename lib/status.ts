import type { TaskInstance, TaskStatus } from "./types";

/**
 * Display status derived at read time so the dashboard stays correct even if
 * the overdue sweep (generate / phase-2 cron) has not run yet: an open task
 * whose due time has passed reads as 'overdue'.
 */
export function effectiveStatus(
  inst: Pick<TaskInstance, "status" | "due_at">,
  now: Date = new Date(),
): TaskStatus {
  if (
    (inst.status === "todo" || inst.status === "in_progress") &&
    new Date(inst.due_at) < now
  ) {
    return "overdue";
  }
  return inst.status;
}

export type TrafficColor = "green" | "yellow" | "red" | "gray";

/** Traffic-light colour for a task, given how close/late it is. */
export function trafficColor(
  inst: Pick<TaskInstance, "status" | "due_at">,
  now: Date = new Date(),
  soonHours = 24,
): TrafficColor {
  const st = effectiveStatus(inst, now);
  if (st === "done") return "green";
  if (st === "overdue") return "red";
  if (st === "skipped") return "gray";
  const hoursToDue =
    (new Date(inst.due_at).getTime() - now.getTime()) / 3_600_000;
  if (hoursToDue <= soonHours) return "yellow";
  return "gray";
}

export const TRAFFIC_BG: Record<TrafficColor, string> = {
  green: "bg-green-100 text-green-800",
  yellow: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
  gray: "bg-gray-100 text-gray-700",
};

export const TRAFFIC_DOT: Record<TrafficColor, string> = {
  green: "bg-green-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  gray: "bg-gray-400",
};
