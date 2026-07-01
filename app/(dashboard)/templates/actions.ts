"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ChecklistItem } from "@/lib/types";

function num(v: FormDataEntryValue | null, fallback: number): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function optNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseChecklist(raw: string): ChecklistItem[] {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((i) => i && i.key && i.label && i.type);
  } catch {
    return [];
  }
}

function buildRow(formData: FormData) {
  const freq = String(formData.get("freq"));
  const byweekday = formData
    .getAll("byweekday")
    .map((v) => parseInt(String(v), 10))
    .filter((n) => Number.isFinite(n));
  const checklist = parseChecklist(String(formData.get("checklist") ?? "[]"));
  const requiresPhoto =
    formData.get("requires_photo") === "on" ||
    checklist.some((c) => c.type === "photo" && c.required);

  return {
    title_th: String(formData.get("title_th") ?? "").trim(),
    category: String(formData.get("category") ?? "general").trim() || "general",
    description: String(formData.get("description") ?? "").trim() || null,
    property_id: String(formData.get("property_id") ?? "") || null,
    assignee_role: (String(formData.get("assignee_role") ?? "") ||
      null) as never,
    priority: num(formData.get("priority"), 2),
    freq: freq as never,
    interval: num(formData.get("interval"), 1),
    byweekday: freq === "weekly" && byweekday.length ? byweekday : null,
    bymonthday:
      freq === "monthly" || freq === "quarterly" || freq === "yearly"
        ? optNum(formData.get("bymonthday"))
        : null,
    month: freq === "yearly" ? optNum(formData.get("month")) : null,
    anchor_date:
      String(formData.get("anchor_date") ?? "") ||
      new Date().toISOString().slice(0, 10),
    time_of_day: String(formData.get("time_of_day") ?? "09:00") || "09:00",
    schedule_basis: String(formData.get("schedule_basis") ?? "fixed") as never,
    reminder_lead_hours: num(formData.get("reminder_lead_hours"), 24),
    overdue_escalation_hours: num(formData.get("overdue_escalation_hours"), 24),
    requires_photo: requiresPhoto,
    checklist,
    active: formData.get("active") === "on",
  };
}

export async function createTemplate(formData: FormData) {
  const supabase = createClient();
  await supabase.from("task_templates").insert(buildRow(formData));
  revalidatePath("/templates");
  redirect("/templates");
}

export async function updateTemplate(id: string, formData: FormData) {
  const supabase = createClient();
  await supabase.from("task_templates").update(buildRow(formData)).eq("id", id);
  revalidatePath("/templates");
  redirect("/templates");
}

export async function toggleTemplateActive(id: string, active: boolean) {
  const supabase = createClient();
  await supabase.from("task_templates").update({ active }).eq("id", id);
  revalidatePath("/templates");
}
