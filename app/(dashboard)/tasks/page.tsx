import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDateTime, STATUS_LABEL_TH } from "@/lib/format";
import {
  effectiveStatus,
  trafficColor,
  TRAFFIC_BG,
  TRAFFIC_DOT,
} from "@/lib/status";
import type { Property, TaskInstance } from "@/lib/types";
import { createAdhocTask } from "./actions";

export const dynamic = "force-dynamic";

type Row = TaskInstance & {
  properties: { code: string; name_th: string } | null;
};

const FILTERS = [
  { key: "open", label: "ค้างอยู่" },
  { key: "overdue", label: "เกินกำหนด" },
  { key: "done", label: "เสร็จแล้ว" },
  { key: "all", label: "ทั้งหมด" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { filter?: string };
}) {
  const filter = searchParams.filter ?? "open";
  const supabase = createClient();

  const [{ data: taskData }, { data: propData }] = await Promise.all([
    supabase
      .from("task_instances")
      .select("*, properties(code, name_th)")
      .order("due_at", { ascending: true }),
    supabase.from("properties").select("*").eq("active", true).order("code"),
  ]);

  const now = new Date();
  const rows = (taskData ?? []) as Row[];
  const properties = (propData ?? []) as Property[];

  const filtered = rows.filter((r) => {
    const s = effectiveStatus(r, now);
    if (filter === "all") return true;
    if (filter === "overdue") return s === "overdue";
    if (filter === "done") return s === "done";
    return s === "todo" || s === "in_progress" || s === "overdue"; // open
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">งาน</h1>

      <details className="rounded-xl bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">
          + เพิ่มงานเฉพาะกิจ
        </summary>
        <form action={createAdhocTask} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm sm:col-span-2">
            ชื่องาน
            <input
              name="title_th"
              required
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm">
            อาคาร
            <select
              name="property_id"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">— ไม่ระบุ —</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name_th}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              วันครบกำหนด
              <input
                type="date"
                name="due_date"
                required
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm">
              เวลา
              <input
                type="time"
                name="due_time"
                defaultValue="09:00"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="text-sm sm:col-span-2">
            หมายเหตุ
            <input
              name="note"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <button className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white sm:col-span-2">
            บันทึกงาน
          </button>
        </form>
      </details>

      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/tasks?filter=${f.key}`}
            className={`rounded-md px-3 py-1.5 text-sm ${
              filter === f.key
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        {filtered.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">ไม่มีงาน</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((t) => {
              const color = trafficColor(t, now);
              return (
                <li key={t.id}>
                  <Link
                    href={`/task/${t.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${TRAFFIC_DOT[color]}`}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {t.title_th}
                        </div>
                        <div className="text-xs text-gray-500">
                          {t.properties ? `${t.properties.code} · ` : ""}
                          {formatThaiDateTime(new Date(t.due_at))}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${TRAFFIC_BG[color]}`}
                    >
                      {STATUS_LABEL_TH[effectiveStatus(t, now)]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
