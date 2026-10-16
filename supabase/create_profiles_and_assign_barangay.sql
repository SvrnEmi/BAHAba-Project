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

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

insert into public.profiles (id, name, email, role)
select
  id,
  coalesce(nullif(raw_user_meta_data ->> 'name', ''), email),
  email,
  'barangay'
from auth.users
where lower(email) = lower('bombaclatrasclat03@gmail.com')
on conflict (id) do update
set role = 'barangay',
    email = excluded.email,
    updated_at = now();

update public.profiles
set role = 'barangay',
    updated_at = now()
where lower(email) = lower('bombaclatrasclat03@gmail.com');

select email, role
from public.profiles
where lower(email) = lower('bombaclatrasclat03@gmail.com');
