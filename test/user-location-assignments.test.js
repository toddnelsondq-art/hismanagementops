const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';

const {
  legacyUserLocationIds,
  assignmentIsCurrent,
  userLocationIds,
  notificationLocationsForUser
} = require('../netlify/functions/api.js').__test;

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'add_user_location_assignments.sql'),
  'utf8'
);
const appSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');

test('location assignment migration creates a tenant-safe normalized table and backfills legacy users', () => {
  assert.match(migration, /create table if not exists public\.user_location_assignments/i);
  assert.match(migration, /primary key \(tenant_id, user_id, location_id\)/i);
  assert.match(migration, /references public\.app_users\(tenant_id, id\) on delete cascade/i);
  assert.match(migration, /references public\.locations\(tenant_id, id\) on delete cascade/i);
  assert.match(migration, /insert into public\.user_location_assignments/i);
  assert.match(migration, /jsonb_array_elements_text/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all privileges .* from anon, authenticated/i);
});

test('legacy assignments always include the home location once', () => {
  assert.deepEqual(
    legacyUserLocationIds({ location_id: 'store-a', location_ids: ['store-b', 'store-a'] }),
    ['store-a', 'store-b']
  );
});

test('dated assignments are usable only inside their active period', () => {
  const now = new Date('2026-09-01T12:00:00Z');
  assert.equal(assignmentIsCurrent({ active: true }, now), true);
  assert.equal(assignmentIsCurrent({ active: false }, now), false);
  assert.equal(assignmentIsCurrent({ starts_at: '2026-09-02T00:00:00Z' }, now), false);
  assert.equal(assignmentIsCurrent({ ends_at: '2026-09-01T12:00:00Z' }, now), false);
  assert.equal(assignmentIsCurrent({ starts_at: '2026-08-31T00:00:00Z', ends_at: '2026-09-02T00:00:00Z' }, now), true);
});

test('normalized assignments take precedence and notification subsets stay inside assigned stores', () => {
  const user = { role: 'Manager', location_id: 'store-a', location_ids: ['legacy'], locationIds: ['store-a', 'store-b'] };
  assert.deepEqual(userLocationIds(user), ['store-a', 'store-b']);

  const locations = [
    { id: 'store-a', name: 'A' },
    { id: 'store-b', name: 'B' },
    { id: 'store-c', name: 'C' }
  ];
  assert.deepEqual(
    notificationLocationsForUser(user, { locationIds: ['store-b', 'store-c'] }, locations).map(location => location.id),
    ['store-b']
  );
});

test('new-user form preserves its chosen home store during renders and resets stale assignments after save', () => {
  assert.match(appSource, /const selectedHomeLocation = \$\('#newUserLocation'\)\.value/);
  assert.match(appSource, /location\.id === selectedHomeLocation/);
  assert.match(appSource, /renderNewUserLocationChecks\(\{ reset: true \}\)/);
});
