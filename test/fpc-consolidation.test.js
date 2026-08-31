const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { consolidateFpcRecords, fpcInspectionFiles } = require('../netlify/functions/api.js').__test;

test('FPC records with the same permanent location and date are consolidated', () => {
  const records = [
    {
      id: 'FPC-NEW', locationId: 'portland', locationName: 'Minneapolis', inspectionDate: '2026-07-17',
      inspectionUrl: 'https://example.com/portland.pdf', inspectionName: 'Portland report.pdf', items: [], active: true,
      createdAt: '2026-08-30T20:00:00.000Z'
    },
    {
      id: 'FPC-OLD', locationId: 'portland', locationName: 'Portland', inspectionDate: '2026-07-17',
      items: [{ id: 'repair-1', description: 'Repair wall', status: 'Open' }], active: true,
      createdAt: '2026-08-29T20:00:00.000Z'
    }
  ];

  const result = consolidateFpcRecords(records, [{ id: 'portland', name: 'Portland' }]);

  assert.equal(result.changed, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].locationName, 'Portland');
  assert.equal(result.records[0].items.length, 1);
  assert.equal(result.records[0].inspectionUrl, 'https://example.com/portland.pdf');
  assert.equal(result.records[0].inspectionFiles.length, 1);
  assert.equal(result.records[0].createdAt, '2026-08-29T20:00:00.000Z');

  const secondPass = consolidateFpcRecords(result.records, [{ id: 'portland', name: 'Portland' }]);
  assert.equal(secondPass.changed, false);
  assert.deepEqual(secondPass.records, result.records);
});

test('FPC records for different permanent locations or dates remain separate', () => {
  const records = [
    { id: 'one', locationId: 'portland', locationName: 'Portland', inspectionDate: '2026-07-17', items: [], active: true },
    { id: 'two', locationId: 'lyndale', locationName: 'Lyndale', inspectionDate: '2026-07-17', items: [], active: true },
    { id: 'three', locationId: 'portland', locationName: 'Portland', inspectionDate: '2026-08-17', items: [], active: true }
  ];

  const result = consolidateFpcRecords(records, [
    { id: 'portland', name: 'Portland' },
    { id: 'lyndale', name: 'Lyndale' }
  ]);

  assert.equal(result.records.length, 3);
});

test('duplicate inspection links are kept only once', () => {
  assert.deepEqual(fpcInspectionFiles({
    inspectionFiles: [
      { url: 'https://example.com/report.pdf', name: 'Report' },
      { url: 'https://example.com/report.pdf', name: 'Duplicate' }
    ]
  }), [{ url: 'https://example.com/report.pdf', name: 'Report' }]);
});
