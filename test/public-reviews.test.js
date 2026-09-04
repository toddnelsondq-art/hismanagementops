const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.APP_TENANT_ID = 'his-management';
process.env.REVIEW_INGEST_API_KEYS = JSON.stringify({ 'his-management': 'a-long-test-review-ingestion-secret' });

const { __test } = require('../netlify/functions/api.js');

test('review ingestion credentials are tenant scoped', () => {
  const event = { headers: { authorization: 'Bearer a-long-test-review-ingestion-secret', 'x-dqops-tenant': 'his-management' } };
  assert.equal(__test.reviewIntegrationTenant(event), 'his-management');
  assert.equal(__test.reviewIntegrationTenant({ headers: { ...event.headers, authorization: 'Bearer incorrect' } }), '');
  assert.equal(__test.reviewIntegrationTenant({ headers: { ...event.headers, 'x-dqops-tenant': 'another-tenant' } }), '');
});

test('review payloads are normalized and bounded', () => {
  const record = __test.normalizedReviewInput({
    locationId: 'store-01', source: 'Google Business', externalReviewId: 'abc-123', rating: 4.5,
    reviewUrl: 'https://example.com/review/abc-123', reviewText: 'Helpful staff', reviewedAt: '2026-09-03T18:42:00Z',
    sentiment: 'Positive', topics: ['service', 'service', 'staff']
  });
  assert.equal(record.tenant_id, 'his-management');
  assert.equal(record.source, 'google-business');
  assert.equal(record.rating, 4.5);
  assert.deepEqual(record.topics, ['service', 'staff']);
  assert.throws(() => __test.normalizedReviewInput({ locationId: 'store-01', source: 'google', externalReviewId: 'bad', rating: 6 }), /between 0 and 5/);
});

test('public review migration is tenant and location isolated', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'add_public_reviews.sql'), 'utf8');
  assert.match(sql, /create table if not exists public\.public_reviews/i);
  assert.match(sql, /unique \(tenant_id, source, external_review_id\)/i);
  assert.match(sql, /foreign key \(tenant_id, location_id\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all privileges.*anon, authenticated/is);
});

