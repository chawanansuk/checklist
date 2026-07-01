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
