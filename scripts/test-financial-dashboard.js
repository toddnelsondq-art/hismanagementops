process.env.NODE_ENV = 'test';

const { normalizeDashboardPreferences, uniqueFinancialImportRows } = require('../netlify/functions/api.js').__test;

const preferences = normalizeDashboardPreferences({
  visible: ['financials', 'alerts'],
  order: ['financials', 'alerts'],
  defaultRange: 'week',
  defaultLocationId: 'all'
});
if (!preferences.visible.includes('financials')) throw new Error('The financial dashboard widget was removed from saved preferences');
if (preferences.order[0] !== 'financials') throw new Error('The financial dashboard widget order was not preserved');

const imports = uniqueFinancialImportRows([
  { id: 'third', report_date: '2026-08-29', source_hash: 'same-workbook', source_filename: 'report.xlsx' },
  { id: 'second', report_date: '2026-08-29', source_hash: 'same-workbook', source_filename: 'report.xlsx' },
  { id: 'first', report_date: '2026-08-29', source_hash: 'same-workbook', source_filename: 'report.xlsx' },
  { id: 'another-day', report_date: '2026-08-28', source_hash: 'prior-workbook', source_filename: 'report.xlsx' }
]);
if (imports.length !== 2) throw new Error(`Expected 2 unique import-history entries, received ${imports.length}`);
if (imports[0].id !== 'third') throw new Error('The newest duplicate import was not retained for display');

console.log('Financial dashboard preferences and import-history deduplication passed.');
