-- Optima — Supabase security. Safe to re-run.
--
-- Model: the browser talks to Supabase directly ONLY for progress-photo files
-- (Storage). Every table is read/written server-side through Prisma as the
-- table owner, which RLS does not apply to. So:
--   • Storage gets real per-user policies (users touch only "<auth.uid()>/…").
--   • Tables get RLS enabled with NO policies → the public REST API (anon /
--     authenticated keys) can't read or write them at all.

-- 1) Private bucket for progress photos (10 MB cap, images only).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Storage RLS — a signed-in user may only read, upload, replace, or delete
--    objects inside their own top-level folder, named after their auth.uid().
drop policy if exists "progress photos: owner read"   on storage.objects;
drop policy if exists "progress photos: owner upload" on storage.objects;
drop policy if exists "progress photos: owner update" on storage.objects;
drop policy if exists "progress photos: owner delete" on storage.objects;

create policy "progress photos: owner read"
  on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "progress photos: owner upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "progress photos: owner update"
  on storage.objects for update to authenticated
  using (bucket_id = 'progress-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'progress-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "progress photos: owner delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3) Tables — enable RLS with no policies: unreachable from the public API.
alter table public.users          enable row level security;
alter table public.food_logs      enable row level security;
alter table public.daily_logs     enable row level security;
alter table public.fitbit_tokens  enable row level security;
alter table public.workout_splits enable row level security;
alter table public.exercises      enable row level security;
alter table public.workout_logs   enable row level security;
alter table public.progress_photos enable row level security;
alter table public.weight_logs    enable row level security;
alter table public.achievements   enable row level security;
alter table public.xp_events      enable row level security;
alter table public.split_exercises enable row level security;
alter table public.workout_programs enable row level security;

-- 4) One-time backfill: carry each exercise's legacy split into split_exercises.
insert into public.split_exercises (id, split_id, exercise_id, sort_order)
select gen_random_uuid()::text, e.split_id, e.id, e.sort_order
from public.exercises e
where e.split_id is not null
on conflict (split_id, exercise_id) do nothing;

-- 5) One-time backfill: put each user's program-less splits into a program
--    (named after PPL when that's exactly what they have) and make it active.
insert into public.workout_programs (id, user_id, name, is_active, sort_order)
select gen_random_uuid()::text, s.user_id,
       case when array_agg(s.name order by s.name) = array['Legs', 'Pull', 'Push']
            then 'Push / Pull / Legs' else 'My Program' end,
       not exists (select 1 from public.workout_programs p where p.user_id = s.user_id and p.is_active),
       0
from public.workout_splits s
where s.program_id is null
group by s.user_id
on conflict (user_id, name) do nothing;

update public.workout_splits s
set program_id = (
  select p.id from public.workout_programs p
  where p.user_id = s.user_id
  order by p.is_active desc, p.created_at
  limit 1
)
where s.program_id is null;
