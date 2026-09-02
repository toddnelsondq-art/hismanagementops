const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.NODE_ENV = 'test';

const { parseFpcReportText } = require('../netlify/functions/fpc-report-parser.js');
const { supportedFpcEmailFile, fileParsedFpcReport } = require('../netlify/functions/api.js').__test;

const sampleText = `
Kelli Fleischacker @ 10204
2026 FPC Standards of Performance PRIDE Check
0.04 miles from 137 Access Way, Spicer, MN 56288-9601 US
11 Aug 2026 04:08pm CDT
Section: Exterior
Task Response
1. Does the location have an exterior customer area? Yes
1.1. Does the Signage and Trade Marks meet the
SOP No
1.1.1. Describe Signage and Trade Mark deficiencies Base of manual reader board rusting. Needs to be painted.
1.1.2. Capture photos of the Signage and Trade Mark deficiencies
1.2. Does the Exterior Lighting and Fixtures meet the SOP Yes
Section: Orange Julius Prep Equipment
Task Response
1. Does this location have Orange Julius Prep
Equipment? No
Section: Storeroom/Rear of House
Task Response
4. Does the Fire Extinguisher/Ansul System meet the SOP No
4.1. Describe the Fire Extinguisher/Ansul System
deficiencies Expired July 2026. Needs to be serviced/replaced annually.
4.2. Capture photos of the Fire Extinguisher/Ansul System deficiencies
`;

test('FPC text parser finds report metadata and only actionable No responses', () => {
  const parsed = parseFpcReportText(sampleText);
  assert.equal(parsed.storeCode, '10204');
  assert.equal(parsed.inspector, 'Kelli Fleischacker');
  assert.equal(parsed.inspectionDate, '2026-08-11');
  assert.equal(parsed.locationText, '137 Access Way, Spicer, MN 56288-9601 US');
  assert.equal(parsed.failures.length, 2);
  assert.match(parsed.failures[0].description, /Exterior · Signage and Trade Mark/);
  assert.match(parsed.failures[1].description, /Fire Extinguisher\/Ansul System/);
  assert.equal(parsed.failures.some(item => /Orange Julius/i.test(item.description)), false);
});

test('FPC email intake only accepts PDF attachments', () => {
  assert.equal(supportedFpcEmailFile({ filename: '10204-FPC.pdf', mimeType: 'application/pdf' }), true);
  assert.equal(supportedFpcEmailFile({ filename: '10204-FPC.xlsx', mimeType: 'application/vnd.ms-excel' }), false);
});

test('filing a parsed FPC report attaches the PDF and deduplicates repair items', () => {
  const records = [];
  const entry = {
    id: 'mail-1', sourceHash: 'abc123', sourceFilename: '10204-FPC.pdf', url: 'dqops-storage://bucket/report.pdf',
    inspectionDate: '2026-08-11', failures: parseFpcReportText(sampleText).failures
  };
  const location = { id: 'spicer', name: 'Spicer' };
  const first = fileParsedFpcReport({ records, entry, location });
  const second = fileParsedFpcReport({ records, entry, location });
  assert.equal(first.createdCount, 2);
  assert.equal(second.createdCount, 0);
  assert.equal(second.duplicateItemCount, 2);
  assert.equal(records.length, 1);
  assert.equal(records[0].items.length, 2);
  assert.equal(records[0].inspectionFiles.length, 1);
});

test('the API and FPC page expose email intake and review controls', () => {
  const api = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'api.js'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  assert.match(api, /\/fpc\/email-ingest/);
  assert.match(api, /FPC_INBOUND_ADDRESS/);
  assert.match(page, /id="fpcEmailAdmin"/);
  assert.match(page, /id="fpcEmailReviewList"/);
});
