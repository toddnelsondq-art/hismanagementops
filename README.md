# HIS Management Group Operations Hub

A phone-friendly prototype for daily operational checklists, required photos, manager-pushed tasks, and completed-record history. Temperature checks use predefined Grill Area and Chill Area item lists, with two readings required for every item each day.

## Run

Run the backend server:

```powershell
python server.py
```

Then open:

```text
http://127.0.0.1:8765
```

For a phone on the same Wi-Fi network, use the computer's local network address instead of `127.0.0.1`, for example:

```text
http://192.168.1.25:8765
```

## Where records are saved

The shared database is created at:

```text
data/dailyops.sqlite
```

Required photos are saved at:

```text
data/uploads/
```

If the backend is not running, the app falls back to browser-only storage so the screen still works, but that fallback is not shared across devices.

## Important prototype boundary

This version now has a real local backend, but production deployment still needs authentication, employee/location roles, cloud database and photo storage, audit timestamps, retention/export rules, notifications, and offline sync. The future sensor integration should write readings through a secured ingestion API tied to a location and device.

## Hosted testing with Netlify + Supabase

The project now includes the first hosted backend path:

- Netlify serves the files in `app/`.
- Netlify Functions answer the same `/api/...` routes the local Python server uses.
- Supabase stores locations, users, daily records, maintenance data, and uploaded files.
- Supabase Auth handles email/password login.
- Enrolled store tablets let employees sign in with a four-digit PIN; management accounts continue to use email/password.

### 1. Create Supabase project

In Supabase:

1. Create a new project.
2. Open SQL Editor.
3. Run [`supabase/schema.sql`](supabase/schema.sql).
4. Go to Authentication > Providers > Email and keep email sign-in enabled.
5. Disable open/public signups if your Supabase project exposes that option.

The schema creates:

- `locations`
- `app_users`
- `user_location_assignments`
- `invites`
- `days`
- `maintenance_data`
- `kiosk_devices`
- `kiosk_enrollments`
- private storage bucket `dailyops-uploads` with server-authorized uploads and signed downloads

### 2. Deploy to Netlify

In Netlify:

1. Create a new site from this project folder/repository.
2. Set build settings:
   - Publish directory: `app`
   - Functions directory: `netlify/functions`
3. Add environment variables from [`.env.example`](.env.example):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET`
   - `KIOSK_TOKEN_SECRET` (a private random value of at least 32 characters)
   - `APP_PUBLIC_URL` (the public app URL used by password-recovery links, such as `https://dqops.net`)
   - `PLATFORM_ADMIN_EMAILS` (comma-separated Average Guys administrator email addresses)
   - `PLATFORM_FEEDBACK_EMAIL` (where new product feedback should be sent)

Netlify uses [`netlify.toml`](netlify.toml) to route `/api/*` to the hosted function.

Run [`supabase/add_app_feedback.sql`](supabase/add_app_feedback.sql) once to enable the in-app feedback form and Platform Admin feedback inbox. Platform Admin is intentionally separate from each customer organization’s Manage area. It can support users and control subscriptions across organizations without exposing stored passwords.

### 3. Bootstrap the first Owner

Before the first hosted login, add your email to the seeded Owner row:

1. In Supabase, open Table Editor > `app_users`.
2. Find the row with `id = owner`.
3. Set `email` to your email address.
4. Open the Netlify site and request a sign-in email with that same address.

The app will link that Supabase login to the Owner profile.

### 4. Create users

When hosted auth is enabled:

1. Sign in as the Owner profile.
2. Go to Manage > Add an employee or manager.
3. Enter name, email, role, home location, and every assigned location.
4. Enter a temporary password.
5. The user can sign in with email + that temporary password.
6. The user can only join with the role and location assignments saved by the manager.

Users can sign out from the button in the app header, then sign back in with email/password.

### Store tablet and employee PIN setup

For an existing Supabase project, run [`supabase/add_kiosk_pin_login.sql`](supabase/add_kiosk_pin_login.sql) in the Supabase SQL Editor before deploying this version. Run [`supabase/add_user_location_assignments.sql`](supabase/add_user_location_assignments.sql) to enable normalized multi-location assignments for every role.

For financial Day/Week/Month dashboard reporting, also run [`supabase/add_financial_reports.sql`](supabase/add_financial_reports.sql). Directors and Owners can then upload the Excel version of the Day-to-Day Financial Recap LY report from Manage. Managers and Area Managers only see financial results for their assigned locations.

Store inspection documents can be filed automatically from an approved email sender. Configure the Netlify variables and Mailgun recipient route in [`DOCUMENT_EMAIL_SETUP.md`](DOCUMENT_EMAIL_SETUP.md), then maintain store-number mappings from Resources → Documents → Email document intake. Unclear documents remain in a Director/Owner review queue instead of being assigned by a guess.

Completed FPC PDF reports can also be emailed to the app. Follow [`FPC_EMAIL_SETUP.md`](FPC_EMAIL_SETUP.md). HIS OPS attaches the original report to the correct location/date and creates an open repair item from each failed “No” standard that includes a deficiency description. Unknown or conflicting stores remain in the Director/Owner FPC review queue.

1. Sign in with a Manager, Area Manager, Director, or Owner account.
2. Open Manage and set a four-digit PIN while adding or editing an Employee.
3. In **Store tablets & employee PINs**, choose the store, name the tablet, and generate a setup code.
4. On the tablet's DQ OPS login screen, choose **Set up a store tablet** and enter the one-time code within 15 minutes.
5. Employees can select their name and enter their PIN. Employees assigned to multiple locations appear on each assigned store tablet, while each tablet session remains locked to that tablet's store. Five failed attempts lock that employee's PIN for 15 minutes, and an employee session signs out after five minutes of inactivity.

Managers can remove a lost or replaced tablet from the same Manage card. Employee PINs never grant management access and are stored only as salted password hashes.

Locally, the Python server still works for quick testing. Hosted email/password login requires Netlify + Supabase environment variables.
