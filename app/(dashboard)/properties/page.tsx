import { createClient } from "@/lib/supabase/server";
import type { Property } from "@/lib/types";
import { createProperty, togglePropertyActive } from "./actions";
import { ToggleActive } from "./toggle-active";

export const dynamic = "force-dynamic";

export default async function PropertiesPage() {
  const supabase = createClient();
  const { data } = await supabase.from("properties").select("*").order("code");
  const rows = (data ?? []) as Property[];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">อาคาร</h1>

      <form
        action={createProperty}
        className="grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-4"
      >
        <input
          name="code"
          placeholder="รหัส (เช่น MTG)"
          required
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase"
        />
        <input
          name="name_th"
          placeholder="ชื่ออาคาร"
          required
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          name="area"
          placeholder="พื้นที่ (ไม่บังคับ)"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white sm:col-span-4">
          เพิ่มอาคาร
        </button>
      </form>

      <div className="rounded-xl bg-white shadow-sm">
        <ul className="divide-y divide-gray-100">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">
                  {p.code} · {p.name_th}
                </div>
                {p.area && <div className="text-xs text-gray-500">{p.area}</div>}
              </div>
              <ToggleActive
                id={p.id}
                active={p.active}
                action={togglePropertyActive}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
