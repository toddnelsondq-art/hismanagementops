(function initializeFinancialReports(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DqOpsFinancialReports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function financialReportFactory() {
  function finiteNumber(value) {
    if (value === null || value === undefined || value === '' || value === '-') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const number = Number(String(value).replace(/[$,%\s,]/g, '').replace(/^\((.*)\)$/, '-$1'));
    return Number.isFinite(number) ? number : null;
  }

  function percentNumber(value) {
    const number = finiteNumber(value);
    return number !== null && number > 1 && number <= 100 ? number / 100 : number;
  }

  function excelDate(value) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number' && value > 20000 && value < 80000) {
      return new Date(Math.round((value - 25569) * 86400000)).toISOString().slice(0, 10);
    }
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
    if (!match) return '';
    const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
    return `${year}-${String(Number(match[1])).padStart(2, '0')}-${String(Number(match[2])).padStart(2, '0')}`;
  }

  function cellText(value) {
    return String(value ?? '').trim();
  }

  function findLabelIndex(row, label) {
    const expected = label.toLowerCase();
    return row.findIndex(value => cellText(value).toLowerCase() === expected);
  }

  function numberAfterLabel(row, label) {
    const index = findLabelIndex(row, label);
    if (index < 0) return null;
    for (let column = index + 1; column < row.length; column += 1) {
      const value = finiteNumber(row[column]);
      if (value !== null) return value;
    }
    return null;
  }

  function sectionValue(rows, start, end, label) {
    for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
      const value = numberAfterLabel(rows[rowIndex] || [], label);
      if (value !== null) return value;
    }
    return null;
  }

  function dateAfterLabel(rows, start, end, label) {
    for (let rowIndex = start; rowIndex < Math.min(end, start + 8); rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const index = findLabelIndex(row, label);
      if (index < 0) continue;
      for (let column = index + 1; column < row.length; column += 1) {
        const date = excelDate(row[column]);
        if (date) return date;
      }
    }
    return '';
  }

  function storeIdentity(value) {
    const raw = cellText(value);
    const match = raw.match(/^(\d{4,6})[-_\s]*(.*)$/);
    const code = match?.[1] || '';
    const remainder = (match?.[2] || raw).replace(/^[-_\s]+/, '').trim();
    const displayName = remainder.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return { raw, code, name: displayName || raw };
  }

  function parseSection(rows, start, end, sectionNumber) {
    const storeCell = (rows[start + 2] || []).find(value => cellText(value));
    const store = storeIdentity(storeCell);
    const currentDate = dateAfterLabel(rows, start, end, 'Current Dates:');
    const comparisonDate = dateAfterLabel(rows, start, end, 'LY Dates:');
    let categoryTotals = null;
    let destinationTotals = null;
    let laborHours = null;
    let laborCost = null;
    let laborPercent = null;

    for (let rowIndex = start; rowIndex < end; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const label = cellText(row[0]);
      if (label === 'Totals' && categoryTotals === null && finiteNumber(row[9]) !== null) {
        categoryTotals = {
          grossSales: finiteNumber(row[2]),
          totalDiscounts: finiteNumber(row[5]),
          netSales: finiteNumber(row[9]),
          netSalesLy: finiteNumber(row[17])
        };
      } else if (label === 'Totals' && destinationTotals === null && finiteNumber(row[2]) !== null && finiteNumber(row[3]) !== null && finiteNumber(row[6]) !== null) {
        destinationTotals = {
          transactions: finiteNumber(row[2]),
          transactionsLy: finiteNumber(row[3]),
          netSales: finiteNumber(row[6]),
          averageTicket: finiteNumber(row[11]),
          netSalesLy: finiteNumber(row[17])
        };
      } else if (label === 'Hourly Labor Hours') laborHours = finiteNumber(row[5]);
      else if (label === 'Hourly Labor Gross') laborCost = finiteNumber(row[5]);
      else if (label === 'Hourly Labor % of Net Sales') laborPercent = percentNumber(row[5]);
    }

    const errors = [];
    if (!store.raw) errors.push('Store name was not found');
    if (!currentDate) errors.push('Current report date was not found');
    if (!categoryTotals || categoryTotals.netSales === null) errors.push('Category Sales net total was not found');
    if (!destinationTotals) errors.push('Transaction totals were not found');
    if (laborPercent === null) errors.push('Labor percentage was not found');

    return {
      sectionNumber,
      sourceStoreCode: store.code,
      sourceStoreName: store.name,
      sourceStoreLabel: store.raw,
      businessDate: currentDate,
      comparisonDate,
      grossSales: categoryTotals?.grossSales ?? null,
      totalDiscounts: categoryTotals?.totalDiscounts ?? null,
      netSales: categoryTotals?.netSales ?? null,
      netSalesLy: categoryTotals?.netSalesLy ?? null,
      transactionCount: destinationTotals?.transactions ?? null,
      transactionCountLy: destinationTotals?.transactionsLy ?? null,
      averageTicket: destinationTotals?.averageTicket ?? null,
      laborHours,
      laborCost,
      laborPercent,
      salesPerLaborHour: sectionValue(rows, start, end, 'Sales per Labor Hour'),
      averageHourlyWage: sectionValue(rows, start, end, 'Average Hourly Wage'),
      digitalSales: sectionValue(rows, start, end, 'Total Digital Sales'),
      cashOverShort: sectionValue(rows, start, end, 'Cash Over/Short'),
      cancelCount: sectionValue(rows, start, end, 'Cancels'),
      voidCount: sectionValue(rows, start, end, 'Voids'),
      errors
    };
  }

  function parseWorkbookRows(rows) {
    if (!Array.isArray(rows) || !rows.length) throw new Error('The workbook does not contain any readable rows');
    const headers = [];
    rows.forEach((row, index) => {
      if (cellText(row?.[0]).toLowerCase() === 'day-to-day financial recap ly') headers.push(index);
    });
    if (!headers.length) throw new Error('This does not appear to be a Day-to-Day Financial Recap LY workbook');
    const reports = headers.map((start, index) => parseSection(rows, start, headers[index + 1] ?? rows.length, index + 1));
    return {
      reports,
      errors: reports.flatMap(report => report.errors.map(message => `${report.sourceStoreLabel || `Section ${report.sectionNumber}`}: ${message}`))
    };
  }

  function normalizeLocationName(value) {
    return cellText(value)
      .toLowerCase()
      .replace(/^\d{4,6}[-_\s]*/, '')
      .replace(/\bsaint\b/g, 'st')
      .replace(/\bdairy queen\b|\bdq\b|\bstore\b/g, ' ')
      .replace(/\b(mn|minnesota|wi|wisconsin|tn|tennessee)\b/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function locationMatchScore(report, location) {
    const source = normalizeLocationName(report.sourceStoreName || report.sourceStoreLabel);
    const target = normalizeLocationName(location.name);
    if (!source || !target) return 0;
    if (source === target) return 1;
    if (source.includes(target) || target.includes(source)) return 0.9;
    const sourceTokens = new Set(source.split(' '));
    const targetTokens = new Set(target.split(' '));
    const shared = [...sourceTokens].filter(token => targetTokens.has(token)).length;
    return shared / Math.max(sourceTokens.size, targetTokens.size);
  }

  function suggestLocation(report, locations, alreadyUsed = new Set()) {
    const matches = (locations || [])
      .filter(location => !alreadyUsed.has(location.id))
      .map(location => ({ location, score: locationMatchScore(report, location) }))
      .sort((a, b) => b.score - a.score);
    return matches[0]?.score >= 0.55 ? matches[0].location : null;
  }

  function autoMapLocations(reports, locations) {
    const used = new Set();
    return (reports || []).map(report => {
      const location = suggestLocation(report, locations, used);
      if (location) used.add(location.id);
      return { ...report, locationId: location?.id || '' };
    });
  }

  return { finiteNumber, excelDate, parseWorkbookRows, normalizeLocationName, autoMapLocations };
});
