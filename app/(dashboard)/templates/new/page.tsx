import { createClient } from "@/lib/supabase/server";
import type { Property } from "@/lib/types";
import { TemplateForm } from "../template-form";
import { createTemplate } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewTemplatePage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("properties")
    .select("*")
    .eq("active", true)
    .order("code");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">แม่แบบงานใหม่</h1>
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <TemplateForm properties={(data ?? []) as Property[]} action={createTemplate} />
      </div>
    </div>
  );
}
