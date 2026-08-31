const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.KIOSK_TOKEN_SECRET = 'tenant-test-secret';

const apiModule = require('../netlify/functions/api.js');
const {
  requestedTenantId,
  selectTenantMembership,
  eligibleTenantProfileCandidates,
  signKioskToken,
  verifyKioskToken
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

test('public requests still use the safe HIS fallback tenant', async () => {
  const response = await apiModule.handler({ path: '/api/version', httpMethod: 'GET', headers: {} });
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).version, '1.24.1');
});
