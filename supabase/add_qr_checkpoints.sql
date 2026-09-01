-- Secure, tenant-scoped QR checkpoints and scan history for DQ OPS.
-- Run once in the Supabase SQL Editor before using QR checkpoints.

begin;

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

create index if not exists qr_checkpoints_tenant_location_idx
  on public.qr_checkpoints(tenant_id, location_id, active, name);

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

create index if not exists qr_checkpoint_scans_tenant_date_idx
  on public.qr_checkpoint_scans(tenant_id, location_id, scan_date, scanned_at desc);

create index if not exists qr_checkpoint_scans_checkpoint_idx
  on public.qr_checkpoint_scans(tenant_id, checkpoint_id, scanned_at desc);

alter table public.qr_checkpoints enable row level security;
alter table public.qr_checkpoint_scans enable row level security;
revoke all privileges on table public.qr_checkpoints from anon, authenticated;
revoke all privileges on table public.qr_checkpoint_scans from anon, authenticated;

commit;

select id, tenant_id, location_id, name, active
from public.qr_checkpoints
order by name;
