-- HIS Management Group Operations Hub
-- Run this in Supabase SQL Editor before deploying the Netlify version.

create extension if not exists pgcrypto;

create table if not exists public.locations (
  id text primary key,
  name text not null,
  address text not null default '',
  phone text not null default '',
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id text primary key,
  auth_user_id uuid unique,
  email text unique,
  name text not null,
  role text not null default 'Employee',
  location_id text not null default 'store-01' references public.locations(id),
  location_ids jsonb not null default '["store-01"]'::jsonb,
  active boolean not null default true,
  invited_by text,
  invited_at timestamptz,
  accepted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.invites (
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
  location_id text not null references public.locations(id),
  date text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (location_id, date)
);

create table if not exists public.maintenance_data (
  key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

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
