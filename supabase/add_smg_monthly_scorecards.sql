-- SMG Monthly Store Summary PDFs filed as location scorecards.
+create table if not exists public.public_review_scorecards (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  location_id text not null,
  report_month text not null,
  period_start date not null,
  period_end date not null,
  store_code text not null default '',
  store_name text not null default '',
  benchmarks jsonb not null default '{}'::jsonb,
  onsite_focus_areas text[] not null default '{}',
  digital_focus_areas text[] not null default '{}',
  source_hash text not null default '',
  source_filename text not null default '',
  storage_reference text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, location_id, report_month),
  foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete cascade
);

create index if not exists public_review_scorecards_tenant_location_month_idx on public.public_review_scorecards(tenant_id, location_id, report_month desc);
alter table public.public_review_scorecards enable row level security;
revoke all privileges on table public.public_review_scorecards from anon, authenticated;

