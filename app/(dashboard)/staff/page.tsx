import { createClient } from "@/lib/supabase/server";
import { ROLE_LABEL_TH } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { ToggleActive } from "../properties/toggle-active";
import { createStaff, toggleStaffActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Profile[];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold">พนักงาน</h1>

      <form
        action={createStaff}
        className="grid gap-3 rounded-xl bg-white p-4 shadow-sm sm:grid-cols-4"
      >
        <input
          name="full_name"
          placeholder="ชื่อ-นามสกุล"
          required
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm sm:col-span-2"
        />
        <select
          name="role"
          defaultValue="staff"
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="staff">พนักงาน</option>
          <option value="manager">ผู้จัดการ</option>
          <option value="owner">เจ้าของ</option>
        </select>
        <button className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">
          เพิ่มพนักงาน
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
                <div className="text-sm font-medium">{p.full_name}</div>
                <div className="text-xs text-gray-500">
                  {ROLE_LABEL_TH[p.role]} ·{" "}
                  {p.line_user_id ? (
                    <span className="text-green-600">เชื่อม LINE แล้ว</span>
                  ) : (
                    <span className="text-gray-400">ยังไม่เชื่อม LINE (เฟส 2)</span>
                  )}
                </div>
              </div>
              <ToggleActive id={p.id} active={p.active} action={toggleStaffActive} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
