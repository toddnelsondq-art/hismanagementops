const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseSmgScorecardText } = require('../netlify/functions/smg-scorecard-parser.js');

const SAMPLE = `Monthly Store Summary Report August, 2026
Restaurant: 10204 - SPICER Previous Three
months
Overall Satisfaction
vs. DMA Average
67%
Overall
Previous 3 Months
Vs. System
Average
75%
Total Customer
Responses
178
Target: 30
DMA Rank Order
#94 of 143
vs. DMA Average
68%
On-site
Previous 3 Months
Vs. System
Average
72%
Total Customer
Responses
150
Target: 30
DMA Rank Order
#106 of 140
vs. DMA Average
62%
Digital
Previous 3 Months
Vs. System
Average
65%
Total Customer
Responses
28*
Target: 30
DMA Rank Order
N/A
-- 1 of 2 --
WHERE SHOULD I FOCUS - ON-SITE
Exterior Cleanliness Friendliness of Staff
On-site: this is the experience from Drive-Thru fans.
WHERE SHOULD I FOCUS - DIGITAL
Portion Size of Order Taste of Order
Action #2
-- 2 of 2 --`;

test('parses SMG monthly PDF scorecards, benchmarks, and focus areas', () => {
  const result = parseSmgScorecardText(SAMPLE);
  assert.equal(result.type, 'monthly-scorecard');
  assert.equal(result.scorecards.length, 1);
  const card = result.scorecards[0];
  assert.equal(card.storeCode, '10204');
  assert.equal(card.reportMonth, '2026-08');
  assert.deepEqual([card.start, card.end], ['2026-06-01', '2026-08-31']);
  assert.equal(card.benchmarks.overall.responseCount, 178);
  assert.equal(card.benchmarks.digital.lowSample, true);
  assert.deepEqual(card.onsiteFocusAreas.sort(), ['Exterior Cleanliness', 'Friendliness of Staff'].sort());
  assert.deepEqual(card.digitalFocusAreas.sort(), ['Portion Size of Order', 'Taste of Order'].sort());
});

test('monthly scorecards are tenant-private and rendered separately in Resources', () => {
  const root = path.join(__dirname, '..');
  const migration = fs.readFileSync(path.join(root, 'supabase/add_smg_monthly_scorecards.sql'), 'utf8');
  const api = fs.readFileSync(path.join(root, 'netlify/functions/api.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
  assert.match(migration, /unique \(tenant_id, location_id, report_month\)/i);
  assert.match(migration, /alter table public\.public_review_scorecards enable row level security/i);
  assert.match(migration, /revoke all privileges on table public\.public_review_scorecards from anon, authenticated/i);
  assert.match(api, /parseSmgScorecardPdf\(file\.buffer\)/);
  assert.match(api, /on_conflict=tenant_id,location_id,report_month/);
  assert.match(page, /id="publicReviewScorecards"/);
});
