const fs = require('fs');
const parser = require('../app/financial-reports.js');

const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: node scripts/test-financial-parser.js <workbook-rows.json>');
const rows = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const result = parser.parseWorkbookRows(rows);
if (result.errors.length) throw new Error(result.errors.join('\n'));
if (!result.reports.length) throw new Error('No financial reports were parsed');
for (const report of result.reports) {
  if (!report.businessDate || !report.sourceStoreLabel) throw new Error('A parsed report is missing its store or date');
  if (!Number.isFinite(report.netSales) || !Number.isFinite(report.laborPercent)) throw new Error(`${report.sourceStoreLabel} is missing required metrics`);
}
const testLocations = [
  'Spicer', 'Somerset', 'Lindstrom', 'Mahtomedi', 'North St Paul', 'Roseville DQ',
  'Minneapolis', 'Richfield', 'Redwood Falls', 'Willmar', 'Olivia', 'Hixson'
].map((name, index) => ({ id: `location-${index + 1}`, name }));
const mapped = parser.autoMapLocations(result.reports, testLocations);
if (mapped.some(report => !report.locationId)) {
  throw new Error(`Automatic location matching failed for: ${mapped.filter(report => !report.locationId).map(report => report.sourceStoreLabel).join(', ')}`);
}
if (new Set(mapped.map(report => report.locationId)).size !== mapped.length) {
  throw new Error('Automatic location matching assigned the same DQ OPS location more than once');
}
console.log(JSON.stringify({
  reportCount: result.reports.length,
  businessDate: result.reports[0].businessDate,
  automaticLocationMatches: mapped.length,
  stores: result.reports.map(report => ({
    store: report.sourceStoreLabel,
    netSales: report.netSales,
    netSalesLy: report.netSalesLy,
    laborPercent: report.laborPercent,
    transactions: report.transactionCount
  }))
}, null, 2));
