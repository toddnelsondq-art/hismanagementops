const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_ANON_KEY = 'dashboard-test-anon-key';

const { dashboardPreferencesForActor } = require('../netlify/functions/api.js').__test;

const companyDefault = {
  visible: ['alerts', 'marketing', 'taskLists'],
  order: ['taskLists', 'alerts', 'marketing'],
  defaultRange: 'week',
  defaultLocationId: 'some-store'
};

test('company dashboard default applies to employees without allowing personal customization', () => {
  const result = dashboardPreferencesForActor({ __company_default__: companyDefault }, { id: 'employee-1', role: 'Employee' });
  assert.equal(result.preferences.defaultRange, 'week');
  assert.equal(result.preferences.defaultLocationId, 'all');
  assert.equal(result.customizable, false);
  assert.equal(result.companyDefaultEditable, false);
});

test('personal dashboard preferences override the company default', () => {
  const result = dashboardPreferencesForActor({
    __company_default__: companyDefault,
    'area-1': { visible: ['marketing', 'tempLogs'], defaultRange: 'month', defaultLocationId: 'store-1' }
  }, { id: 'area-1', role: 'Area Manager' });

  assert.equal(result.preferences.defaultRange, 'month');
  assert.equal(result.preferences.defaultLocationId, 'store-1');
  assert.equal(result.hasPersonalPreferences, true);
  assert.equal(result.customizable, true);
});

test('only an Owner receives company dashboard edit permission', () => {
  const director = dashboardPreferencesForActor({}, { id: 'director-1', role: 'Director of Operations' });
  const owner = dashboardPreferencesForActor({}, { id: 'owner-1', role: 'Owner' });
  assert.equal(director.companyDefaultEditable, false);
  assert.equal(owner.companyDefaultEditable, true);
});
