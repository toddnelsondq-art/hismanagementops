-- HIS OPS subscription, feature-entitlement, and hardware add-on foundation.
-- Run once in the Supabase SQL Editor. Existing HIS locations retain full access.

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

create index if not exists location_addons_tenant_location_idx
  on public.location_addons(tenant_id, location_id, enabled);
create index if not exists tenant_subscriptions_status_idx
  on public.tenant_subscriptions(status, current_period_end);

insert into public.subscription_plans(key, name, description, features, limits, sort_order)
values
  (
    'basic',
    'Basic',
    'Core daily operations for a single organization.',
    '{"daily_operations":true,"communications":true,"food_safety_training":true}'::jsonb,
    '{"locations":5,"users":75,"history_days":90}'::jsonb,
    10
  ),
  (
    'advanced',
    'Advanced',
    'The complete operations and management platform.',
    '{"daily_operations":true,"communications":true,"food_safety_training":true,"maintenance":true,"fpc_repairs":true,"advanced_alerts":true,"inspections":true,"receipts":true,"advanced_reports":true,"smallwares":true,"rollouts":true,"maintenance_work_logs":true}'::jsonb,
    '{"locations":100,"users":2500,"history_days":730}'::jsonb,
    20
  )
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  features = excluded.features,
  limits = excluded.limits,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

insert into public.tenant_subscriptions(tenant_id, plan_key, status, provider, updated_by)
values ('his-management', 'advanced', 'active', 'manual', 'initial subscription migration')
on conflict (tenant_id) do nothing;

insert into public.location_addons(tenant_id, location_id, addon_key, enabled, quantity, updated_by)
select location.tenant_id, location.id, addon.addon_key, true, 1, 'initial subscription migration'
from public.locations as location
cross join (values ('thermostats'), ('sensors'), ('cameras')) as addon(addon_key)
where location.tenant_id = 'his-management'
on conflict (tenant_id, location_id, addon_key) do nothing;

comment on table public.subscription_plans is 'Provider-neutral feature and limit definitions for each sellable plan.';
comment on table public.tenant_subscriptions is 'One current subscription per customer organization; Stripe IDs may be added later without changing entitlements.';
comment on table public.location_addons is 'Location-specific hardware packages such as thermostats, sensors, and cameras.';
comment on table public.billing_events is 'Idempotent event ledger reserved for a future Stripe or other billing webhook.';
