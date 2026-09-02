const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase', 'add_work_order_updates.sql'), 'utf8');
const api = fs.readFileSync(path.join(root, 'netlify', 'functions', 'api.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');

test('repair history table is tenant scoped and unavailable directly to browsers', () => {
  assert.match(migration, /create table if not exists public\.work_order_updates/i);
  assert.match(migration, /tenant_id text not null references public\.tenants/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all privileges on table public\.work_order_updates from anon, authenticated/i);
  assert.match(migration, /work_order_updates_tenant_order_created_idx/i);
});

test('maintenance API exposes an append-only repair update route with access checks', () => {
  assert.match(api, /async function addWorkOrderUpdate\(payload, actor\)/);
  assert.match(api, /canAccessMaintenanceRecord\(actor, row\)/);
  assert.match(api, /POST' && apiPath === '\/maintenance\/work-order\/update-entry'/);
  assert.doesNotMatch(api, /DELETE' && apiPath === '\/maintenance\/work-order\/update-entry'/);
  assert.match(api, /Use the work-order completion controls so a final resolution is recorded/);
});

test('work order dialog includes a compact update form and repair timeline', () => {
  assert.match(page, /id="workOrderUpdateForm"/);
  assert.match(page, /id="workOrderTimeline"/);
  assert.match(page, /\+ Add update/);
  assert.match(app, /function renderWorkOrderTimeline\(workOrderId\)/);
  assert.match(app, /maintenance\/work-order\/update-entry/);
});

test('closing a work order requires a final resolution', () => {
  assert.match(app, /Enter the final resolution before completing this work order/);
});
