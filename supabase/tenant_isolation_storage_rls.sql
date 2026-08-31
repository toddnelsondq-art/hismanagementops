-- DQ OPS tenant isolation and private-storage lockdown.
--
-- Deployment order:
--   1. Deploy the matching application release.
--   2. Run this migration in the Supabase SQL editor.
--
-- The Netlify API uses the Supabase service-role key and remains able to access
-- these tables and buckets. Browser clients receive short-lived, path-scoped
-- upload tokens and signed download links from that API.

begin;

-- Uploaded operational files and receipts are private. Existing objects are not
-- moved or deleted; the application signs legacy HIS object paths when needed.
insert into storage.buckets(id, name, public, file_size_limit)
values ('dailyops-uploads', 'dailyops-uploads', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

insert into storage.buckets(id, name, public, file_size_limit)
values ('dqops-receipts', 'dqops-receipts', false, 52428800)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

-- Direct authenticated access used by the original public bucket is no longer
-- needed. Signed upload tokens and server-created signed URLs are used instead.
drop policy if exists "Authenticated users can upload dailyops files" on storage.objects;
drop policy if exists "Authenticated users can read dailyops files" on storage.objects;

-- DQ OPS is API-only for business data. Enable RLS on every application table
-- and remove direct browser grants. The service role used by the Netlify API has
-- BYPASSRLS and is not affected by these grants.
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
    'app_feedback'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all privileges on table public.%I from anon, authenticated', table_name);
    end if;
  end loop;
end
$$;

commit;

-- Optional verification query. Every returned application table should show
-- rls_enabled = true, and both buckets should show public = false.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'tenants', 'locations', 'app_users', 'kiosk_devices', 'kiosk_enrollments',
    'invites', 'days', 'maintenance_data', 'tenant_memberships',
    'subscription_plans', 'tenant_subscriptions', 'location_addons',
    'billing_events', 'financial_report_imports', 'financial_daily_metrics',
    'app_feedback'
  )
order by c.relname;

select id, public, file_size_limit
from storage.buckets
where id in ('dailyops-uploads', 'dqops-receipts')
order by id;
