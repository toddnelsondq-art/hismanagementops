# HIS OPS subscriptions and entitlements

HIS OPS uses provider-neutral subscription records. The application reads these records to decide which software features, limits, and location hardware packages are available. Stripe can be connected later without redesigning the feature system.

## Initial setup

1. Run `supabase/add_subscription_entitlements.sql` in the Supabase SQL Editor.
2. In Netlify, add `PLATFORM_ADMIN_EMAILS` with a comma-separated list of Average Guys administrator email addresses.
3. Trigger a Netlify deploy, sign out, and sign back in.
4. Open **Manage → Average Guys subscription & features**.

The migration gives `his-management` the Advanced plan and enables thermostats, sensors, and cameras for all current HIS locations. Existing HIS functionality is therefore preserved.

## Plans

- **Basic** includes daily operations, communications, and food-safety training. Its seeded limits are 5 locations, 75 active users, and 90 days of retained history.
- **Advanced** includes all current software modules. Its seeded limits are 100 locations, 2,500 active users, and 730 days of retained history.

Plan definitions live in `subscription_plans`. Organization-specific exceptions are stored in `tenant_subscriptions.features_override` and `limits_override`.

## Location add-ons

The `location_addons` table enables thermostats, temperature sensors, and cameras independently for each location. This supports a customer that uses, for example, Advanced software at ten stores but cameras at only two.

## Future billing connection

When Stripe is added, use Stripe Products/Prices for the plan and add-ons. A webhook should update `tenant_subscriptions` and `location_addons`. Store every webhook first in `billing_events` using the provider event ID, which prevents the same event from being applied twice.

The application must continue checking entitlements in the API. Hiding a button in the web or Android interface is only a convenience and is not a security boundary.
