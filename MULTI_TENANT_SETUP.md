# Multi-tenant setup notes

For the complete platform and customer rollout process, see `CUSTOMER_ONBOARDING.md`.

This app now has a request-scoped tenant/company layer. `APP_TENANT_ID` is only the safe fallback for public or legacy requests; authenticated users are resolved through verified tenant memberships.

## Current HIS tenant

If no Netlify setting is added, the app uses:

- Tenant ID: `his-management`
- Business name: `HIS Management Group Inc`
- App name: `HIS OPS`
- Logo: `assets/his-management.png`

That keeps the current HIS app working as the default tenant.

## Required Supabase update

For your existing Supabase project, run:

`supabase/multi_tenant_migration.sql`

Then run:

`supabase/add_tenant_memberships.sql`

Do not copy only the lines starting with `id text...`; run the whole migration file from the top.

Use `supabase/schema.sql` only as the full from-scratch schema reference.

Together, the migrations add:

- `tenants`
- `tenant_memberships`
- `tenant_id` columns on core tables
- tenant-aware keys for daily records and shared app data
- tenant-scoped email and Supabase Auth identity uniqueness

## Netlify environment variables

For HIS, these are optional because the defaults are already HIS:

- `APP_TENANT_ID=his-management`
- `APP_TENANT_NAME=HIS Management Group Inc`
- `APP_NAME=HIS OPS`
- `APP_SUBTITLE=Daily operations`
- `APP_TENANT_LOGO=assets/his-management.png`

Do not create a separate Netlify deployment merely to change `APP_TENANT_ID`. For another restaurant operator, create a tenant row and membership in Supabase. The verified session selects the correct tenant for each request.

## What this phase does

- Scopes locations, users, daily checklist records, reports, and shared app data by tenant.
- Resolves the Tenant ID from the signed-in user's allowed memberships.
- Rejects a browser-supplied Tenant ID when the user is not a member.
- Allows one Supabase Auth user to belong to more than one tenant.
- Lets the frontend receive tenant branding from the backend.
- Keeps HIS as the default tenant.

## What still needs to be built for a finished SaaS product

- A tenant onboarding/setup screen.
- A branding editor for company logo, colors, and app name.
- Import/setup tools for each tenant’s checklists, temp logs, locations, and users.
- A cleaner tenant-safe ID strategy for locations/users if multiple companies share one Supabase project.
- Stripe/billing, terms/privacy, support tools, and admin-level tenant management.
