"use client";

import { useState } from "react";
import type {
  ChecklistItem,
  ChecklistItemType,
  Property,
  TaskTemplate,
} from "@/lib/types";
import { CHECKLIST_TYPE_LABEL_TH } from "@/lib/format";

const FREQ_OPTIONS: { value: string; label: string }[] = [
  { value: "once", label: "ครั้งเดียว" },
  { value: "daily", label: "รายวัน" },
  { value: "weekly", label: "รายสัปดาห์" },
  { value: "monthly", label: "รายเดือน" },
  { value: "quarterly", label: "ราย 3 เดือน" },
  { value: "yearly", label: "รายปี" },
];

const WEEKDAYS = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"]; // 0=Mon..6=Sun

const TYPE_OPTIONS: ChecklistItemType[] = ["check", "number", "text", "photo"];

const emptyItem = (): ChecklistItem => ({
  key: "",
  label: "",
  type: "check",
  required: false,
});

export function TemplateForm({
  properties,
  template,
  action,
}: {
  properties: Property[];
  template?: TaskTemplate;
  action: (formData: FormData) => void;
}) {
  const [freq, setFreq] = useState(template?.freq ?? "monthly");
  const [items, setItems] = useState<ChecklistItem[]>(
    template?.checklist?.length ? template.checklist : [],
  );

  const updateItem = (i: number, patch: Partial<ChecklistItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));

  const label = "text-sm font-medium";
  const input =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="checklist" value={JSON.stringify(items)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>
          ชื่องาน *
          <input name="title_th" required defaultValue={template?.title_th} className={input} />
        </label>

        <label className={label}>
          หมวดหมู่
          <input
            name="category"
            defaultValue={template?.category ?? "general"}
            className={input}
          />
        </label>

        <label className={label}>
          อาคาร
          <select
            name="property_id"
            defaultValue={template?.property_id ?? ""}
            className={input}
          >
            <option value="">ทุกอาคาร</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name_th}
              </option>
            ))}
          </select>
        </label>

        <label className={label}>
          ผู้รับผิดชอบ (ตามบทบาท)
          <select
            name="assignee_role"
            defaultValue={template?.assignee_role ?? ""}
            className={input}
          >
            <option value="">— ไม่ระบุ —</option>
            <option value="staff">พนักงาน</option>
            <option value="manager">ผู้จัดการ</option>
            <option value="owner">เจ้าของ</option>
          </select>
        </label>

        <label className={label}>
          ความสำคัญ
          <select name="priority" defaultValue={template?.priority ?? 2} className={input}>
            <option value={1}>สูง</option>
            <option value={2}>ปานกลาง</option>
            <option value={3}>ต่ำ</option>
          </select>
        </label>
      </div>

      {/* Recurrence */}
      <fieldset className="rounded-lg border border-gray-200 p-4">
        <legend className="px-1 text-sm font-medium">รอบเวลา</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            ความถี่
            <select
              name="freq"
              value={freq}
              onChange={(e) => setFreq(e.target.value as TaskTemplate["freq"])}
              className={input}
            >
              {FREQ_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className={label}>
            ทุก ๆ (interval)
            <input
              type="number"
              name="interval"
              min={1}
              defaultValue={template?.interval ?? 1}
              className={input}
            />
          </label>

          {freq === "weekly" && (
            <div className={`${label} sm:col-span-2`}>
              วันในสัปดาห์
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEKDAYS.map((w, idx) => (
                  <label
                    key={idx}
                    className="flex items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="byweekday"
                      value={idx}
                      defaultChecked={template?.byweekday?.includes(idx)}
                    />
                    {w}
                  </label>
                ))}
              </div>
            </div>
          )}

          {(freq === "monthly" || freq === "quarterly" || freq === "yearly") && (
            <label className={label}>
              วันที่ของเดือน (bymonthday)
              <input
                type="number"
                name="bymonthday"
                min={1}
                max={31}
                defaultValue={template?.bymonthday ?? undefined}
                placeholder="เว้นว่าง = ใช้วันที่ของ anchor"
                className={input}
              />
            </label>
          )}

          {freq === "yearly" && (
            <label className={label}>
              เดือน (1-12)
              <input
                type="number"
                name="month"
                min={1}
                max={12}
                defaultValue={template?.month ?? undefined}
                className={input}
              />
            </label>
          )}

          <label className={label}>
            วันเริ่ม (anchor)
            <input
              type="date"
              name="anchor_date"
              defaultValue={template?.anchor_date ?? new Date().toISOString().slice(0, 10)}
              className={input}
            />
          </label>

          <label className={label}>
            เวลา
            <input
              type="time"
              name="time_of_day"
              defaultValue={(template?.time_of_day ?? "09:00").slice(0, 5)}
              className={input}
            />
          </label>

          <label className={label}>
            ฐานการนับรอบ
            <select
              name="schedule_basis"
              defaultValue={template?.schedule_basis ?? "fixed"}
              className={input}
            >
              <option value="fixed">ตามปฏิทิน (fixed)</option>
              <option value="from_completion">นับจากครั้งที่ทำเสร็จ</option>
            </select>
          </label>

          <label className={label}>
            เตือนล่วงหน้า (ชั่วโมง)
            <input
              type="number"
              name="reminder_lead_hours"
              min={0}
              defaultValue={template?.reminder_lead_hours ?? 24}
              className={input}
            />
          </label>
        </div>
      </fieldset>

      {/* Checklist editor */}
      <fieldset className="rounded-lg border border-gray-200 p-4">
        <legend className="px-1 text-sm font-medium">เช็คลิสต์</legend>
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-12">
              <input
                placeholder="key"
                value={it.key}
                onChange={(e) => updateItem(i, { key: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
              />
              <input
                placeholder="ป้ายชื่อ"
                value={it.label}
                onChange={(e) => updateItem(i, { label: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm sm:col-span-4"
              />
              <select
                value={it.type}
                onChange={(e) =>
                  updateItem(i, { type: e.target.value as ChecklistItemType })
                }
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {CHECKLIST_TYPE_LABEL_TH[t]}
                  </option>
                ))}
              </select>
              <input
                placeholder="หน่วย"
                value={it.unit ?? ""}
                onChange={(e) => updateItem(i, { unit: e.target.value })}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
              />
              <label className="flex items-center gap-1 text-xs sm:col-span-1">
                <input
                  type="checkbox"
                  checked={Boolean(it.required)}
                  onChange={(e) => updateItem(i, { required: e.target.checked })}
                />
                จำเป็น
              </label>
              <button
                type="button"
                onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                className="text-sm text-red-500 sm:col-span-1"
              >
                ลบ
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems((p) => [...p, emptyItem()])}
            className="rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600"
          >
            + เพิ่มรายการ
          </button>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={template?.active ?? true} />
        เปิดใช้งานแม่แบบนี้
      </label>

      <div className="flex gap-2">
        <button className="rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white">
          บันทึกแม่แบบ
        </button>
      </div>
    </form>
  );
}
