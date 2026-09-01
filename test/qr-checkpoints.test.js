const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.KIOSK_TOKEN_SECRET = 'test-only-qr-secret';
process.env.APP_TENANT_ID = 'his-management';

const { __test } = require('../netlify/functions/api.js');

test('QR checkpoint tokens are stable, signed, and tenant scoped', () => {
  const token = __test.signQrCheckpointToken({ tenantId: 'his-management', checkpointId: '3a43a5d7-e83b-4a76-afdd-e01f92576a18' });
  const verified = __test.verifyQrCheckpointToken(token, 'his-management');
  assert.equal(verified.checkpointId, '3a43a5d7-e83b-4a76-afdd-e01f92576a18');
  assert.equal(__test.verifyQrCheckpointToken(token, 'another-tenant'), null);
  assert.equal(__test.verifyQrCheckpointToken(`${token.slice(0, -1)}x`, 'his-management'), null);
});

test('QR checkpoint migration isolates both checkpoint and scan tables', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'add_qr_checkpoints.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.qr_checkpoints/i);
  assert.match(sql, /create table if not exists public\.qr_checkpoint_scans/i);
  assert.match(sql, /tenant_id text not null/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all privileges.*anon, authenticated/is);
});

test('QR-required task UI disables manual completion and offers scanning', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');
  assert.match(app, /task\.qrCheckpointId && !task\.done/);
  assert.match(app, /data-qr-task=/);
  assert.match(app, /\/api\/qr-checkpoints\/scan/);
  assert.match(app, /BarcodeDetector/);
});
