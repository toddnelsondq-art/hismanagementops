-- DQ OPS store-tablet and employee PIN login migration.
-- Run once in the Supabase SQL Editor before deploying the matching app update.

alter table public.app_users add column if not exists pin_hash text;
alter table public.app_users add column if not exists pin_salt text;
alter table public.app_users add column if not exists pin_failures integer not null default 0;
alter table public.app_users add column if not exists pin_locked_until timestamptz;
alter table public.app_users add column if not exists pin_last_used_at timestamptz;

create table if not exists public.kiosk_devices (
  tenant_id text not null default 'his-management' references public.tenants(id),
  id uuid primary key default gen_random_uuid(),
  location_id text not null references public.locations(id),
  name text not null default 'Store tablet',
  token_hash text not null,
  active boolean not null default true,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.kiosk_enrollments (
  tenant_id text not null default 'his-management' references public.tenants(id),
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  location_id text not null references public.locations(id),
  device_name text not null default 'Store tablet',
  created_by text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists kiosk_devices_tenant_id_id_key on public.kiosk_devices(tenant_id, id);
create index if not exists kiosk_devices_location_id_idx on public.kiosk_devices(tenant_id, location_id, active);
create index if not exists kiosk_enrollments_code_hash_idx on public.kiosk_enrollments(tenant_id, code_hash);
