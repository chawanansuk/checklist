# PropOps — ระบบเช็คลิสต์งานอสังหาฯ (เฟส 1)

เว็บแอป mobile-first สำหรับบริหารงานวนซ้ำของพอร์ตอสังหาฯ (บริษัท ม.ทวีทอง จำกัด)
ตอบ 3 คำถามตลอดเวลา: **มีอะไรต้องทำ / ทำหรือยัง / ทำเมื่อไหร่**

> **เฟส 1 (เวอร์ชันนี้) — ยังไม่ต่อ LINE**
> ครอบคลุมงานทั้งหมดที่ไม่ต้องพึ่ง LINE ได้แก่ login เจ้าของ/ผู้จัดการ,
> จัดการแม่แบบงาน + รอบเวลา + เช็คลิสต์, จัดการอาคาร/พนักงาน,
> สร้างงานตามรอบอัตโนมัติ, กรอกเช็คลิสต์ผ่านเว็บ (ติ๊ก/กรอกค่า/แนบรูป),
> และ Dashboard ไฟจราจร
> โครงสร้างเตรียมไว้ให้ต่อ LINE (push/webhook/LIFF/reminder/digest) ในเฟส 2
> ได้ทันทีโดยไม่ต้องรื้อ — จุดที่ต้องเสียบเพิ่มมี `phase 2` กำกับไว้

---

## Tech stack

- **Next.js 14** (App Router) + **TypeScript strict** + **Tailwind**
- **Supabase**: Postgres + Auth (magic link) + Storage
- **date-fns / date-fns-tz** — เก็บเวลาเป็น `timestamptz` (UTC) แต่คำนวณ/แสดงเป็น **Asia/Bangkok** เสมอ
- **Vitest** — unit test ของ recurrence engine
- Deploy: Vercel (เว็บ) + Supabase (DB/Storage)

---

## เริ่มต้นใช้งานจากศูนย์

### 1) สร้างโปรเจกต์ Supabase

1. สร้างโปรเจกต์ใหม่ที่ https://supabase.com
2. ไปที่ **SQL Editor → New query** แล้ว **วางไฟล์เดียวจบ**: `supabase/setup.sql` → กด **Run**
   (ไฟล์นี้รวม schema + RLS + seed ให้แล้ว ถ้าอยากรันทีละไฟล์ก็ได้:
   `0001_init.sql` → `0002_rls.sql` → `seed.sql`)
3. ไปที่ **Project Settings → API** คัดลอกค่า:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (ความลับ ห้ามหลุดฝั่ง client)
4. ไปที่ **Authentication → URL Configuration** เพิ่ม redirect URL:
   `http://localhost:3000/auth/callback` (และ URL ของ Vercel เมื่อ deploy)

> หากใช้ Supabase CLI: `supabase db reset` จะรัน migration + seed ให้อัตโนมัติ

### 2) ตั้งค่า environment

```bash
cp .env.example .env.local
# แล้วกรอกค่า NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY
# ตั้ง CRON_SECRET เป็นสตริงสุ่มยาว ๆ (ใช้ป้องกัน endpoint สร้างงาน)
```

### 3) รันในเครื่อง

```bash
npm install
npm run dev        # http://localhost:3000
```

เปิดเว็บ → กรอกอีเมล → เปิดลิงก์ใน magic link → เข้าสู่ระบบ
**บัญชีแรกที่ล็อกอินจะได้บทบาท `owner` อัตโนมัติ** (คนถัดไปเป็น `manager`)

---

## การใช้งาน

| หน้า | ทำอะไร |
|---|---|
| **แดชบอร์ด** (`/`) | ไฟจราจร: ครบกำหนดวันนี้ / สัปดาห์นี้ / เกินกำหนด / % เสร็จตรงเวลา + งานค้างแยกตามอาคาร + ปุ่ม **สร้างงานตามรอบ** |
| **งาน** (`/tasks`) | รายการงานพร้อมตัวกรอง + เพิ่มงานเฉพาะกิจ |
| **แม่แบบงาน** (`/templates`) | สร้าง/แก้ไขแม่แบบ + ตั้งรอบเวลา (preset) + แก้เช็คลิสต์ |
| **อาคาร** (`/properties`) | เพิ่ม/ปิดใช้งานอาคาร |
| **พนักงาน** (`/staff`) | เพิ่มพนักงาน + ดูสถานะการเชื่อม LINE (เฟส 2) |
| **กรอกเช็คลิสต์** (`/task/[id]`) | ติ๊ก/กรอกค่า/แนบรูป → บันทึกร่าง หรือ ทำเสร็จ |

