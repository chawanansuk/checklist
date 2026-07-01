/** Thai-language date/label formatting helpers. */
import { toBangkok } from "./tz";

const TH_WEEKDAY_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const TH_MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

/** e.g. "จ. 30 มิ.ย. 2568 09:00" (Buddhist year). */
export function formatThaiDateTime(instant: Date): string {
  const d = toBangkok(instant);
  const wd = TH_WEEKDAY_SHORT[d.getDay()];
  const mon = TH_MONTH_SHORT[d.getMonth()];
  const be = d.getFullYear() + 543;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${wd} ${d.getDate()} ${mon} ${be} ${hh}:${mm}`;
}

/** e.g. "30 มิ.ย. 2568". */
export function formatThaiDate(instant: Date): string {
  const d = toBangkok(instant);
  const mon = TH_MONTH_SHORT[d.getMonth()];
  const be = d.getFullYear() + 543;
  return `${d.getDate()} ${mon} ${be}`;
}

export const FREQ_LABEL_TH: Record<string, string> = {
  once: "ครั้งเดียว",
  daily: "รายวัน",
  weekly: "รายสัปดาห์",
  monthly: "รายเดือน",
  quarterly: "ราย 3 เดือน",
  yearly: "รายปี",
};

export const STATUS_LABEL_TH: Record<string, string> = {
  todo: "รอทำ",
  in_progress: "กำลังทำ",
  done: "เสร็จแล้ว",
  overdue: "เกินกำหนด",
  skipped: "ข้าม",
};

export const ROLE_LABEL_TH: Record<string, string> = {
  owner: "เจ้าของ",
  manager: "ผู้จัดการ",
  staff: "พนักงาน",
};

export const CHECKLIST_TYPE_LABEL_TH: Record<string, string> = {
  check: "ติ๊กถูก",
  number: "กรอกตัวเลข",
  text: "กรอกข้อความ",
  photo: "แนบรูป",
};
