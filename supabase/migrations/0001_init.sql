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
