const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('hosted authentication recovers an expired password session into the sign-in form', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'app', 'auth.js'), 'utf8');
  assert.match(source, /error\.status = response\.status/);
  assert.match(source, /isExpiredPasswordSession\(error\)/);
  assert.match(source, /clearPasswordSession\(\)/);
  assert.match(source, /Your session expired\. Please sign in again\./);
});
