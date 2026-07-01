-- PropOps — one-shot setup for Supabase Cloud.
-- Paste this whole file into Supabase SQL Editor and Run once.
-- (Combines migrations 0001, 0002, and seed in order.)

-- ============================================================
-- 0001_init.sql
-- ============================================================
-- PropOps — Phase 1 schema (no LINE integration yet).
-- Times are stored as timestamptz (UTC); the app computes/displays Asia/Bangkok.

create extension if not exists pgcrypto;

create type user_role      as enum ('owner', 'manager', 'staff');
create type task_status    as enum ('todo', 'in_progress', 'done', 'overdue', 'skipped');
create type recur_freq     as enum ('once', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly');
create type schedule_basis as enum ('fixed', 'from_completion');

-- People. Owner/manager sign in via Supabase Auth (magic link).
-- Staff rows can exist without an auth user (assignment targets); staff web/LINE
-- access is a phase-2 concern. The line_* columns are kept for forward-compat.
create table profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  full_name text not null,
  role user_role not null default 'staff',
  line_user_id text unique,               -- phase 2
  line_is_friend boolean not null default false,  -- phase 2
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table properties (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name_th text not null,
  area text,
  line_group_id text,                     -- phase 2
  active boolean not null default true
);

create table task_templates (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete set null,  -- null = all properties
  category text not null,
  title_th text not null,
  description text,
  checklist jsonb not null default '[]',  -- [{key,label,type:'check'|'number'|'text'|'photo',required,unit?}]
  assignee_id uuid references profiles(id) on delete set null,
  assignee_role user_role,
  priority int not null default 2,        -- 1 high .. 3 low
  freq recur_freq not null,
  interval int not null default 1,
  byweekday int[],                        -- 0=Mon .. 6=Sun
  bymonthday int,
  month int,
  anchor_date date not null default current_date,
  time_of_day time not null default '09:00',
  schedule_basis schedule_basis not null default 'fixed',
  reminder_lead_hours int not null default 24,
  overdue_escalation_hours int not null default 24,
  requires_photo boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table task_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references task_templates(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  title_th text not null,
  category text not null,
  checklist jsonb not null default '[]',  -- snapshot of the template checklist
  assignee_id uuid references profiles(id) on delete set null,
  claimed_by uuid references profiles(id) on delete set null,
  priority int not null default 2,
  schedule_basis schedule_basis not null default 'fixed',
  due_at timestamptz not null,
  status task_status not null default 'todo',
  result jsonb not null default '{}',
  note text,
  completed_at timestamptz,
  completed_by uuid references profiles(id) on delete set null,
  reminded_at timestamptz,                -- phase 2
  created_at timestamptz not null default now(),
  unique (template_id, due_at)            -- idempotent generation guard
);
create index on task_instances (due_at);
create index on task_instances (status);
create index on task_instances (assignee_id);
create index on task_instances (property_id);

create table task_photos (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references task_instances(id) on delete cascade,
  url text not null,
  storage_path text,
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on task_photos (instance_id);

-- Storage bucket for task photos (private; access via signed URLs).
insert into storage.buckets (id, name, public)
values ('task-photos', 'task-photos', false)
on conflict (id) do nothing;

-- ============================================================
-- 0002_rls.sql
-- ============================================================
-- Row Level Security.
--
-- Phase 1 model:
--   * Owner/manager sign in with Supabase Auth (magic link) => role 'authenticated'.
--     They can read/write all operational tables (internal team tool).
--   * anon (not signed in) is denied everywhere.
--   * Trusted server routes (task generation, photo upload) use the service-role
--     key, which bypasses RLS entirely.
--
-- Per-property scoping for managers can be layered on later without a rewrite.

alter table profiles       enable row level security;
alter table properties     enable row level security;
alter table task_templates enable row level security;
alter table task_instances enable row level security;
alter table task_photos    enable row level security;

-- Helper: one policy per table granting full access to authenticated users.
create policy "authenticated all" on profiles
  for all to authenticated using (true) with check (true);

create policy "authenticated all" on properties
  for all to authenticated using (true) with check (true);

create policy "authenticated all" on task_templates
  for all to authenticated using (true) with check (true);

create policy "authenticated all" on task_instances
  for all to authenticated using (true) with check (true);

create policy "authenticated all" on task_photos
  for all to authenticated using (true) with check (true);

-- No policies are defined for the anon role, so anon reads/writes are rejected.

-- ============================================================
-- seed.sql
-- ============================================================
-- PropOps seed data. Safe to run multiple times (idempotent on natural keys).

-- ---------- Properties ----------
insert into properties (code, name_th, area) values
  ('MTG',  'Meethong Residence', null),
  ('MT48', 'Maytree 48',         null),
  ('HOH',  'House of Happiness',  null),
  ('MM',   'มั่งมี',              null),
  ('MS',   'มีทรัพย์',            null),
  ('KL',   'KL',                  null),
  ('G48',  'G48',                 null)
on conflict (code) do nothing;

-- ---------- Staff (no auth user; assignment targets) ----------
insert into profiles (full_name, role) values
  ('ช่างประจำ',   'staff'),
  ('แม่บ้าน',     'staff'),
  ('ออฟฟิศ',      'staff')
on conflict do nothing;

-- ---------- Task templates (1–10 from the blueprint) ----------
-- 1. Meter reading — MT48 & MTG — monthly on the 25th — fixed — requires photo
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq, bymonthday, requires_photo, time_of_day, reminder_lead_hours)
select id, 'meter', 'จดมิเตอร์ไฟ/น้ำ',
  '[{"key":"kwh","label":"เลขมิเตอร์ไฟ","type":"number","required":true,"unit":"kWh"},
    {"key":"water","label":"เลขมิเตอร์น้ำ","type":"number","required":true,"unit":"m³"},
    {"key":"photo","label":"รูปหน้าปัดมิเตอร์","type":"photo","required":true}]'::jsonb,
  'staff', 'monthly', 25, true, '09:00', 48
from properties where code in ('MT48', 'MTG');

-- 2. A/C cleaning — all properties — every 4 months — from_completion
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq, interval, schedule_basis, requires_photo)
values
  (null, 'maintenance', 'ล้างแอร์',
   '[{"key":"coil","label":"ล้างคอยล์","type":"check","required":true},
     {"key":"filter","label":"ล้างฟิลเตอร์","type":"check","required":true},
     {"key":"before","label":"รูปก่อน","type":"photo","required":true},
     {"key":"after","label":"รูปหลัง","type":"photo","required":true}]'::jsonb,
   'staff', 'monthly', 4, 'from_completion', true);

