-- HIS OPS normalized user-to-location assignments
-- Run once in Supabase SQL Editor before deploying the matching application release.
-- Existing app_users.location_id and location_ids values are preserved and backfilled.

begin;

create table if not exists public.user_location_assignments (
  tenant_id text not null,
  user_id text not null,
  location_id text not null,
  is_primary boolean not null default false,
  active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  assigned_by text,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id, location_id),
  foreign key (tenant_id, user_id)
    references public.app_users(tenant_id, id) on delete cascade,
  foreign key (tenant_id, location_id)
    references public.locations(tenant_id, id) on delete cascade,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists user_location_assignments_location_idx
  on public.user_location_assignments(tenant_id, location_id, active);

create index if not exists user_location_assignments_user_idx
  on public.user_location_assignments(tenant_id, user_id, active);

create unique index if not exists user_location_assignments_one_primary_key
  on public.user_location_assignments(tenant_id, user_id)
  where is_primary = true and active = true;

-- Backfill every valid legacy assignment. location_id is always included as the
-- home location even when an older location_ids array was incomplete.
insert into public.user_location_assignments(
  tenant_id, user_id, location_id, is_primary, active, assigned_by
)
select distinct
  source.tenant_id,
  source.user_id,
  source.location_id,
  source.location_id = source.primary_location_id,
  source.user_active,
  'Legacy assignment migration'
from (
  select
    u.tenant_id,
    u.id as user_id,
    u.location_id as primary_location_id,
    u.active as user_active,
    legacy.location_id
  from public.app_users u
  cross join lateral (
    select u.location_id
    union
    select jsonb_array_elements_text(
      case when jsonb_typeof(u.location_ids) = 'array' then u.location_ids else '[]'::jsonb end
    )
  ) legacy
) source
join public.locations l
  on l.tenant_id = source.tenant_id and l.id = source.location_id
where source.location_id is not null and btrim(source.location_id) <> ''
on conflict (tenant_id, user_id, location_id) do update set
  is_primary = excluded.is_primary,
  active = excluded.active,
  updated_at = now();

-- Keep the legacy columns synchronized while older clients are being upgraded.
create or replace function public.sync_app_user_locations_from_assignments(
  target_tenant_id text,
  target_user_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  primary_location text;
  assigned_locations jsonb;
begin
  select a.location_id
  into primary_location
  from public.user_location_assignments a
  where a.tenant_id = target_tenant_id
    and a.user_id = target_user_id
    and a.active = true
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at is null or a.ends_at > now())
  order by a.is_primary desc, a.assigned_at, a.location_id
  limit 1;

  select coalesce(jsonb_agg(a.location_id order by a.is_primary desc, a.assigned_at, a.location_id), '[]'::jsonb)
  into assigned_locations
  from public.user_location_assignments a
  where a.tenant_id = target_tenant_id
    and a.user_id = target_user_id
    and a.active = true
    and (a.starts_at is null or a.starts_at <= now())
    and (a.ends_at is null or a.ends_at > now());

  if primary_location is not null then
    update public.app_users
    set location_id = primary_location,
        location_ids = assigned_locations,
        updated_at = now()
    where tenant_id = target_tenant_id and id = target_user_id;
  end if;
end;
$$;

create or replace function public.sync_app_user_locations_assignment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sync_app_user_locations_from_assignments(old.tenant_id, old.user_id);
    return old;
  end if;

  if tg_op = 'UPDATE'
     and (old.tenant_id is distinct from new.tenant_id or old.user_id is distinct from new.user_id) then
    perform public.sync_app_user_locations_from_assignments(old.tenant_id, old.user_id);
  end if;

  perform public.sync_app_user_locations_from_assignments(new.tenant_id, new.user_id);
  return new;
end;
$$;

drop trigger if exists user_location_assignments_sync_app_user
  on public.user_location_assignments;
create trigger user_location_assignments_sync_app_user
after insert or update or delete on public.user_location_assignments
for each row execute function public.sync_app_user_locations_assignment_trigger();

alter table public.user_location_assignments enable row level security;
revoke all privileges on table public.user_location_assignments from anon, authenticated;

commit;

-- Verification:
-- select u.name, u.location_id as home_location, a.location_id, a.is_primary
-- from public.app_users u
-- join public.user_location_assignments a
--   on a.tenant_id = u.tenant_id and a.user_id = u.id and a.active = true
-- order by u.name, a.is_primary desc, a.location_id;
