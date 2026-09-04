-- Public review ingestion for trusted automation clients such as n8n.
create table if not exists public.public_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  location_id text not null,
  source text not null,
  external_review_id text not null,
  review_url text not null default '',
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  review_text text not null default '',
  reviewer_display_name text not null default '',
  reviewed_at timestamptz,
  retrieved_at timestamptz not null default now(),
  sentiment text not null default '' check (sentiment in ('', 'positive', 'neutral', 'negative', 'mixed')),
  summary text not null default '',
  topics text[] not null default '{}',
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, source, external_review_id),
  foreign key (tenant_id, location_id) references public.locations(tenant_id, id) on delete cascade
);

create index if not exists public_reviews_tenant_location_date_idx
  on public.public_reviews(tenant_id, location_id, reviewed_at desc, created_at desc);

alter table public.public_reviews enable row level security;
revoke all privileges on table public.public_reviews from anon, authenticated;

