import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Property, TaskTemplate } from "@/lib/types";
import { TemplateForm } from "../../template-form";
import { updateTemplate } from "../../actions";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const [{ data: tpl }, { data: props }] = await Promise.all([
    supabase.from("task_templates").select("*").eq("id", params.id).maybeSingle(),
    supabase.from("properties").select("*").eq("active", true).order("code"),
  ]);

  if (!tpl) notFound();
  const update = updateTemplate.bind(null, params.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold">แก้ไขแม่แบบงาน</h1>
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <TemplateForm
          properties={(props ?? []) as Property[]}
          template={tpl as TaskTemplate}
          action={update}
        />
      </div>
    </div>
  );
}
