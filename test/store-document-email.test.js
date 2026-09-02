const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';
process.env.MAILGUN_WEBHOOK_SIGNING_KEY = 'document-email-test-key';
process.env.SUPABASE_URL = 'https://document-email-test.supabase.co';

const apiModule = require('../netlify/functions/api.js');
const {
  resolveDocumentEmailLocation,
  documentEmailRecipientMatches,
  supportedDocumentEmailFile,
  documentEmailCategory,
  documentEmailTitle,
  verifyMailgunRequest
} = apiModule.__test;

const locations = [
  { id: 'store-01', name: 'Roseville' },
  { id: 'store-02', name: 'North St Paul' }
];
const mappings = {
  10204: { locationId: 'store-01', locationName: 'Roseville' },
  11636: { locationId: 'store-02', locationName: 'North St Paul' }
};

test('recipient aliases and subject store numbers resolve to the saved location', () => {
  assert.equal(resolveDocumentEmailLocation({ recipient: 'inspections+11636@dqops.net', subject: 'Health inspection', filename: 'report.pdf', mappings, locations }).location.id, 'store-02');
  assert.equal(resolveDocumentEmailLocation({ recipient: 'inspections@dqops.net', subject: 'Store 10204 fire inspection', filename: 'report.pdf', mappings, locations }).location.id, 'store-01');
});

test('document intake accepts only the configured address and its numeric store aliases', () => {
  assert.equal(documentEmailRecipientMatches('inspections@dqops.net', 'inspections@dqops.net'), true);
  assert.equal(documentEmailRecipientMatches('inspections+10204@dqops.net', 'inspections@dqops.net'), true);
  assert.equal(documentEmailRecipientMatches('reports@dqops.net', 'inspections@dqops.net'), false);
  assert.equal(documentEmailRecipientMatches('inspections+nsp@dqops.net', 'inspections@dqops.net'), false);
});

test('conflicting store numbers are held for review instead of guessed', () => {
  const result = resolveDocumentEmailLocation({ recipient: 'inspections+11636@dqops.net', subject: 'Store 10204 inspection', filename: 'report.pdf', mappings, locations });
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.location, null);
});

test('location names can resolve a document when exactly one store name matches', () => {
  const result = resolveDocumentEmailLocation({ subject: 'North St Paul quarterly inspection', filename: 'inspection.pdf', mappings, locations });
  assert.equal(result.location.id, 'store-02');
});

test('document file filtering and metadata helpers support common inspection files', () => {
  assert.equal(supportedDocumentEmailFile({ filename: 'inspection.pdf', mimeType: 'application/pdf' }), true);
  assert.equal(supportedDocumentEmailFile({ filename: 'inspection.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), true);
  assert.equal(supportedDocumentEmailFile({ filename: 'program.exe', mimeType: 'application/octet-stream' }), false);
  assert.equal(documentEmailCategory('Fire inspection permit', 'report.pdf'), 'Permit');
  assert.equal(documentEmailTitle('Fwd: Health inspection', 'report.pdf'), 'Health inspection');
});

test('store document sender validation uses the verified Mailgun signature', () => {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const token = 'mailgun-document-token';
  const signature = crypto.createHmac('sha256', process.env.MAILGUN_WEBHOOK_SIGNING_KEY).update(`${timestamp}${token}`).digest('hex');
  assert.equal(verifyMailgunRequest({ timestamp, token, signature, sender: 'inspector@example.com' }, { label: 'Store document', allowedSenders: 'inspector@example.com' }), 'inspector@example.com');
  assert.throws(() => verifyMailgunRequest({ timestamp, token, signature, sender: 'unknown@example.com' }, { label: 'Store document', allowedSenders: 'inspector@example.com' }), /not approved/i);
});

test('the API and Store Documents page expose intake, mapping, and review controls', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'api.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  assert.match(api, /\/store-documents\/email-ingest/);
  assert.match(api, /sourceHash/);
  assert.match(api, /status: 'needs_review'/);
  assert.match(page, /id="storeDocsEmailAdmin"/);
  assert.match(page, /id="storeDocEmailReviewList"/);
});
