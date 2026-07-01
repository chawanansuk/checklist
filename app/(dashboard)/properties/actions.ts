"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createProperty(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const name = String(formData.get("name_th") ?? "").trim();
  const area = String(formData.get("area") ?? "").trim() || null;
  if (!code || !name) return;

  const supabase = createClient();
  await supabase
    .from("properties")
    .insert({ code, name_th: name, area })
    .select();
  revalidatePath("/properties");
}

export async function togglePropertyActive(id: string, active: boolean) {
  const supabase = createClient();
  await supabase.from("properties").update({ active }).eq("id", id);
  revalidatePath("/properties");
}
