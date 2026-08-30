process.env.NODE_ENV = 'test';

const { financialDateRange } = require('../netlify/functions/api.js').__test;

const cases = [
  ['day', '2026-08-29', { start: '2026-08-29', end: '2026-08-29' }],
  ['week', '2026-08-29', { start: '2026-08-23', end: '2026-08-29' }],
  ['week', '2026-08-30', { start: '2026-08-30', end: '2026-08-30' }],
  ['month', '2026-08-29', { start: '2026-08-01', end: '2026-08-29' }]
];

for (const [range, anchor, expected] of cases) {
  const actual = financialDateRange(range, anchor);
  if (actual.start !== expected.start || actual.end !== expected.end) {
    throw new Error(`${range} at ${anchor}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

console.log(`Financial date ranges passed (${cases.length} cases).`);
