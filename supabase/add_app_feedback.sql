-- App feedback submitted by signed-in DQ OPS users.
-- Run once in the Supabase SQL Editor before using the feedback form.

begin;

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

create index if not exists app_feedback_tenant_created_idx
  on public.app_feedback(tenant_id, created_at desc);

create index if not exists app_feedback_status_created_idx
  on public.app_feedback(status, created_at desc);

alter table public.app_feedback enable row level security;
revoke all privileges on table public.app_feedback from anon, authenticated;

commit;

select id, tenant_id, category, title, status, created_at
from public.app_feedback
order by created_at desc
limit 10;
