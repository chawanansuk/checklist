import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInstances } from "@/lib/generate";

/**
 * Manual trigger for background jobs, guarded by CRON_SECRET.
 *   POST /api/dev/run/generate   -> generate task instances
 *
 * Phase 2 adds `reminders` and `digest` (LINE), which pg_cron will call.
 * Pass the secret via `x-cron-secret` header or `?secret=` query.
 */
export async function POST(
  request: Request,
  { params }: { params: { fn: string } },
) {
  const url = new URL(request.url);
  const provided =
    request.headers.get("x-cron-secret") ?? url.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  switch (params.fn) {
    case "generate": {
      const stats = await generateInstances(createAdminClient());
      return NextResponse.json({ ok: true, stats });
    }
    case "reminders":
    case "digest":
      return NextResponse.json(
        { error: "not implemented in phase 1 (LINE)", fn: params.fn },
        { status: 501 },
      );
    default:
      return NextResponse.json({ error: "unknown fn" }, { status: 404 });
  }
}
