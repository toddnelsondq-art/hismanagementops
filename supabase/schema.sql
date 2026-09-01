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
  auth_user_id uuid,
  email text,
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

alter table public.app_users drop constraint if exists app_users_auth_user_id_key;
alter table public.app_users drop constraint if exists app_users_email_key;

alter table public.days drop constraint if exists days_pkey;
alter table public.days add primary key (tenant_id, location_id, date);

alter table public.maintenance_data drop constraint if exists maintenance_data_pkey;
alter table public.maintenance_data add primary key (tenant_id, key);

create unique index if not exists locations_tenant_id_id_key on public.locations(tenant_id, id);
create unique index if not exists app_users_tenant_id_id_key on public.app_users(tenant_id, id);
create unique index if not exists app_users_tenant_auth_user_key on public.app_users(tenant_id, auth_user_id) where auth_user_id is not null;
create unique index if not exists app_users_tenant_email_key on public.app_users(tenant_id, lower(email)) where email is not null and btrim(email) <> '';
create unique index if not exists kiosk_devices_tenant_id_id_key on public.kiosk_devices(tenant_id, id);
create index if not exists kiosk_devices_location_id_idx on public.kiosk_devices(tenant_id, location_id, active);
create index if not exists kiosk_enrollments_code_hash_idx on public.kiosk_enrollments(tenant_id, code_hash);
create unique index if not exists days_tenant_id_location_id_date_key on public.days(tenant_id, location_id, date);
create unique index if not exists maintenance_data_tenant_id_key_key on public.maintenance_data(tenant_id, key);

-- Maps one Supabase Auth identity to each organization it may access. The API
-- resolves this membership before any tenant-scoped query is allowed to run.
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

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  app_user_id text not null,
  user_name text not null default '',
  user_email text not null default '',
  category text not null default 'Idea' check (category in ('Idea', 'Problem', 'Question', 'Other')),
  title text not null,
  message text not null,
  status text not null default 'New' check (status in ('New', 'Reviewing', 'Planned', 'Completed', 'Declined')),
  admin_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (tenant_id, app_user_id) references public.app_users(tenant_id, id) on delete cascade
);

create index if not exists app_feedback_tenant_created_idx on public.app_feedback(tenant_id, created_at desc);
create index if not exists app_feedback_status_created_idx on public.app_feedback(status, created_at desc);
alter table public.app_feedback enable row level security;
revoke all privileges on table public.app_feedback from anon, authenticated;

create index if not exists tenant_memberships_auth_user_idx on public.tenant_memberships(auth_user_id, active, is_default);
create unique index if not exists tenant_memberships_one_default_key on public.tenant_memberships(auth_user_id) where is_default = true and active = true;

insert into public.tenant_memberships(tenant_id, auth_user_id, app_user_id, active, is_default)
select tenant_id, auth_user_id, id, active,
  row_number() over (partition by auth_user_id order by (tenant_id = 'his-management') desc, tenant_id, id) = 1
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
      new.tenant_id, new.auth_user_id, new.id, new.active,
      not exists (select 1 from public.tenant_memberships where auth_user_id = new.auth_user_id and active = true)
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