### การสร้างงานตามรอบ (recurrence)

- กดปุ่ม **“สร้างงานตามรอบ”** บนแดชบอร์ด หรือเรียก endpoint:
  ```bash
  curl -X POST http://localhost:3000/api/dev/run/generate \
    -H "x-cron-secret: $CRON_SECRET"
  ```
- ตรรกะ (`lib/generate.ts`):
  - **fixed** — สร้างงานล่วงหน้าในกรอบ `ceil(reminder_lead_hours/24) + 35` วัน
    (idempotent: ชน `unique(template_id, due_at)` แล้วข้าม)
  - **from_completion** — สร้าง “งานถัดไป” ก็ต่อเมื่องานก่อนหน้าถูกกด `done`
    (`due ถัดไป = completed_at + interval`) ใช้กับงานอย่างล้างแอร์
  - งานอนาคตที่ยังไม่ถูกแตะ จะรีเฟรชเนื้อหาตามแม่แบบล่าสุด
  - งานที่เลยกำหนดและยังไม่เสร็จ ถูกตั้งเป็น `overdue`
- ในเฟส 2 ตรรกะเดียวกันนี้จะย้ายไป Supabase Edge Function + pg_cron รายวัน

---

## โครงสร้างโค้ด

```
app/
  (dashboard)/          # หน้าเจ้าของ/ผู้จัดการ (ต้อง login)
    page.tsx            # แดชบอร์ดไฟจราจร
    tasks/ templates/ properties/ staff/
  task/[id]/            # หน้ากรอกเช็คลิสต์
  login/ auth/callback/ # magic link
  api/dev/run/[fn]/     # trigger สร้างงาน (guard ด้วย CRON_SECRET)
lib/
  recurrence.ts (+test) # เครื่องยนต์รอบเวลา (fixed + from_completion)
  generate.ts           # สร้าง task instances จากแม่แบบ
  status.ts             # effectiveStatus + สีไฟจราจร
  tz.ts / format.ts     # Asia/Bangkok + ภาษาไทย
  supabase/             # client / server / admin (service role)
supabase/
  migrations/ seed.sql
```

---

## ทดสอบ

```bash
npm run test    # unit test ของ recurrence (สิ้นเดือน/อธิกสุรทิน/ข้ามปี/from_completion)
npm run build   # ต้องผ่าน
npm run lint    # ต้องไม่มี error
```

Seed ใส่งานทดสอบไว้ให้ดู Dashboard ทันที: 1 งานใกล้ถึงกำหนด, 1 งานเกินกำหนด, 1 งานเสร็จแล้ว

---

## Deploy ขึ้น Vercel (คลิกเดียว)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fchawanansuk%2Fchecklist&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,SUPABASE_SERVICE_ROLE_KEY,APP_BASE_URL,CRON_SECRET&project-name=propops&repository-name=propops)

1. กดปุ่มด้านบน → login Vercel → มันจะ clone repo แล้วถาม **Environment Variables**
   กรอกให้ครบตาม `.env.example` (URL/anon/service_role/APP_BASE_URL/CRON_SECRET)
2. Deploy เสร็จได้ URL เช่น `https://propops.vercel.app`
   → กลับไปแก้ค่า `APP_BASE_URL` ให้เป็น URL นั้น แล้ว redeploy
3. เพิ่ม `https://<your-app>.vercel.app/auth/callback` ใน **Supabase → Authentication → Redirect URLs**

> ปุ่ม deploy ใช้ branch **`main`** — ให้ merge PR #1 เข้า `main` ก่อน
> หรือใน Vercel → Settings → Git ตั้ง Production Branch เป็น branch ฟีเจอร์นี้

---

## แผนเฟส 2 (ต่อ LINE)

โครงเตรียมไว้แล้ว เหลือเสียบส่วนเหล่านี้ (ดู blueprint / prompt ต้นทาง):

- LINE Messaging API (push) + LINE Login channel (LIFF idToken)
- `/api/line/webhook` — verify signature + follow/message/postback
- หน้า LIFF กรอกเช็คลิสต์สำหรับช่าง (verify idToken → service role write)
- Edge Functions `run-reminders` (เตือนก่อน/หลังกำหนด + escalation) และ
  `daily-digest` (สรุปเช้า 07:00) + pg_cron
- ตาราง `notifications` (dedup กันส่งซ้ำ) + คอลัมน์ `profiles.line_*` (มีแล้วในสคีมา)

ตำแหน่งที่ต้องเสียบเพิ่มมีคอมเมนต์ `phase 2` กำกับไว้ในโค้ดและสคีมา
