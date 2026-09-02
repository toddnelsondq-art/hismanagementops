-- Append-only repair history for HIS OPS maintenance work orders.
-- Run once in the Supabase SQL Editor before using Work Order Repair History.

begin;

create table if not exists public.work_order_updates (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  work_order_id text not null,
  location_id text not null default '',
  update_type text not null default 'Progress update',
  status text not null default '',
  note text not null,
  time_spent_hours numeric(7,2),
  follow_up_date date,
  attachment_url text not null default '',
  attachment_name text not null default '',
  created_by_id text not null default '',
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  check (char_length(note) between 1 and 2000),
  check (time_spent_hours is null or (time_spent_hours >= 0 and time_spent_hours <= 1000))
);

create index if not exists work_order_updates_tenant_order_created_idx
  on public.work_order_updates(tenant_id, work_order_id, created_at desc);

create index if not exists work_order_updates_tenant_location_created_idx
  on public.work_order_updates(tenant_id, location_id, created_at desc);

alter table public.work_order_updates enable row level security;
revoke all privileges on table public.work_order_updates from anon, authenticated;

commit;

select work_order_id, update_type, status, created_by_name, created_at
from public.work_order_updates
order by created_at desc
limit 10;
