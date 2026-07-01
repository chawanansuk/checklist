import { describe, expect, it } from "vitest";
import { nextDueDates, nextDueFromCompletion } from "./recurrence";
import { formatBangkok } from "./tz";
import type { TaskTemplate } from "./types";

/** Minimal template factory with sensible defaults. */
function tpl(overrides: Partial<TaskTemplate>): TaskTemplate {
  return {
    id: "t",
    property_id: null,
    category: "test",
    title_th: "test",
    description: null,
    checklist: [],
    assignee_id: null,
    assignee_role: null,
    priority: 2,
    freq: "monthly",
    interval: 1,
    byweekday: null,
    bymonthday: null,
    month: null,
    anchor_date: "2026-01-01",
    time_of_day: "09:00",
    schedule_basis: "fixed",
    reminder_lead_hours: 24,
    overdue_escalation_hours: 24,
    requires_photo: false,
    active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Bangkok "yyyy-MM-dd HH:mm" for readable assertions. */
function bkk(d: Date): string {
  return formatBangkok(d, "yyyy-MM-dd HH:mm");
}

describe("nextDueDates — fixed", () => {
  it("monthly on a fixed day of month", () => {
    const t = tpl({ freq: "monthly", bymonthday: 25, time_of_day: "09:00" });
    const out = nextDueDates(t, new Date("2026-01-10T00:00:00Z"), 90);
    const days = out.map(bkk);
    expect(days).toContain("2026-01-25 09:00");
    expect(days).toContain("2026-02-25 09:00");
    expect(days).toContain("2026-03-25 09:00");
  });

  it("clamps to last day of month when the target day does not exist (Feb 31 -> Feb 28)", () => {
    const t = tpl({ freq: "monthly", bymonthday: 31, anchor_date: "2026-01-31" });
    const out = nextDueDates(t, new Date("2026-02-01T00:00:00Z"), 30).map(bkk);
    // 2026 is not a leap year -> Feb 28
    expect(out).toContain("2026-02-28 09:00");
  });

  it("handles leap-year Feb 29", () => {
    const t = tpl({ freq: "monthly", bymonthday: 29, anchor_date: "2024-01-29" });
    const out = nextDueDates(t, new Date("2024-02-01T00:00:00Z"), 30).map(bkk);
    expect(out).toContain("2024-02-29 09:00");
  });

  it("weekly on Monday", () => {
    // 0 = Monday in app convention
    const t = tpl({ freq: "weekly", byweekday: [0], anchor_date: "2026-01-05" });
    const out = nextDueDates(t, new Date("2026-01-01T00:00:00Z"), 21).map(bkk);
    // Mondays: Jan 5, 12, 19
    expect(out).toContain("2026-01-05 09:00");
    expect(out).toContain("2026-01-12 09:00");
    expect(out).toContain("2026-01-19 09:00");
    // No Tuesday
    expect(out.some((d) => d.startsWith("2026-01-06"))).toBe(false);
  });

  it("weekly with interval 2 respects week alignment", () => {
    const t = tpl({
      freq: "weekly",
      interval: 2,
      byweekday: [0],
      anchor_date: "2026-01-05",
    });
    const out = nextDueDates(t, new Date("2026-01-05T00:00:00Z"), 28).map(bkk);
    expect(out).toContain("2026-01-05 09:00");
    expect(out).toContain("2026-01-19 09:00");
    expect(out.some((d) => d.startsWith("2026-01-12"))).toBe(false);
  });

  it("yearly in a specific month, crossing the year boundary", () => {
    const t = tpl({
      freq: "yearly",
      month: 2,
      bymonthday: 15,
      anchor_date: "2026-02-15",
    });
    const out = nextDueDates(t, new Date("2026-12-01T00:00:00Z"), 120).map(bkk);
    expect(out).toContain("2027-02-15 09:00");
  });

  it("quarterly = monthly every 3 months", () => {
    const t = tpl({
      freq: "quarterly",
      bymonthday: 1,
      anchor_date: "2026-01-01",
    });
    const out = nextDueDates(t, new Date("2026-01-01T00:00:00Z"), 200).map(bkk);
    expect(out).toContain("2026-01-01 09:00");
    expect(out).toContain("2026-04-01 09:00");
    expect(out).toContain("2026-07-01 09:00");
    expect(out.some((d) => d.startsWith("2026-02"))).toBe(false);
  });

  it("once returns exactly one occurrence", () => {
    const t = tpl({ freq: "once", anchor_date: "2026-03-10" });
    const out = nextDueDates(t, new Date("2026-01-01T00:00:00Z"), 365).map(bkk);
    expect(out).toEqual(["2026-03-10 09:00"]);
  });

  it("from_completion templates are not generated ahead of time", () => {
    const t = tpl({ freq: "monthly", schedule_basis: "from_completion" });
    expect(nextDueDates(t, new Date("2026-01-01T00:00:00Z"), 90)).toEqual([]);
  });

  it("stores due at the Bangkok time_of_day (UTC is 7h earlier)", () => {
    const t = tpl({ freq: "once", anchor_date: "2026-06-30", time_of_day: "09:00" });
    const out = nextDueDates(t, new Date("2026-06-01T00:00:00Z"), 60);
    // 09:00 Bangkok == 02:00 UTC
    expect(out[0].toISOString()).toBe("2026-06-30T02:00:00.000Z");
  });
});

describe("nextDueFromCompletion", () => {
  it("adds N months for monthly (A/C cleaning every 4 months)", () => {
    const t = tpl({ freq: "monthly", interval: 4, time_of_day: "09:00" });
    const next = nextDueFromCompletion(t, new Date("2026-06-30T10:00:00Z"));
    // 30 Jun Bangkok + 4 months = 30 Oct
    expect(bkk(next)).toBe("2026-10-30 09:00");
  });

  it("clamps day when the resulting month is shorter", () => {
    const t = tpl({ freq: "monthly", interval: 1 });
    const next = nextDueFromCompletion(t, new Date("2026-01-31T05:00:00Z"));
    expect(bkk(next)).toBe("2026-02-28 09:00");
  });

  it("adds weeks for weekly", () => {
    const t = tpl({ freq: "weekly", interval: 1 });
    const next = nextDueFromCompletion(t, new Date("2026-01-01T05:00:00Z"));
    expect(bkk(next)).toBe("2026-01-08 09:00");
  });

  it("crosses the year boundary for yearly", () => {
    const t = tpl({ freq: "yearly", interval: 1 });
    const next = nextDueFromCompletion(t, new Date("2026-11-15T05:00:00Z"));
    expect(bkk(next)).toBe("2027-11-15 09:00");
  });
});