-- 3. Billing / rent collection — all — monthly on the 1st — fixed
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq, bymonthday)
values
  (null, 'finance', 'แจ้งบิล/เก็บค่าเช่า',
   '[{"key":"issue","label":"ออกบิล","type":"check","required":true},
     {"key":"send","label":"ส่งบิล","type":"check","required":true},
     {"key":"collect","label":"ตามเก็บ","type":"check"}]'::jsonb,
   'staff', 'monthly', 1);

-- 4. Water pump / tank inspection — all — monthly — fixed
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq)
values
  (null, 'inspection', 'ตรวจปั๊มน้ำ/ถังเก็บน้ำ',
   '[{"key":"sound","label":"เสียงปั๊ม","type":"check"},
     {"key":"pressure","label":"แรงดัน","type":"check"},
     {"key":"level","label":"ระดับน้ำ","type":"check"}]'::jsonb,
   'staff', 'monthly');

-- 5. Fire extinguisher / emergency lighting — all — yearly — fixed
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq)
values
  (null, 'safety', 'ตรวจถังดับเพลิง/ไฟฉุกเฉิน',
   '[{"key":"gauge","label":"เกจแรงดัน","type":"check"},
     {"key":"expiry","label":"วันหมดอายุ","type":"text"},
     {"key":"exit","label":"ไฟส่องทางออก","type":"check"}]'::jsonb,
   'staff', 'yearly');

