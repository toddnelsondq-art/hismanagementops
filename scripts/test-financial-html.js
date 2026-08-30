const parser = require('../app/financial-reports.js');

const cells = [
  [70, 41, 'Location'], [141, 41, 'Store 11439'],
  [70, 65, 'For Period of'], [141, 65, 'Friday, August 28, 2026'],
  [32, 273, 'Total Sales'], [111, 273, '2464.56'], [184, 273, '81.53'], [248, 273, '2383.03'], [320, 273, '100.00'], [368, 273, '2992.21'],
  [32, 417, 'Total'], [118, 418, '177'], [184, 418, '2383.03'], [246, 418, '13.46'], [320, 418, '100.00'], [368, 418, '232'],
  [32, 465, 'Total Labor Hours'], [192, 465, '37.80'],
  [32, 481, 'Staff Labor Gross'], [192, 481, '494.07'],
  [32, 513, 'Total Labor % of Net Sales'], [192, 513, '20.73'],
  [32, 529, 'Sales Per Labor Hour'], [192, 529, '63.04'],
  [32, 593, 'Average Hourly Wage'], [192, 593, '13.07'],
  [504, 593, 'Cash Over/Short'], [680, 594, '(591.16)']
];
const html = cells.map(([left, top, text]) => `<DIV style="left:${left}PX;top:${top}PX;width:100PX;height:16PX;"><span>${text}</span></DIV>`).join('\n');
const parsed = parser.parseFinancialHtml(html);
const report = parsed.reports[0];
if (parsed.errors.length) throw new Error(parsed.errors.join('\n'));
if (report.sourceStoreCode !== '11439') throw new Error(`Expected store 11439, received ${report.sourceStoreCode}`);
if (report.businessDate !== '2026-08-28') throw new Error(`Expected 2026-08-28, received ${report.businessDate}`);
if (report.netSales !== 2383.03 || report.laborPercent !== 0.2073 || report.cashOverShort !== -591.16) throw new Error('HTML metrics were not parsed correctly');

const mapped = parser.autoMapLocations([
  { sourceStoreCode: '13260', sourceStoreName: 'Willmar', sourceStoreLabel: '13260-Willmar' }
], [
  { id: 'hwy-12', name: 'Willmar Hwy 12' },
  { id: 'first-st', name: '13260 Willmar 1st St' }
]);
if (mapped[0].locationId !== 'first-st') throw new Error('Exact store-number matching did not win over the similar city name');

console.log('Financial HTML parsing and exact store-number mapping passed.');
