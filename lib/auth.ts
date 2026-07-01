import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/**
 * Return the profile for the currently signed-in user, creating one on first
 * login. The very first user to sign in becomes the 'owner'; subsequent new
 * users default to 'manager'. Returns null if not signed in.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existing) return existing as Profile;

  // Bootstrap a profile. First signed-in account with a login owns the system.
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("auth_user_id", "is", null);
  const role = (count ?? 0) === 0 ? "owner" : "manager";

  const { data: created } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: user.id,
      full_name: user.email?.split("@")[0] ?? "ผู้ใช้",
      role,
    })
    .select("*")
    .single();

  return (created as Profile) ?? null;
}
