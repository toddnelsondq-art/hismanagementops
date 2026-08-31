# Tenant security rollout

Version 1.25.0 makes uploaded operational files private and removes direct
browser access to DQ OPS database tables. The Netlify API is the authorization
boundary: it verifies the signed-in tenant, role, and assigned location before
it issues a path-scoped upload token or short-lived signed download URL.

## Production rollout order

1. Push and deploy version 1.25.0 or later through Netlify.
2. Confirm `/api/version` reports the new version.
3. Run `supabase/tenant_isolation_storage_rls.sql` in the Supabase SQL editor.
4. Confirm the migration's verification results show RLS enabled for every
   listed table and `public = false` for both storage buckets.
5. Refresh DQ OPS and test one existing photo/document and one new upload.
6. Test an Owner and a location-limited Manager before onboarding another tenant.

Do not run the storage migration before the application deployment. Existing
public object URLs stop working when the bucket becomes private; the new server
automatically recognizes those legacy HIS paths and replaces them with signed
links when records are read.

## Storage layout

New objects use stable internal references and this object layout:

`v2/<tenant-id>/<location-id>/<category>/<unique-file-name>`

The database stores `dqops-storage://...` references instead of expiring signed
URLs. A fresh signed URL is generated on every authorized read. New objects for
one tenant cannot be signed while another tenant is active.

Existing pre-v2 objects stay in place. They are treated as legacy HIS Management
objects and are never exposed to a future outside tenant.

## Database access

DQ OPS business tables have RLS enabled and their `anon` and `authenticated`
table grants are revoked. The browser uses Supabase Auth only for identity and
calls the tenant-aware Netlify API for business data. The Supabase service-role
key remains server-side in Netlify and must never be placed in the app bundle.
