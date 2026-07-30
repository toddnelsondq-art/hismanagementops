-- HIS Management Group Operations Hub
-- Run this in Supabase SQL Editor before deploying the Netlify version.

create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id text primary key,
  name text not null,
  app_name text not null default 'Operations Hub',
  subtitle text not null default 'Daily operations',
  logo_url text not null default 'assets/his-management.png',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.locations (
  tenant_id text not null default 'his-management' references public.tenants(id),
  id text primary key,
  name text not null,
  address text not null default '',
  phone text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  tenant_id text not null default 'his-management' references public.tenants(id),
  id text primary key,
  auth_user_id uuid unique,
  email text unique,
  phone text,
  name text not null,
  role text not null default 'Employee',
  location_id text not null default 'store-01' references public.locations(id),
  location_ids jsonb not null default '["store-01"]'::jsonb,
  active boolean not null default true,
  invited_by text,
  invited_at timestamptz,
  accepted_at timestamptz,
  pin_hash text,
  pin_salt text,
  pin_failures integer not null default 0,
  pin_locked_until timestamptz,
  pin_last_used_at timestamptz,
  updated_at timestamptz not null default now()
);

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

create table if not exists public.invites (
  tenant_id text not null default 'his-management' references public.tenants(id),
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  role text not null,
  location_id text not null references public.locations(id),
  location_ids jsonb not null default '[]'::jsonb,
  invited_by text,
  accepted_by uuid,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table if not exists public.days (
  tenant_id text not null default 'his-management' references public.tenants(id),
  location_id text not null references public.locations(id),
  date text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (location_id, date)
);

create table if not exists public.maintenance_data (
  tenant_id text not null default 'his-management' references public.tenants(id),
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.tenants(id, name, app_name, subtitle, logo_url)
values ('his-management', 'HIS Management Group Inc', 'HIS OPS', 'Daily operations', 'assets/his-management.png')
on conflict (id) do update set
  name = excluded.name,
  app_name = excluded.app_name,
  subtitle = excluded.subtitle,
  logo_url = excluded.logo_url,
  updated_at = now();

alter table public.locations add column if not exists tenant_id text not null default 'his-management';
alter table public.app_users add column if not exists tenant_id text not null default 'his-management';
alter table public.app_users add column if not exists pin_hash text;
alter table public.app_users add column if not exists pin_salt text;
alter table public.app_users add column if not exists pin_failures integer not null default 0;
alter table public.app_users add column if not exists pin_locked_until timestamptz;
alter table public.app_users add column if not exists pin_last_used_at timestamptz;
alter table public.invites add column if not exists tenant_id text not null default 'his-management';
alter table public.days add column if not exists tenant_id text not null default 'his-management';
alter table public.maintenance_data add column if not exists tenant_id text not null default 'his-management';

alter table public.days drop constraint if exists days_pkey;
alter table public.days add primary key (tenant_id, location_id, date);

alter table public.maintenance_data drop constraint if exists maintenance_data_pkey;
alter table public.maintenance_data add primary key (tenant_id, key);

create unique index if not exists locations_tenant_id_id_key on public.locations(tenant_id, id);
create unique index if not exists app_users_tenant_id_id_key on public.app_users(tenant_id, id);
create unique index if not exists kiosk_devices_tenant_id_id_key on public.kiosk_devices(tenant_id, id);
create index if not exists kiosk_devices_location_id_idx on public.kiosk_devices(tenant_id, location_id, active);
create index if not exists kiosk_enrollments_code_hash_idx on public.kiosk_enrollments(tenant_id, code_hash);
create unique index if not exists days_tenant_id_location_id_date_key on public.days(tenant_id, location_id, date);
create unique index if not exists maintenance_data_tenant_id_key_key on public.maintenance_data(tenant_id, key);

insert into public.locations(id, name)
select 'store-' || lpad(i::text, 2, '0'), 'Store ' || i
from generate_series(1, 13) as i
on conflict (id) do nothing;

insert into public.app_users(id, email, name, role, location_id, location_ids)
values (
  'owner',
  null,
  'Owner',
  'Owner',
  'store-01',
  (select jsonb_agg(id order by id) from public.locations)
)
on conflict (id) do nothing;

-- Supabase Storage bucket used by Netlify Functions for checklist photos,
-- work order photos, and uploaded service manuals.
insert into storage.buckets(id, name, public)
values ('dailyops-uploads', 'dailyops-uploads', true)
on conflict (id) do nothing;

-- Allow signed-in app users to upload/read files in the app storage bucket.
-- Needed for direct browser-to-Supabase document uploads.
drop policy if exists "Authenticated users can upload dailyops files" on storage.objects;
create policy "Authenticated users can upload dailyops files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'dailyops-uploads');

drop policy if exists "Authenticated users can read dailyops files" on storage.objects;
create policy "Authenticated users can read dailyops files"
on storage.objects
for select
to authenticated
using (bucket_id = 'dailyops-uploads');
