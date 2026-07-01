import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatThaiDateTime } from "@/lib/format";
import { formatBangkok } from "@/lib/tz";
import {
  effectiveStatus,
  trafficColor,
  TRAFFIC_BG,
  TRAFFIC_DOT,
} from "@/lib/status";
import type { TaskInstance } from "@/lib/types";
import { GenerateButton } from "./_components/generate-button";

export const dynamic = "force-dynamic";

type Row = TaskInstance & {
  properties: { code: string; name_th: string } | null;
};

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: string;
}) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

function TaskLine({ t }: { t: Row }) {
  const color = trafficColor(t);
  return (
    <Link
      href={`/task/${t.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${TRAFFIC_DOT[color]}`} />
        <span className="truncate text-sm">{t.title_th}</span>
        {t.properties && (
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
            {t.properties.code}
          </span>
        )}
      </div>
      <span className="shrink-0 text-xs text-gray-500">
        {formatThaiDateTime(new Date(t.due_at))}
      </span>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("task_instances")
    .select("*, properties(code, name_th)")
    .order("due_at", { ascending: true });

  const rows = (data ?? []) as Row[];
  const now = new Date();
  const todayKey = formatBangkok(now, "yyyy-MM-dd");
  const weekAhead = new Date(now.getTime() + 7 * 86_400_000);

  const isOpen = (r: Row) => {
    const s = effectiveStatus(r, now);
    return s === "todo" || s === "in_progress" || s === "overdue";
  };

  const dueToday = rows.filter(
    (r) => isOpen(r) && formatBangkok(new Date(r.due_at), "yyyy-MM-dd") === todayKey,
  );
  const thisWeek = rows.filter(
    (r) =>
      isOpen(r) &&
      new Date(r.due_at) >= now &&
      new Date(r.due_at) <= weekAhead,
  );
  const overdue = rows.filter((r) => effectiveStatus(r, now) === "overdue");

  const doneRows = rows.filter((r) => r.status === "done" && r.completed_at);
  const onTime = doneRows.filter(
    (r) => new Date(r.completed_at!) <= new Date(r.due_at),
  );
  const onTimePct = doneRows.length
    ? Math.round((onTime.length / doneRows.length) * 100)
    : null;

  // Overdue backlog per property.
  const backlog = new Map<string, number>();
  for (const r of overdue) {
    const key = r.properties ? r.properties.name_th : "ไม่ระบุอาคาร";
    backlog.set(key, (backlog.get(key) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">แดชบอร์ด</h1>
        <GenerateButton />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="ครบกำหนดวันนี้" value={dueToday.length} tone="text-amber-600" />
        <StatCard label="ภายในสัปดาห์นี้" value={thisWeek.length} tone="text-gray-900" />
        <StatCard label="เกินกำหนด" value={overdue.length} tone="text-red-600" />
        <StatCard
          label="เสร็จตรงเวลา"
          value={onTimePct === null ? "—" : `${onTimePct}%`}
          tone="text-green-600"
        />
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-medium">งานวันนี้</h2>
          {dueToday.length === 0 ? (
            <p className="text-sm text-gray-400">ไม่มีงานครบกำหนดวันนี้</p>
          ) : (
            <div className="space-y-1.5">
              {dueToday.map((t) => (
                <TaskLine key={t.id} t={t} />
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-medium">เกินกำหนด</h2>
          {overdue.length === 0 ? (
            <p className="text-sm text-gray-400">ไม่มีงานค้าง 🎉</p>
          ) : (
            <div className="space-y-1.5">
              {overdue.slice(0, 12).map((t) => (
                <TaskLine key={t.id} t={t} />
              ))}
            </div>
          )}
        </div>
      </section>

      {backlog.size > 0 && (
        <section className="rounded-xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-medium">งานค้างแยกตามอาคาร</h2>
          <div className="flex flex-wrap gap-2">
            {[...backlog.entries()].map(([name, count]) => (
              <span
                key={name}
                className={`rounded-full px-3 py-1 text-sm ${TRAFFIC_BG.red}`}
              >
                {name}: {count}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
