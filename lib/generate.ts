/**
 * Task-instance generation.
 *
 * Phase 1 runs this on demand (owner button or /api/dev/run/generate).
 * In phase 2 the identical logic moves into the `generate-instances` edge
 * function triggered daily by pg_cron.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { nextDueDates, nextDueFromCompletion } from "./recurrence";
import { bangkokDateTimeToUtc } from "./tz";
import type { TaskInstance, TaskTemplate } from "./types";

export interface GenerateStats {
  templates: number;
  created: number;
  refreshed: number;
  overdue: number;
}

/** Build the instance row snapshot shared by both schedule bases. */
function snapshot(tpl: TaskTemplate, dueAtIso: string) {
  return {
    template_id: tpl.id,
    property_id: tpl.property_id,
    title_th: tpl.title_th,
    category: tpl.category,
    checklist: tpl.checklist,
    assignee_id: tpl.assignee_id,
    priority: tpl.priority,
    schedule_basis: tpl.schedule_basis,
    due_at: dueAtIso,
    status: "todo" as const,
  };
}

export async function generateInstances(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<GenerateStats> {
  const stats: GenerateStats = {
    templates: 0,
    created: 0,
    refreshed: 0,
    overdue: 0,
  };

  const { data: templates, error } = await db
    .from("task_templates")
    .select("*")
    .eq("active", true);
  if (error) throw error;

  for (const tpl of (templates ?? []) as TaskTemplate[]) {
    stats.templates++;
    const horizonDays = Math.ceil(tpl.reminder_lead_hours / 24) + 35;

    if (tpl.schedule_basis === "fixed") {
      const dues = nextDueDates(tpl, now, horizonDays);
      const rows = dues.map((d) => snapshot(tpl, d.toISOString()));
      if (rows.length) {
        const { data, error: upErr } = await db
          .from("task_instances")
          .upsert(rows, {
            onConflict: "template_id,due_at",
            ignoreDuplicates: true,
          })
          .select("id");
        if (upErr) throw upErr;
        stats.created += data?.length ?? 0;
      }

      // Refresh policy: future, not-yet-reminded todo instances follow the
      // latest template content. Reminded/in-progress/done are left untouched.
      const { data: refreshed, error: rErr } = await db
        .from("task_instances")
        .update({
          title_th: tpl.title_th,
          category: tpl.category,
          checklist: tpl.checklist,
          priority: tpl.priority,
        })
        .eq("template_id", tpl.id)
        .eq("status", "todo")
        .is("reminded_at", null)
        .gt("due_at", now.toISOString())
        .select("id");
      if (rErr) throw rErr;
      stats.refreshed += refreshed?.length ?? 0;
    } else {
      // from_completion: keep exactly one open task in flight.
      const { data: latestRows, error: lErr } = await db
        .from("task_instances")
        .select("*")
        .eq("template_id", tpl.id)
        .order("due_at", { ascending: false })
        .limit(1);
      if (lErr) throw lErr;
      const latest = (latestRows?.[0] as TaskInstance | undefined) ?? null;

      let due: Date | null = null;
      if (!latest) {
        // Seed the first occurrence at the anchor; if it is in the past, today.
        const [y, m, d] = tpl.anchor_date.split("-").map((n) => parseInt(n, 10));
        const anchorDue = bangkokDateTimeToUtc(y, m, d, tpl.time_of_day);
        due = anchorDue < now ? now : anchorDue;
      } else if (latest.status === "done" && latest.completed_at) {
        due = nextDueFromCompletion(tpl, new Date(latest.completed_at));
      }

      if (due) {
        const { data, error: upErr } = await db
          .from("task_instances")
          .upsert([snapshot(tpl, due.toISOString())], {
            onConflict: "template_id,due_at",
            ignoreDuplicates: true,
          })
          .select("id");
        if (upErr) throw upErr;
        stats.created += data?.length ?? 0;
      }
    }
  }

  // Mark past-due open tasks as overdue (phase 2's run-reminders will also push).
  const { data: od, error: odErr } = await db
    .from("task_instances")
    .update({ status: "overdue" })
    .in("status", ["todo", "in_progress"])
    .lt("due_at", now.toISOString())
    .select("id");
  if (odErr) throw odErr;
  stats.overdue += od?.length ?? 0;

  return stats;
}