-- 6. Land & building tax — company level — yearly in February — 30-day lead
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq, month, reminder_lead_hours)
values
  (null, 'tax', 'ภาษีที่ดินและสิ่งปลูกสร้าง',
   '[{"key":"receive","label":"รับใบประเมิน","type":"check"},
     {"key":"appeal","label":"ทักท้วง (ถ้ามี)","type":"check"},
     {"key":"pay","label":"ชำระ","type":"check"}]'::jsonb,
   'owner', 'yearly', 2, 720);

-- 7. Building insurance renewal — all — yearly — fixed
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq)
values
  (null, 'finance', 'ต่อประกันอาคาร',
   '[{"key":"expiry","label":"เช็ควันหมดอายุ","type":"check"},
     {"key":"quote","label":"ขอใบเสนอราคา","type":"check"},
     {"key":"renew","label":"ต่ออายุ","type":"check"}]'::jsonb,
   'staff', 'yearly');

-- 8. Common-area cleaning — all — weekly (Monday) — fixed
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq, byweekday)
values
  (null, 'cleaning', 'ทำความสะอาดส่วนกลาง',
   '[{"key":"lobby","label":"โถง","type":"check"},
     {"key":"stairs","label":"บันได","type":"check"},
     {"key":"lift","label":"ลิฟต์","type":"check"},
     {"key":"trash","label":"ขยะ","type":"check"}]'::jsonb,
   'staff', 'weekly', '{0}');

-- 9. Room check + amenities — HOH — weekly — fixed
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq, requires_photo)
select id, 'housekeeping', 'ตรวจห้อง+เติม amenities',
  '[{"key":"condition","label":"สภาพห้อง","type":"check"},
    {"key":"amenities","label":"ของใช้","type":"check"},
    {"key":"photo","label":"รูปห้อง","type":"photo","required":true}]'::jsonb,
  'staff', 'weekly', true
from properties where code = 'HOH';

-- 10. Reviews & pricing on Booking.com — HOH — weekly — fixed
insert into task_templates
  (property_id, category, title_th, checklist, assignee_role, freq)
select id, 'ops', 'เช็ครีวิว+ราคา Booking.com',
  '[{"key":"reviews","label":"ตอบรีวิว","type":"check"},
    {"key":"pricing","label":"เทียบราคาคู่แข่ง","type":"text"}]'::jsonb,
  'staff', 'weekly'
from properties where code = 'HOH';

-- ---------- Test task instances (for demoing the dashboard) ----------
-- Ad-hoc rows: template_id is null, so the unique(template_id,due_at) guard
-- does not block them and re-running seed just adds more (fine for a demo DB).
insert into task_instances (property_id, title_th, category, due_at, status, checklist)
select id, '[ทดสอบ] งานใกล้ถึงกำหนด', 'test', now() + interval '5 minutes', 'todo',
  '[{"key":"ok","label":"ทำเสร็จ","type":"check"}]'::jsonb
from properties where code = 'MTG';

insert into task_instances (property_id, title_th, category, due_at, status, checklist)
select id, '[ทดสอบ] งานเกินกำหนด', 'test', now() - interval '1 day', 'overdue',
  '[{"key":"ok","label":"ทำเสร็จ","type":"check"}]'::jsonb
from properties where code = 'MT48';

insert into task_instances (property_id, title_th, category, due_at, status, completed_at, checklist)
select id, '[ทดสอบ] งานเสร็จแล้ว', 'test', now() - interval '2 hours', 'done', now() - interval '3 hours',
  '[{"key":"ok","label":"ทำเสร็จ","type":"check"}]'::jsonb
from properties where code = 'HOH';
