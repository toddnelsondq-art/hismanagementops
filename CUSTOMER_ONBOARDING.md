# DQ OPS customer onboarding

This is the target start-to-finish process for onboarding restaurant operators under Average Guys Business Services. It preserves one maintained application while isolating every customer's users, locations, files, integrations, and subscription.

## Recommended service layout

- **GitHub:** Keep one private, canonical application repository owned by the Average Guys Business Services GitHub organization. Customer data and uploaded files never belong in GitHub.
- **Netlify:** Use one production application and one staging environment. Shared service secrets stay in Netlify; customer names, branding, plans, and integrations belong in the database rather than environment variables.
- **Supabase:** Keep the projects under the Average Guys organization. Use separate projects for development/staging and production, not a new account for every customer. The production project can hold many tenants when every table, storage object, API request, and authorization rule is tenant-scoped. A dedicated project remains an optional enterprise offering for a customer that contractually requires physical database isolation.
- **Mailgun:** Use one Average Guys-owned sending domain and one inbound reporting subdomain. Give each tenant a unique address and route all matching inbound email to the same signed webhook. Store the address and approved senders per tenant in Supabase. A separate Mailgun route or account is unnecessary unless a customer requires its own email domain or separate billing/reputation.
- **Twilio:** Treat Average Guys as an ISV when DQ OPS sends messages on behalf of outside operators. Prefer a Twilio subaccount, Messaging Service, customer profile, Brand, and Campaign per customer.
- **Stripe:** Use one Stripe account. Each operator becomes a Stripe Customer whose subscription and add-ons update the existing DQ OPS entitlement tables through verified webhooks.
- **File storage:** Store tenant files in private Supabase Storage paths such as `tenant-id/location-id/category/file`. Do not use GitHub as document storage.

## Work required before the first outside customer

Version 1.25.0 completes the first identity and file-storage boundaries: authenticated requests resolve their tenant from `tenant_memberships`, the browser's requested Tenant ID is accepted only when that membership allows it, kiosk tokens remain tenant-locked, uploaded files use private tenant/location paths, and application tables no longer permit direct browser access. Run `supabase/add_tenant_memberships.sql`, deploy version 1.25.0, and then run `supabase/tenant_isolation_storage_rls.sql` before creating a second organization.

The remaining safeguards are:

1. Run live allow-and-deny acceptance tests for cross-tenant records and files in staging before onboarding the first outside customer.
2. Replace globally configured financial-email senders with tenant-specific inbound aliases and approved-sender lists stored in the database.
3. Make location and user identifiers globally unique, or enforce composite tenant-aware foreign keys everywhere.
4. Add an Average Guys platform-admin onboarding screen and an audit log for tenant, subscription, integration, and impersonation changes.
5. Establish production backups, recovery testing, monitoring, error alerts, and a staging migration workflow.
6. Publish customer terms, privacy policy, support policy, data retention policy, and a data-export/deletion process.

## One-time platform setup

1. Move the private repository into an Average Guys GitHub organization and require MFA for administrators.
2. Protect the production branch and use pull requests or a staging branch for database and application changes.
3. Create separate Supabase staging and production projects. Apply schema changes through version-controlled migrations.
4. Create one Netlify production site, one staging deployment context, and the required site/team environment variables.
5. Verify Average Guys sending and inbound-reporting subdomains in Mailgun. Create a wildcard recipient route/forward to the DQ OPS financial-report webhook and stop further route processing.
6. Configure Twilio as an ISV before sending texts for outside operators.
7. Configure Stripe products/prices for plans and hardware add-ons, then connect verified subscription webhooks.
8. Add central uptime, function-error, inbound-email, notification-delivery, and backup monitoring.

## Per-customer onboarding checklist

### 1. Commercial and legal

- Record legal business name, DBA, EIN/business type, billing contact, technical contact, and authorized signer.
- Sign the service agreement and applicable data-processing terms.
- Select the Basic or Advanced plan, user/location limits, retention period, and hardware add-ons.
- Decide whether the customer uses shared infrastructure or a contractually dedicated database project.

### 2. Create the tenant

- Create a permanent, unique Tenant ID (slug) using lowercase letters, numbers, and hyphens, such as `northstar-dq`. Do not use a customer name that is likely to change, and never recycle an old Tenant ID.
- Enter business name, app name, logo, colors, timezone, locale, support contact, and active status.
- Create the tenant subscription and location add-ons.
- Generate an audit entry identifying the Average Guys administrator who completed setup.

### 3. Create the first administrator

- Invite the customer's owner-level administrator through Supabase Auth.
- Create the verified tenant membership and Owner role.
- Require password reset/MFA as appropriate and confirm the user cannot access another tenant.

### 4. Import operating structure

- Import locations with permanent unique store numbers, names, addresses, phone numbers, timezone, and active status.
- Import users, roles, location assignments, maintenance eligibility, and tablet/PIN permissions.
- Load checklist templates, task schedules, temperature logs/ranges/actions, delivery days, alert rules, resources, equipment, PM tasks, and inspection templates.
- Review all data with the customer's administrator before activation.

### 5. Configure financial-report email

- Assign a unique address such as `customer-slug@reports.avgguysbs.com`.
- Store that address and the customer's approved PAR/report sender addresses in DQ OPS.
- Send a test workbook, verify the Mailgun signature, confirm the tenant selected from the recipient address, review every store-number mapping, and reconcile totals.
- No new Mailgun route is needed when the shared wildcard route is in place.

### 6. Configure communications

- Confirm outbound notification sender names and reply addresses.
- For SMS, create the customer's Twilio subaccount/secondary profile, Brand, Campaign, Messaging Service, and phone number as required.
- Publish and test the customer's opt-in flow, consent records, HELP response, STOP handling, and notification preferences before enabling texts.

### 7. Configure optional hardware

- Assign thermostats, Raspberry Pi gateways, sensors, cameras, and store tablets to tenant and location IDs.
- Store credentials as encrypted server-side integration records, never in the browser or GitHub.
- Complete the rollout checklist, test offline behavior and alerts, and record serial numbers/support ownership.

### 8. Validate isolation and acceptance

- Test Owner, Director, Area Manager, Manager, Shift Manager, Employee, Maintenance, installer, and tablet access.
- Explicitly test that users cannot read or change another tenant's locations, reports, files, devices, notices, or notifications.
- Test daily tasks, temperature logs, maintenance/FPC, financial imports, email, SMS, exports, and backups.
- Obtain written customer acceptance and record the go-live date.

### 9. Go live and support

- Activate billing and entitlements.
- Enable production integrations and monitoring.
- Deliver administrator training and a support/escalation contact.
- Schedule a 7-day and 30-day review, then periodic access, billing, backup, and integration audits.

## Sources and operational references

- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Mailgun inbound routes: https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/routes
- Mailgun route filters: https://documentation.mailgun.com/docs/mailgun/user-manual/receive-forward-store/route-filters
- Netlify environment variables: https://docs.netlify.com/build/environment-variables/overview/
- Twilio ISV A2P onboarding: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv
- Stripe subscription webhooks: https://docs.stripe.com/billing/subscriptions/webhooks
- Stripe customer portal: https://docs.stripe.com/customer-management
