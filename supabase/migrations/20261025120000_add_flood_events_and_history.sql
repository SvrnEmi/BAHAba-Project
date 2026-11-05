-- Phase 2: Baha History map.
-- flood_events names a time window (e.g. "Typhoon Obet"). Reports belong to an
-- event when their timestamp falls inside it; reports themselves are unchanged.
-- flood_history() is the only way the map reads reports: it returns approved
-- reports with location, water level, date and photo, and never the reporter's
-- name, phone, user id, device hash, IP hash, description or landmark.

create table public.flood_events (
  id bigint generated always as identity primary key,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint flood_events_window check (end_at > start_at)
);

create index flood_events_start_at_idx on public.flood_events (start_at desc);

alter table public.flood_events enable row level security;

-- Every signed-in user may pick an event on the map.
create policy flood_events_select_authenticated on public.flood_events
  for select to authenticated using (true);

-- Only MDRRMO creates, edits or removes events.
create policy flood_events_insert_mdrrmo on public.flood_events
  for insert to authenticated with check (public.is_mdrrmo());
create policy flood_events_update_mdrrmo on public.flood_events
  for update to authenticated using (public.is_mdrrmo()) with check (public.is_mdrrmo());
create policy flood_events_delete_mdrrmo on public.flood_events
  for delete to authenticated using (public.is_mdrrmo());

revoke all on public.flood_events from anon;

-- created_by is always the caller and never changes; updated_at is stamped.
create or replace function public.flood_events_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end;
$$;

create trigger flood_events_guard
  before insert or update on public.flood_events
  for each row execute function public.flood_events_guard();

-- Every change is written to audit_logs, so it cannot be skipped by a client.
create or replace function public.flood_events_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text;
  row_data public.flood_events := coalesce(new, old);
begin
  select coalesce(nullif(btrim(p.name), ''), 'MDRRMO') into actor
  from public.profiles p where p.id = auth.uid();

  insert into public.audit_logs (action, user_name, timestamp, details)
  values (
    'FLOOD_EVENT: ' || lower(tg_op),
    coalesce(actor, 'System'),
    now(),
    format('%s (%s to %s)', row_data.name, row_data.start_at, row_data.end_at)
  );
  return null;
end;
$$;

create trigger flood_events_audit
  after insert or update or delete on public.flood_events
  for each row execute function public.flood_events_audit();

-- Map data. Pass an event id to limit to its window, or null for all.
create or replace function public.flood_history(p_event_id bigint default null)
returns table (
  source text,
  report_id bigint,
  water_level text,
  lat double precision,
  lng double precision,
  reported_at timestamptz,
  barangay text,
  photo_bucket text,
  photo_path text
)
language sql
stable
security definer
set search_path = public
as $$
  with ev as (
    select e.start_at, e.end_at from public.flood_events e where e.id = p_event_id
  )
  select * from (
    select
      'community'::text,
      r.id,
      r.water_level,
      r.lat,
      r.lng,
      r.timestamp,
      r.barangay,
      -- Only uploaded photos (public URLs); some app rows hold a phone path.
      case when r.photo_path like 'http%' then 'report-photos' end,
      case when r.photo_path like 'http%' then r.photo_path end
    from public.community_reports r
    where r.status = 'approved'
      and r.lat is not null and r.lng is not null
      and (p_event_id is null
        or exists (select 1 from ev where r.timestamp between ev.start_at and ev.end_at))
    union all
    select
      'quick'::text,
      q.id,
      q.water_level,
      q.lat,
      q.lng,
      q.created_at,
      q.barangay,
      case when q.photo_path is not null then 'quick-report-photos' end,
      q.photo_path
    from public.quick_reports q
    where q.status = 'approved'
      and coalesce(q.flagged_false, false) = false
      and q.lat is not null and q.lng is not null
      and (p_event_id is null
        or exists (select 1 from ev where q.created_at between ev.start_at and ev.end_at))
  ) h (source, report_id, water_level, lat, lng, reported_at, barangay, photo_bucket, photo_path)
  where auth.uid() is not null
  order by reported_at desc
  limit 2000;
$$;

revoke all on function public.flood_history(bigint) from public, anon;
grant execute on function public.flood_history(bigint) to authenticated;

-- Photos of approved quick reports may be viewed by signed-in users (as
-- signed URLs) so they can appear on the history map. Pending, rejected and
-- flagged reports stay private to MDRRMO and the barangay.
create policy quick_report_photos_select_history on storage.objects
  for select to authenticated
  using (
    bucket_id = 'quick-report-photos'
    and exists (
      select 1 from public.quick_reports q
      where q.photo_path = objects.name
        and q.status = 'approved'
        and coalesce(q.flagged_false, false) = false
    )
  );
