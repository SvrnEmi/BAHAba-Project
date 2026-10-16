create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  phone text,
  role text not null default 'resident'
    check (role in ('resident', 'barangay', 'mdrrmo')),
  barangay text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barangays (
  id bigserial primary key,
  name text not null unique,
  flood_risk text not null default 'low'
    check (flood_risk in ('low', 'medium', 'high')),
  last_update timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null
);

create table if not exists public.alerts (
  id bigserial primary key,
  level text not null default 'advisory'
    check (level in ('advisory', 'warning', 'critical')),
  title text not null,
  message text not null,
  target_barangay text not null default 'All Barangays',
  channels text not null default 'push',
  sent_at timestamptz not null default now(),
  recipients integer not null default 0,
  created_by text not null default 'system',
  status text not null default 'approved'
    check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  source text not null default 'mdrrmo'
);

create table if not exists public.community_reports (
  id bigserial primary key,
  user_name text not null,
  location text not null,
  lat double precision,
  lng double precision,
  water_level text not null default 'ankle'
    check (water_level in ('ankle', 'knee', 'waist', 'chest', 'overhead')),
  description text not null,
  photo_path text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  timestamp timestamptz not null default now(),
  rejection_reason text
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  action text not null,
  user_name text not null,
  timestamp timestamptz not null default now(),
  details text not null
);

create index if not exists idx_alerts_status on public.alerts(status, sent_at desc);
create index if not exists idx_reports_status on public.community_reports(status, timestamp desc);
create index if not exists idx_profiles_role on public.profiles(role);

alter table public.community_reports
  alter column status set default 'pending';
update public.community_reports
set status = 'approved'
where status = 'verified';
alter table public.community_reports
  drop constraint if exists community_reports_status_check;
alter table public.community_reports
  add constraint community_reports_status_check
  check (status in ('pending', 'approved', 'rejected'));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('report-photos', 'report-photos', true)
on conflict (id) do nothing;

alter table public.profiles enable row level security;
alter table public.barangays enable row level security;
alter table public.alerts enable row level security;
alter table public.community_reports enable row level security;
alter table public.audit_logs enable row level security;

-- Required for resident flood-risk StreamBuilder updates.
do $$
begin
  alter publication supabase_realtime add table public.barangays;
exception
  when duplicate_object then null;
end;
$$;

drop policy if exists "profiles_select_own_or_authenticated" on public.profiles;
create policy "profiles_select_own_or_authenticated"
on public.profiles
for select
using (auth.uid() = id or auth.role() = 'authenticated');

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "barangays_read_authenticated" on public.barangays;
create policy "barangays_read_authenticated"
on public.barangays
for select
using (auth.role() = 'authenticated');

drop policy if exists "barangays_manage_mdrrmo" on public.barangays;
create policy "barangays_manage_mdrrmo"
on public.barangays
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'mdrrmo'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'mdrrmo'
  )
);

drop policy if exists "alerts_public_read_approved" on public.alerts;
create policy "alerts_public_read_approved"
on public.alerts
for select
using (status = 'approved');

drop policy if exists "alerts_manage_mdrrmo" on public.alerts;
create policy "alerts_manage_mdrrmo"
on public.alerts
for all
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'mdrrmo'
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'mdrrmo'
  )
);

drop policy if exists "reports_select_authenticated" on public.community_reports;
drop policy if exists "reports_select_approved_or_own_or_mdrrmo" on public.community_reports;
  create policy "reports_select_approved_or_own_or_mdrrmo"
on public.community_reports
for select
  using (
    auth.role() = 'authenticated' and (
      status = 'approved'
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role = 'mdrrmo'
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.name = user_name
      )
    )
  );

drop policy if exists "reports_insert_own" on public.community_reports;
create policy "reports_insert_own"
on public.community_reports
for insert
with check (auth.role() = 'authenticated');

drop policy if exists "reports_update_admin_or_owner" on public.community_reports;
create policy "reports_update_admin_or_owner"
on public.community_reports
for update
using (
  auth.role() = 'authenticated' and (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('mdrrmo', 'barangay')
    )
    or auth.uid()::text = user_name
  )
)
with check (
  auth.role() = 'authenticated' and (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('mdrrmo', 'barangay')
    )
    or auth.uid()::text = user_name
  )
);

drop policy if exists "reports_delete_admin_or_owner" on public.community_reports;
create policy "reports_delete_admin_or_owner"
on public.community_reports
for delete
using (
  auth.role() = 'authenticated' and (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('mdrrmo', 'barangay')
    )
    or auth.uid()::text = user_name
  )
);

drop policy if exists "audit_select_admin_only" on public.audit_logs;
create policy "audit_select_admin_only"
on public.audit_logs
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'mdrrmo'
  )
);

drop policy if exists "audit_insert_admin_only" on public.audit_logs;
create policy "audit_insert_admin_only"
on public.audit_logs
for insert
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'mdrrmo'
  )
);

drop policy if exists "report_photos_public_read" on storage.objects;
create policy "report_photos_public_read"
on storage.objects
for select
using (bucket_id = 'report-photos');

drop policy if exists "report_photos_insert_authenticated" on storage.objects;
create policy "report_photos_insert_authenticated"
on storage.objects
for insert
with check (
  bucket_id = 'report-photos'
  and auth.role() = 'authenticated'
);

drop policy if exists "report_photos_update_authenticated" on storage.objects;
create policy "report_photos_update_authenticated"
on storage.objects
for update
using (
  bucket_id = 'report-photos'
  and auth.role() = 'authenticated'
)
with check (
  bucket_id = 'report-photos'
  and auth.role() = 'authenticated'
);

drop policy if exists "report_photos_delete_authenticated" on storage.objects;
create policy "report_photos_delete_authenticated"
on storage.objects
for delete
using (
  bucket_id = 'report-photos'
  and auth.role() = 'authenticated'
);

insert into public.barangays (name, flood_risk, last_update, lat, lng)
values
  ('Tuburan', 'high', now(), 12.4018, 122.0234),
  ('Poctoy', 'medium', now(), 12.3890, 122.0110),
  ('Gabawan', 'low', now(), 12.3800, 122.0300),
  ('Batiano', 'medium', now(), 12.4200, 122.0400),
  ('Panique', 'low', now(), 12.4100, 122.0050),
  ('Libertad', 'high', now(), 12.4300, 122.0150),
  ('Canjalon', 'medium', now(), 12.3950, 122.0350),
  ('Liwayway', 'low', now(), 12.4050, 122.0450),
  ('Pit-os', 'medium', now(), 12.3850, 122.0220)
on conflict (name) do nothing;
