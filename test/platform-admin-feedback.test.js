const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_ANON_KEY = 'platform-admin-test-key';
process.env.PLATFORM_ADMIN_EMAILS = 'support@avgguysbs.com, owner@avgguysbs.com';

const { platformAdminEmails, isPlatformAdmin } = require('../netlify/functions/api.js').__test;

test('platform administration is controlled by the configured Average Guys email allowlist', () => {
  assert.deepEqual(platformAdminEmails(), ['support@avgguysbs.com', 'owner@avgguysbs.com']);
  assert.equal(isPlatformAdmin({ email: 'Support@AvgGuysBS.com', role: 'Employee' }), true);
  assert.equal(isPlatformAdmin({ email: 'customer@example.com', role: 'Owner' }), false);
});

test('feedback migration is tenant scoped, private, and status tracked', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'add_app_feedback.sql'), 'utf8');
  assert.match(migration, /tenant_id text not null references public\.tenants/i);
  assert.match(migration, /foreign key \(tenant_id, app_user_id\) references public\.app_users/i);
  assert.match(migration, /status text not null default 'New'/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all privileges.*anon, authenticated/i);
});

test('platform feedback separates resolved requests and supports administrator deletion', () => {
  const markup = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const client = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');
  const api = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'api.js'), 'utf8');
  assert.match(markup, /<details class="card platform-admin-details" id="platformUserSupportCard">/);
  assert.doesNotMatch(markup, /<details class="card platform-admin-details" id="platformUserSupportCard" open>/);
  assert.match(markup, /id="platformPreviousFeedback"/);
  assert.match(client, /\['Completed', 'Declined'\]\.includes\(item\.status\)/);
  assert.match(client, /data-platform-feedback-delete/);
  assert.match(client, /method: 'DELETE'/);
  assert.match(api, /async function deleteAppFeedback/);
  assert.match(api, /method === 'DELETE' && apiPath === '\/platform\/feedback'/);
});

test('password recovery links open a new-password form in the app', () => {
  const authSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');
  assert.match(authSource, /type=recovery/);
  assert.match(authSource, /showPasswordRecovery/);
  assert.match(authSource, /auth\.updateUser\(\{ password \}\)/);
});
