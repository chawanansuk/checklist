"use client";

import { useTransition } from "react";

export function ToggleActive({
  id,
  active,
  action,
}: {
  id: string;
  active: boolean;
  action: (id: string, active: boolean) => Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(() => action(id, !active))}
      disabled={pending}
      className={`rounded-md px-2 py-1 text-xs ${
        active
          ? "bg-green-100 text-green-700"
          : "bg-gray-100 text-gray-500"
      } disabled:opacity-50`}
    >
      {active ? "ใช้งาน" : "ปิดใช้งาน"}
    </button>
  );
}
