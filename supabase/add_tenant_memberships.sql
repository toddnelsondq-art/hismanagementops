-- DQ OPS request-scoped tenant membership foundation
-- Run once in Supabase SQL Editor before onboarding a second organization.
-- Existing HIS Management profiles are preserved and backfilled automatically.

begin;

-- A Supabase Auth identity may belong to more than one organization. Uniqueness
-- therefore belongs inside a tenant, not across the entire DQ OPS installation.
alter table public.app_users drop constraint if exists app_users_auth_user_id_key;
alter table public.app_users drop constraint if exists app_users_email_key;

create unique index if not exists app_users_tenant_auth_user_key
  on public.app_users(tenant_id, auth_user_id)
  where auth_user_id is not null;

create unique index if not exists app_users_tenant_email_key
  on public.app_users(tenant_id, lower(email))
  where email is not null and btrim(email) <> '';

create table if not exists public.tenant_memberships (
  tenant_id text not null references public.tenants(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  app_user_id text not null references public.app_users(id) on delete cascade,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, auth_user_id),
  unique (tenant_id, app_user_id)
);

create index if not exists tenant_memberships_auth_user_idx
  on public.tenant_memberships(auth_user_id, active, is_default);

create unique index if not exists tenant_memberships_one_default_key
  on public.tenant_memberships(auth_user_id)
  where is_default = true and active = true;

-- Backfill every existing signed-in profile. HIS is preferred when an existing
-- identity already has access to more than one tenant.
insert into public.tenant_memberships(tenant_id, auth_user_id, app_user_id, active, is_default)
select tenant_id, auth_user_id, id, active,
  row_number() over (
    partition by auth_user_id
    order by (tenant_id = 'his-management') desc, tenant_id, id
  ) = 1
from public.app_users
where auth_user_id is not null
on conflict (tenant_id, auth_user_id) do update set
  app_user_id = excluded.app_user_id,
  active = excluded.active,
  updated_at = now();

create or replace function public.sync_tenant_membership_from_app_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and old.auth_user_id is not null
     and (old.auth_user_id is distinct from new.auth_user_id or old.tenant_id is distinct from new.tenant_id) then
    delete from public.tenant_memberships
    where tenant_id = old.tenant_id and auth_user_id = old.auth_user_id;
  end if;

  if new.auth_user_id is not null then
    insert into public.tenant_memberships(tenant_id, auth_user_id, app_user_id, active, is_default)
    values (
      new.tenant_id,
      new.auth_user_id,
      new.id,
      new.active,
      not exists (
        select 1 from public.tenant_memberships
        where auth_user_id = new.auth_user_id and active = true
      )
    )
    on conflict (tenant_id, auth_user_id) do update set
      app_user_id = excluded.app_user_id,
      active = excluded.active,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists app_users_sync_tenant_membership on public.app_users;
create trigger app_users_sync_tenant_membership
after insert or update of tenant_id, auth_user_id, active on public.app_users
for each row execute function public.sync_tenant_membership_from_app_user();

alter table public.tenant_memberships enable row level security;
revoke all on table public.tenant_memberships from anon, authenticated;

commit;

-- Verification (should return one row for each signed-in app user):
-- select tm.tenant_id, tm.auth_user_id, tm.app_user_id, tm.is_default, tm.active
-- from public.tenant_memberships tm
-- order by tm.tenant_id, tm.app_user_id;
