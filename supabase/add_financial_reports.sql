-- Financial recap imports for HIS OPS.
-- Run this whole file in the Supabase SQL Editor before deploying the matching app version.

create extension if not exists pgcrypto;

-- Required by the composite foreign key below. This already exists in current
-- HIS OPS databases, but keeping it here makes this migration self-contained.
create unique index if not exists locations_tenant_id_id_key
  on public.locations(tenant_id, id);

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

create index if not exists financial_report_imports_tenant_date_idx
  on public.financial_report_imports(tenant_id, report_date desc, created_at desc);

create index if not exists financial_daily_metrics_tenant_date_idx
  on public.financial_daily_metrics(tenant_id, business_date desc);

create index if not exists financial_daily_metrics_tenant_location_date_idx
  on public.financial_daily_metrics(tenant_id, location_id, business_date desc);

alter table public.financial_report_imports enable row level security;
alter table public.financial_daily_metrics enable row level security;

-- The browser never reads these tables directly. Netlify Functions verify the
-- signed-in user's role and location access, then use the Supabase service role.
