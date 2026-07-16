-- HIS OPS multi-tenant migration for an EXISTING Supabase database.
-- Run this whole file in Supabase SQL Editor.

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

insert into public.tenants(id, name, app_name, subtitle, logo_url)
values ('his-management', 'HIS Management Group Inc', 'HIS OPS', 'Daily operations', 'assets/his-management.png')
on conflict (id) do update set
  name = excluded.name,
  app_name = excluded.app_name,
  subtitle = excluded.subtitle,
  logo_url = excluded.logo_url,
  updated_at = now();

alter table public.locations
  add column if not exists tenant_id text not null default 'his-management';

alter table public.app_users
  add column if not exists tenant_id text not null default 'his-management';

alter table public.invites
  add column if not exists tenant_id text not null default 'his-management';

alter table public.days
  add column if not exists tenant_id text not null default 'his-management';

alter table public.maintenance_data
  add column if not exists tenant_id text not null default 'his-management';

update public.locations set tenant_id = 'his-management' where tenant_id is null;
update public.app_users set tenant_id = 'his-management' where tenant_id is null;
update public.invites set tenant_id = 'his-management' where tenant_id is null;
update public.days set tenant_id = 'his-management' where tenant_id is null;
update public.maintenance_data set tenant_id = 'his-management' where tenant_id is null;

create unique index if not exists locations_tenant_id_id_key
  on public.locations(tenant_id, id);

create unique index if not exists app_users_tenant_id_id_key
  on public.app_users(tenant_id, id);

create unique index if not exists days_tenant_id_location_id_date_key
  on public.days(tenant_id, location_id, date);

create unique index if not exists maintenance_data_tenant_id_key_key
  on public.maintenance_data(tenant_id, key);

-- These two tables need their primary key to include tenant_id because the app
-- writes them using on_conflict=tenant_id,...
alter table public.days drop constraint if exists days_pkey;
alter table public.days
  add constraint days_pkey primary key (tenant_id, location_id, date);

alter table public.maintenance_data drop constraint if exists maintenance_data_pkey;
alter table public.maintenance_data
  add constraint maintenance_data_pkey primary key (tenant_id, key);
