"use client";

import { useState, useTransition } from "react";
import { generateNow } from "../actions";

export function GenerateButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState("");

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() =>
          start(async () => {
            const s = await generateNow();
            setMsg(
              `สร้างงานใหม่ ${s.created} · รีเฟรช ${s.refreshed} · เกินกำหนด ${s.overdue}`,
            );
          })
        }
        disabled={pending}
        className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "กำลังสร้าง…" : "สร้างงานตามรอบ"}
      </button>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
    </div>
  );
}
