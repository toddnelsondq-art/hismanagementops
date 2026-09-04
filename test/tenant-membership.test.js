const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.KIOSK_TOKEN_SECRET = 'tenant-test-secret';
process.env.SUPABASE_URL = 'https://tenant-security-test.supabase.co';

const apiModule = require('../netlify/functions/api.js');
const {
  requestedTenantId,
  selectTenantMembership,
  eligibleTenantProfileCandidates,
  signKioskToken,
  verifyKioskToken,
  storageObjectReference,
  parseStorageObject,
  tenantStoragePath,
  storageObjectAllowedForTenant,
  dehydrateStorageReferences
} = apiModule.__test;

test('requested tenant header is normalized', () => {
  assert.equal(requestedTenantId({ headers: { 'X-DQOPS-Tenant': ' New Customer, Inc. ' } }), 'new-customer-inc');
  assert.equal(requestedTenantId({ headers: {} }), '');
});

test('membership selection honors only allowed tenants', () => {
  const memberships = [
    { tenant_id: 'customer-b', active: true, is_default: false },
    { tenant_id: 'his-management', active: true, is_default: true },
    { tenant_id: 'inactive-customer', active: false, is_default: false }
  ];

  assert.equal(selectTenantMembership(memberships).tenant_id, 'his-management');
  assert.equal(selectTenantMembership(memberships, 'customer-b').tenant_id, 'customer-b');
  assert.equal(selectTenantMembership(memberships, 'not-allowed'), null);
  assert.equal(selectTenantMembership(memberships, 'inactive-customer'), null);
});

test('stale Auth links can self-heal without bypassing a revoked membership', () => {
  const authUser = { id: 'current-auth-id' };
  const candidates = [
    { id: 'invited', auth_user_id: null },
    { id: 'stale', auth_user_id: 'old-auth-id' },
    { id: 'revoked', auth_user_id: 'current-auth-id' }
  ];

  assert.deepEqual(
    eligibleTenantProfileCandidates(candidates, authUser, true).map(candidate => candidate.id),
    ['invited', 'stale']
  );
  assert.equal(eligibleTenantProfileCandidates(candidates, authUser, false).length, 3);
});

test('signed kiosk tokens cannot be reused across tenants', () => {
  const token = signKioskToken({
    type: 'session',
    tenantId: 'his-management',
    userId: 'employee-1',
    exp: Math.floor(Date.now() / 1000) + 60
  });

  assert.equal(verifyKioskToken(token, 'session', 'his-management').tenantId, 'his-management');
  assert.equal(verifyKioskToken(token, 'session', 'another-tenant'), null);
  assert.equal(verifyKioskToken(`${token}changed`, 'session', 'his-management'), null);
});

test('new uploads are stored inside the active tenant and location prefix', () => {
  const pathname = tenantStoragePath({
    locationId: 'North St. Paul',
    kind: 'FPC Photos',
    name: 'Ice Machine.jpg',
    mimeType: 'image/jpeg'
  });

  assert.match(pathname, /^v2\/his-management\/north-st.-paul\/fpc-photos\//);
  assert.match(pathname, /-ice-machine\.jpg$/);
  assert.equal(storageObjectAllowedForTenant({ pathname }), true);
  assert.equal(storageObjectAllowedForTenant({ pathname: 'v2/another-tenant/store-01/photo.jpg' }), false);
});

test('storage references preserve paths and convert legacy Supabase URLs', () => {
  const reference = storageObjectReference('dailyops-uploads', 'v2/his-management/store-01/example.jpg');
  assert.equal(reference, 'dqops-storage://dailyops-uploads/v2/his-management/store-01/example.jpg');
  assert.deepEqual(parseStorageObject(reference), {
    bucket: 'dailyops-uploads',
    pathname: 'v2/his-management/store-01/example.jpg'
  });

  const publicUrl = 'https://tenant-security-test.supabase.co/storage/v1/object/public/dailyops-uploads/legacy/example.jpg';
  assert.equal(
    dehydrateStorageReferences(publicUrl),
    'dqops-storage://dailyops-uploads/legacy/example.jpg'
  );
  assert.equal(dehydrateStorageReferences('https://example.com/photo.jpg'), 'https://example.com/photo.jpg');
});

test('legacy storage objects remain available only to the original HIS tenant', () => {
  assert.equal(storageObjectAllowedForTenant({ pathname: 'maintenance/legacy.pdf' }), true);
});

test('public requests still use the safe HIS fallback tenant', async () => {
  const response = await apiModule.handler({ path: '/api/version', httpMethod: 'GET', headers: {} });
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).version, '1.35.0');
});