-- Private Supabase Storage bucket used for checklist photos, work order photos,
-- and uploaded service manuals. Upload and download authorization is issued by
-- the Netlify API after it verifies the user's tenant, role, and location.
insert into storage.buckets(id, name, public, file_size_limit)
values ('dailyops-uploads', 'dailyops-uploads', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Financial receipts are private and are downloaded through short-lived signed links
-- created only after the app verifies the user's role and assigned locations.
insert into storage.buckets(id, name, public, file_size_limit)
values ('dqops-receipts', 'dqops-receipts', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Browser clients no longer receive broad storage access. They use path-scoped
-- signed upload tokens and short-lived signed download links from the API.
drop policy if exists "Authenticated users can upload dailyops files" on storage.objects;
drop policy if exists "Authenticated users can read dailyops files" on storage.objects;

-- Provider-neutral subscription and feature-entitlement foundation.
create table if not exists public.subscription_plans (
  key text primary key,
  name text not null,
  description text not null default '',
  features jsonb not null default '{}'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_subscriptions (
  tenant_id text primary key references public.tenants(id) on delete cascade,
  plan_key text not null references public.subscription_plans(key),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'suspended', 'canceled')),
  provider text not null default 'manual',
  provider_customer_id text,
  provider_subscription_id text,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  features_override jsonb not null default '{}'::jsonb,
  limits_override jsonb not null default '{}'::jsonb,
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.location_addons (
  tenant_id text not null references public.tenants(id) on delete cascade,
  location_id text not null,
  addon_key text not null check (addon_key in ('thermostats', 'sensors', 'cameras')),
  enabled boolean not null default true,
  quantity integer not null default 1 check (quantity > 0),
  settings jsonb not null default '{}'::jsonb,
  updated_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, location_id, addon_key),
  foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete cascade
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  tenant_id text references public.tenants(id) on delete set null,
  event_type text not null default '',
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received',
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

-- Daily financial recap imports. These tables are read and written only through
-- the Netlify API so location-level financial permissions remain centralized.
create table if not exists public.financial_report_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  report_date date not null,
  comparison_date date,
  source_filename text not null default '',
  source_hash text not null default '',
  location_count integer not null default 0 check (location_count >= 0),
  imported_by text not null default '',
  imported_by_id text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.financial_daily_metrics (
  tenant_id text not null references public.tenants(id) on delete cascade,
  location_id text not null,
  business_date date not null,
  comparison_date date,
  source_store_code text not null default '',
  source_store_name text not null default '',
  gross_sales numeric(14,2),
  total_discounts numeric(14,2),
  net_sales numeric(14,2) not null default 0,
  net_sales_ly numeric(14,2),
  transaction_count integer,
  transaction_count_ly integer,
  average_ticket numeric(12,2),
  labor_hours numeric(10,2),
  labor_cost numeric(14,2),
  labor_percent numeric(8,5),
  sales_per_labor_hour numeric(12,2),
  average_hourly_wage numeric(12,2),
  digital_sales numeric(14,2),
  cash_over_short numeric(12,2),
  cancel_count integer,
  void_count integer,
  source_filename text not null default '',
  source_hash text not null default '',
  import_id uuid references public.financial_report_imports(id) on delete set null,
  imported_by text not null default '',
  imported_at timestamptz not null default now(),
  raw_metrics jsonb not null default '{}'::jsonb,
  primary key (tenant_id, location_id, business_date),
  foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete cascade
);

create index if not exists financial_report_imports_tenant_date_idx on public.financial_report_imports(tenant_id, report_date desc, created_at desc);
create index if not exists financial_daily_metrics_tenant_date_idx on public.financial_daily_metrics(tenant_id, business_date desc);
create index if not exists financial_daily_metrics_tenant_location_date_idx on public.financial_daily_metrics(tenant_id, location_id, business_date desc);

alter table public.financial_report_imports enable row level security;
alter table public.financial_daily_metrics enable row level security;

-- Printable physical checkpoints and their employee-attributed scan history.
create table if not exists public.qr_checkpoints (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  location_id text not null,
  name text not null,
  area text not null default '',
  target_visits integer not null default 0 check (target_visits >= 0 and target_visits <= 100),
  active boolean not null default true,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table if not exists public.qr_checkpoint_scans (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  checkpoint_id uuid not null,
  location_id text not null,
  app_user_id text not null,
  user_name text not null default '',
  task_id text,
  task_name text,
  scan_date date not null,
  scanned_at timestamptz not null default now(),
  foreign key (tenant_id, checkpoint_id) references public.qr_checkpoints(tenant_id, id) on delete cascade,
  foreign key (tenant_id, app_user_id) references public.app_users(tenant_id, id) on delete cascade
);

create index if not exists qr_checkpoints_tenant_location_idx on public.qr_checkpoints(tenant_id, location_id, active, name);
create index if not exists qr_checkpoint_scans_tenant_date_idx on public.qr_checkpoint_scans(tenant_id, location_id, scan_date, scanned_at desc);
create index if not exists qr_checkpoint_scans_checkpoint_idx on public.qr_checkpoint_scans(tenant_id, checkpoint_id, scanned_at desc);

insert into public.subscription_plans(key, name, description, features, limits, sort_order)
values
  ('basic', 'Basic', 'Core daily operations for a single organization.', '{"daily_operations":true,"communications":true,"food_safety_training":true}'::jsonb, '{"locations":5,"users":75,"history_days":90}'::jsonb, 10),
  ('advanced', 'Advanced', 'The complete operations and management platform.', '{"daily_operations":true,"communications":true,"food_safety_training":true,"maintenance":true,"fpc_repairs":true,"advanced_alerts":true,"inspections":true,"receipts":true,"advanced_reports":true,"smallwares":true,"rollouts":true,"maintenance_work_logs":true}'::jsonb, '{"locations":100,"users":2500,"history_days":730}'::jsonb, 20)
on conflict (key) do update set name = excluded.name, description = excluded.description, features = excluded.features, limits = excluded.limits, sort_order = excluded.sort_order, active = true, updated_at = now();

insert into public.tenant_subscriptions(tenant_id, plan_key, status, provider, updated_by)
values ('his-management', 'advanced', 'active', 'manual', 'initial subscription migration')
on conflict (tenant_id) do nothing;

insert into public.location_addons(tenant_id, location_id, addon_key, enabled, quantity, updated_by)
select location.tenant_id, location.id, addon.addon_key, true, 1, 'initial subscription migration'
from public.locations as location
cross join (values ('thermostats'), ('sensors'), ('cameras')) as addon(addon_key)
where location.tenant_id = 'his-management'
on conflict (tenant_id, location_id, addon_key) do nothing;

-- All business data is accessed through the tenant-aware Netlify API. Enforce
-- RLS and remove direct browser grants from every application table. The API's
-- service role retains access through BYPASSRLS.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tenants',
    'locations',
    'app_users',
    'kiosk_devices',
    'kiosk_enrollments',
    'invites',
    'days',
    'maintenance_data',
    'tenant_memberships',
    'subscription_plans',
    'tenant_subscriptions',
    'location_addons',
    'billing_events',
    'financial_report_imports',
    'financial_daily_metrics',
    'app_feedback',
    'qr_checkpoints',
    'qr_checkpoint_scans'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end
$$;
