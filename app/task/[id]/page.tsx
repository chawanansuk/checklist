import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatThaiDateTime, STATUS_LABEL_TH } from "@/lib/format";
import { effectiveStatus, trafficColor, TRAFFIC_BG } from "@/lib/status";
import type { ChecklistItem, TaskInstance } from "@/lib/types";
import { ChecklistForm } from "./checklist-form";

export const dynamic = "force-dynamic";

type Row = TaskInstance & {
  properties: { code: string; name_th: string } | null;
};

export default async function TaskPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from("task_instances")
    .select("*, properties(code, name_th)")
    .eq("id", params.id)
    .maybeSingle();

  if (!data) notFound();
  const task = data as Row;
  const checklist = (task.checklist ?? []) as ChecklistItem[];
  const result = (task.result ?? {}) as Record<string, unknown>;

  // Resolve signed URLs for any already-uploaded photos.
  const admin = createAdminClient();
  const existingPhotos: Record<string, string[]> = {};
  for (const item of checklist) {
    if (item.type !== "photo") continue;
    const paths = Array.isArray(result[item.key])
      ? (result[item.key] as string[])
      : [];
    const urls: string[] = [];
    for (const p of paths) {
      const { data: signed } = await admin.storage
        .from("task-photos")
        .createSignedUrl(p, 3600);
      if (signed?.signedUrl) urls.push(signed.signedUrl);
    }
    existingPhotos[item.key] = urls;
  }

  const status = effectiveStatus(task);
  const color = trafficColor(task);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Link href="/tasks" className="text-sm text-gray-500 hover:underline">
        ← กลับไปรายการงาน
      </Link>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">{task.title_th}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {task.properties
                ? `${task.properties.code} · ${task.properties.name_th} · `
                : ""}
              ครบกำหนด {formatThaiDateTime(new Date(task.due_at))}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${TRAFFIC_BG[color]}`}
          >
            {STATUS_LABEL_TH[status]}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 shadow-sm">
        <ChecklistForm
          instanceId={task.id}
          checklist={checklist}
          result={result}
          note={task.note}
          existingPhotos={existingPhotos}
          done={task.status === "done"}
        />
      </div>
    </div>
  );
}
