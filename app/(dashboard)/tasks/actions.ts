"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { bangkokDateTimeToUtc } from "@/lib/tz";

/** Create a one-off (ad-hoc) task not tied to any template. */
export async function createAdhocTask(formData: FormData) {
  const title = String(formData.get("title_th") ?? "").trim();
  const propertyId = String(formData.get("property_id") ?? "");
  const date = String(formData.get("due_date") ?? ""); // yyyy-MM-dd
  const time = String(formData.get("due_time") ?? "09:00");
  const note = String(formData.get("note") ?? "").trim();
  if (!title || !date) return;

  const [y, m, d] = date.split("-").map((n) => parseInt(n, 10));
  const dueAt = bangkokDateTimeToUtc(y, m, d, time);

  const supabase = createClient();
  await supabase.from("task_instances").insert({
    title_th: title,
    category: "adhoc",
    property_id: propertyId || null,
    due_at: dueAt.toISOString(),
    note: note || null,
    checklist: [],
    schedule_basis: "fixed",
  });

  revalidatePath("/tasks");
  revalidatePath("/");
}
