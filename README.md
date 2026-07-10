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
- Supabase stores locations, invited users, daily records, maintenance data, and uploaded files.
- Supabase Auth sends invite/sign-in emails.

### 1. Create Supabase project

In Supabase:

1. Create a new project.
2. Open SQL Editor.
3. Run [`supabase/schema.sql`](supabase/schema.sql).
4. Go to Authentication > Providers > Email and keep email sign-in enabled.
5. For invite-only testing, disable open/public signups if your Supabase project exposes that option.

The schema creates:

- `locations`
- `app_users`
- `invites`
- `days`
- `maintenance_data`
- public storage bucket `dailyops-uploads`

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

Netlify uses [`netlify.toml`](netlify.toml) to route `/api/*` to the hosted function.

### 3. Bootstrap the first Owner

Before the first hosted login, add your email to the seeded Owner row:

1. In Supabase, open Table Editor > `app_users`.
2. Find the row with `id = owner`.
3. Set `email` to your email address.
4. Open the Netlify site and request a sign-in email with that same address.

The app will link that Supabase login to the Owner profile.

### 4. Invite users

When hosted auth is enabled:

1. Sign in as the Owner profile.
2. Go to Manage > Add an employee or manager.
3. Enter name, email, role, and location.
4. The app sends a Supabase email invite.
5. The invited user can only join with the role and location assignment saved in the invite.

Locally, the Python server still works for quick testing. The hosted invite email flow requires Netlify + Supabase environment variables.
