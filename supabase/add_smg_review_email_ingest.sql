-- SMG emailed comment/comparison reports and generated location insights.
alter table public.public_reviews add column if not exists survey_item text not null default '';

create table if not exists public.public_review_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  location_id text not null,
  period_start date not null,
  period_end date not null,
  measure text not null,
  current_value numeric(10,6),
  previous_value numeric(10,6),
  difference numeric(10,6),
  response_count integer,
  previous_response_count integer,
  source_hash text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, location_id, period_start, period_end, measure),
  foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete cascade
);

create table if not exists public.review_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  location_id text not null,
  period_start date not null,
  period_end date not null,
  headline text not null default '',
  commentary text not null default '',
  strengths text[] not null default '{}',
  opportunities text[] not null default '{}',
  recommended_actions text[] not null default '{}',
  status text not null default 'generated',
  model text not null default '',
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, location_id, period_start, period_end),
  foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete cascade
);

create table if not exists public.smg_report_imports (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  source_hash text not null,
  source_filename text not null default '',
  sender text not null default '',
  subject text not null default '',
  report_type text not null default '',
  period_start date,
  period_end date,
  storage_reference text not null default '',
  status text not null default 'received',
  imported_count integer not null default 0,
  unmatched_count integer not null default 0,
  message text not null default '',
  created_at timestamptz not null default now(),
  unique (tenant_id, source_hash)
);

create index if not exists public_review_metrics_tenant_location_period_idx on public.public_review_metrics(tenant_id, location_id, period_end desc);
create index if not exists review_insights_tenant_location_period_idx on public.review_insights(tenant_id, location_id, period_end desc);
create index if not exists smg_report_imports_tenant_created_idx on public.smg_report_imports(tenant_id, created_at desc);

alter table public.public_review_metrics enable row level security;
alter table public.review_insights enable row level security;
alter table public.smg_report_imports enable row level security;
revoke all privileges on table public.public_review_metrics, public.review_insights, public.smg_report_imports from anon, authenticated;

