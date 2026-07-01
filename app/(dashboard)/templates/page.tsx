import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { FREQ_LABEL_TH } from "@/lib/format";
import type { TaskTemplate } from "@/lib/types";

export const dynamic = "force-dynamic";

type Row = TaskTemplate & {
  properties: { code: string } | null;
};

export default async function TemplatesPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("task_templates")
    .select("*, properties(code)")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Row[];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">แม่แบบงาน</h1>
        <Link
          href="/templates/new"
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white"
        >
          + แม่แบบใหม่
        </Link>
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">ยังไม่มีแม่แบบงาน</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {rows.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/templates/${t.id}/edit`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {t.title_th}
                      </span>
                      {!t.active && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                          ปิดใช้งาน
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {t.properties ? t.properties.code : "ทุกอาคาร"} ·{" "}
                      {FREQ_LABEL_TH[t.freq]}
                      {t.interval > 1 ? ` (ทุก ${t.interval})` : ""} ·{" "}
                      {t.schedule_basis === "from_completion"
                        ? "นับจากที่ทำเสร็จ"
                        : "ตามปฏิทิน"}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">แก้ไข →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
