"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { ChecklistItem, TaskInstance } from "@/lib/types";

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

/**
 * Save a checklist. `intent` = 'save' (in_progress) or 'complete' (done).
 * On complete, required fields (including photos) are enforced server-side.
 */
export async function submitChecklist(
  instanceId: string,
  _prev: SubmitResult,
  formData: FormData,
): Promise<SubmitResult> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "ไม่ได้เข้าสู่ระบบ" };

  const supabase = createClient();
  const { data: inst } = await supabase
    .from("task_instances")
    .select("*")
    .eq("id", instanceId)
    .single();
  if (!inst) return { ok: false, error: "ไม่พบงานนี้" };

  const task = inst as TaskInstance;
  const checklist = (task.checklist ?? []) as ChecklistItem[];
  const intent = String(formData.get("intent") ?? "save");
  const admin = createAdminClient();

  const result: Record<string, unknown> = { ...(task.result ?? {}) };
  const missing: string[] = [];

  for (const item of checklist) {
    if (item.type === "photo") continue; // handled below
    const raw = formData.get(`field:${item.key}`);
    if (item.type === "check") {
      result[item.key] = raw === "on" || raw === "true";
      if (item.required && !result[item.key]) missing.push(item.label);
    } else {
      const val = String(raw ?? "").trim();
      result[item.key] = item.type === "number" && val ? Number(val) : val;
      if (item.required && !val) missing.push(item.label);
    }
  }

  // Photo uploads.
  for (const item of checklist) {
    if (item.type !== "photo") continue;
    const files = formData
      .getAll(`field:${item.key}`)
      .filter((f): f is File => f instanceof File && f.size > 0);
    const existing = Array.isArray(result[item.key])
      ? (result[item.key] as string[])
      : [];
    const uploaded: string[] = [...existing];

    for (const file of files) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${instanceId}/${item.key}-${Date.now()}-${Math.round(
        file.size,
      )}.${ext}`;
      const { error: upErr } = await admin.storage
        .from("task-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) return { ok: false, error: `อัปโหลดรูปไม่สำเร็จ: ${upErr.message}` };
      await admin.from("task_photos").insert({
        instance_id: instanceId,
        url: path,
        storage_path: path,
        uploaded_by: profile.id,
      });
      uploaded.push(path);
    }
    result[item.key] = uploaded;
    if (item.required && uploaded.length === 0) missing.push(item.label);
  }

  const note = String(formData.get("note") ?? "").trim() || null;

  if (intent === "complete" && missing.length) {
    return {
      ok: false,
      error: `กรุณากรอกให้ครบ: ${missing.join(", ")}`,
    };
  }

  const patch: Record<string, unknown> = { result, note };
  if (intent === "complete") {
    patch.status = "done";
    patch.completed_at = new Date().toISOString();
    patch.completed_by = profile.id;
  } else if (task.status === "todo") {
    patch.status = "in_progress";
  }

  const { error: updErr } = await admin
    .from("task_instances")
    .update(patch)
    .eq("id", instanceId);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/task/${instanceId}`);
  revalidatePath("/");
  revalidatePath("/tasks");
  return { ok: true };
}
