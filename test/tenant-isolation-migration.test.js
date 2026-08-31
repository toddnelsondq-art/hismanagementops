const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationPath = path.join(__dirname, '..', 'supabase', 'tenant_isolation_storage_rls.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');

test('tenant isolation migration makes both upload buckets private', () => {
  assert.match(migration, /'dailyops-uploads', 'dailyops-uploads', false/i);
  assert.match(migration, /'dqops-receipts', 'dqops-receipts', false/i);
  assert.match(migration, /drop policy if exists "Authenticated users can upload dailyops files"/i);
  assert.match(migration, /drop policy if exists "Authenticated users can read dailyops files"/i);
});

test('tenant isolation migration enables RLS and revokes browser table access', () => {
  for (const tableName of ['tenants', 'locations', 'app_users', 'days', 'maintenance_data', 'tenant_memberships', 'financial_daily_metrics', 'app_feedback']) {
    assert.match(migration, new RegExp(`'${tableName}'`, 'i'));
  }
  assert.match(migration, /alter table public\.%I enable row level security/i);
  assert.match(migration, /revoke all privileges on table public\.%I from anon, authenticated/i);
});
