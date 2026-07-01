"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

export async function createStaff(formData: FormData) {
  const name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "staff") as UserRole;
  if (!name) return;

  const supabase = createClient();
  await supabase.from("profiles").insert({ full_name: name, role });
  revalidatePath("/staff");
}

export async function toggleStaffActive(id: string, active: boolean) {
  const supabase = createClient();
  await supabase.from("profiles").update({ active }).eq("id", id);
  revalidatePath("/staff");
}
