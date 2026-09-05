const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSmgRows, stableCommentId } = require('../netlify/functions/smg-report-parser.js');

process.env.NODE_ENV = 'test';
const api = require('../netlify/functions/api.js').__test;

test('parses SMG comment reports with variable header rows and deduplicates stable comments', () => {
  const rows = [
    ['Comments: 8/24/2026 - 8/30/2026'],
    ['Visit Date as of: 8/30/2026'],
    ['Informational note'],
    ['Visit Date', 'Unit', 'Survey Item', 'Comment Text', 'Visit Date'],
    [new Date('2026-08-29T12:00:00Z'), '10204 - SPICER, MN, 137 ACCESS WAY', 'Why Highly Satisfied', 'Friendly and quick.', new Date('2026-08-28T12:00:00Z')]
  ];
  const result = parseSmgRows(rows);
  assert.equal(result.type, 'comments');
  assert.deepEqual(result.period, { start: '2026-08-24', end: '2026-08-30' });
  assert.equal(result.comments[0].storeCode, '10204');
  assert.equal(result.comments[0].surveyItem, 'Why Highly Satisfied');
  assert.equal(result.comments[0].externalReviewId, stableCommentId(result.comments[0]));
});

test('parses SMG comparison reports and their response counts', () => {
  const rows = [
    ['Comparison: 8/1/2026 - 8/31/2026, Last Year (Same Period): 8/1/2025 - 8/31/2025'],
    ['Restaurant', 'Measure', 'Current', 'Last Year (Same Period)', 'Difference', 'Count', 'Current', 'Last Year (Same Period)'],
    ['10204 - SPICER, MN, 137 ACCESS WAY', 'Overall Satisfaction', 0.92, 0.88, 0.04, 10, 25, 21]
  ];
  const result = parseSmgRows(rows);
  assert.equal(result.type, 'comparison');
  assert.equal(result.metrics[0].current, 0.92);
  assert.equal(result.metrics[0].responseCount, 25);
  assert.equal(result.metrics[0].previousResponseCount, 21);
});

test('SMG helper validation accepts workbooks and assigns conservative sentiment', () => {
  assert.equal(api.supportedSmgReportFile({ filename: 'CommentReport.xlsx' }), true);
  assert.equal(api.supportedSmgReportFile({ filename: 'MonthlySummary.pdf' }), true);
  assert.equal(api.supportedSmgReportFile({ filename: 'report.txt' }), false);
  assert.equal(api.smgSentiment('Why Not Satisfied'), 'negative');
  assert.equal(api.smgSentiment('Exceptional Service'), 'positive');
  assert.equal(api.smgSentiment('Crew Member Name'), 'neutral');
});

test('SMG email intake is signed, allowlisted, tenant-private, and visible in Resources', () => {
  const root = path.join(__dirname, '..');
  const apiSource = fs.readFileSync(path.join(root, 'netlify/functions/api.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase/add_smg_review_email_ingest.sql'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
  assert.match(apiSource, /apiPath === '\/reviews\/email-ingest'/);
  assert.match(apiSource, /verifyMailgunRequest\(fields, \{ label: 'SMG review', allowedSenders \}\)/);
  assert.match(apiSource, /documentEmailRecipientMatches\(recipient, process\.env\.SMG_REVIEW_INBOUND_ADDRESS/);
  for (const table of ['public_review_metrics', 'review_insights', 'smg_report_imports']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(migration, /revoke all privileges on table public\.public_review_metrics, public\.review_insights, public\.smg_report_imports from anon, authenticated/i);
  assert.match(page, /id="publicReviewInsight"/);
  assert.match(page, /id="publicReviewMetrics"/);
});
