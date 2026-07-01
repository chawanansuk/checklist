"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateInstances, type GenerateStats } from "@/lib/generate";

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Owner-triggered task generation (phase 2 moves this to a daily cron). */
export async function generateNow(): Promise<GenerateStats> {
  const stats = await generateInstances(createAdminClient());
  revalidatePath("/");
  revalidatePath("/tasks");
  return stats;
}
