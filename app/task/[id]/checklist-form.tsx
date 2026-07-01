"use client";

import { useFormState, useFormStatus } from "react-dom";
import { CHECKLIST_TYPE_LABEL_TH } from "@/lib/format";
import type { ChecklistItem } from "@/lib/types";
import { submitChecklist, type SubmitResult } from "./actions";

function SubmitButtons() {
  const { pending } = useFormStatus();
  return (
    <div className="flex gap-2">
      <button
        type="submit"
        name="intent"
        value="save"
        disabled={pending}
        className="flex-1 rounded-lg border border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50"
      >
        บันทึกร่าง
      </button>
      <button
        type="submit"
        name="intent"
        value="complete"
        disabled={pending}
        className="flex-1 rounded-lg bg-green-600 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "กำลังบันทึก…" : "ทำเสร็จ ✓"}
      </button>
    </div>
  );
}

export function ChecklistForm({
  instanceId,
  checklist,
  result,
  note,
  existingPhotos,
  done,
}: {
  instanceId: string;
  checklist: ChecklistItem[];
  result: Record<string, unknown>;
  note: string | null;
  existingPhotos: Record<string, string[]>;
  done: boolean;
}) {
  const action = submitChecklist.bind(null, instanceId);
  const [state, formAction] = useFormState<SubmitResult, FormData>(action, {
    ok: false,
  });

  return (
    <form action={formAction} className="space-y-4">
      {checklist.length === 0 && (
        <p className="text-sm text-gray-400">งานนี้ไม่มีรายการเช็คลิสต์</p>
      )}

      {checklist.map((item) => (
        <div key={item.key} className="rounded-lg border border-gray-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium">
              {item.label}
              {item.required && <span className="ml-1 text-red-500">*</span>}
            </label>
            <span className="text-xs text-gray-400">
              {CHECKLIST_TYPE_LABEL_TH[item.type]}
            </span>
          </div>

          {item.type === "check" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`field:${item.key}`}
                defaultChecked={Boolean(result[item.key])}
                className="h-5 w-5 rounded border-gray-300"
              />
              ทำแล้ว
            </label>
          )}

          {item.type === "number" && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="any"
                name={`field:${item.key}`}
                defaultValue={
                  typeof result[item.key] === "number"
                    ? String(result[item.key])
                    : ""
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              {item.unit && (
                <span className="text-sm text-gray-500">{item.unit}</span>
              )}
            </div>
          )}

          {item.type === "text" && (
            <input
              type="text"
              name={`field:${item.key}`}
              defaultValue={
                typeof result[item.key] === "string"
                  ? (result[item.key] as string)
                  : ""
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          )}

          {item.type === "photo" && (
            <div className="space-y-2">
              {existingPhotos[item.key]?.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {existingPhotos[item.key].map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={url}
                      src={url}
                      alt=""
                      className="h-20 w-20 rounded object-cover"
                    />
                  ))}
                </div>
              )}
              <input
                type="file"
                name={`field:${item.key}`}
                accept="image/*"
                capture="environment"
                multiple
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm"
              />
            </div>
          )}
        </div>
      ))}

      <div>
        <label className="text-sm font-medium">หมายเหตุ</label>
        <textarea
          name="note"
          rows={2}
          defaultValue={note ?? ""}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      {state.error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
          บันทึกเรียบร้อยแล้ว
        </p>
      )}

      {done ? (
        <p className="rounded-lg bg-green-50 p-3 text-center text-sm text-green-700">
          งานนี้เสร็จแล้ว — แก้ไขเพิ่มเติมแล้วกด “ทำเสร็จ” เพื่อบันทึกซ้ำได้
        </p>
      ) : null}

      <SubmitButtons />
    </form>
  );
}
