const crypto = require('crypto');
const XLSX = require('xlsx');

function cleanText(value = '') {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  const parsed = new Date(cleanText(value));
  return Number.isNaN(parsed.valueOf()) ? '' : parsed.toISOString();
}

function reportPeriod(rows = []) {
  for (const row of rows.slice(0, 8)) {
    const text = cleanText(row?.[0]);
    const match = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
    if (match) return { start: isoDate(`${match[1]} 12:00:00`).slice(0, 10), end: isoDate(`${match[2]} 12:00:00`).slice(0, 10) };
  }
  return { start: '', end: '' };
}

function unitDetails(value = '') {
  const text = cleanText(value);
  const match = text.match(/^(\d{4,6})\s+-\s+(.+)$/);
  return { storeCode: match?.[1] || '', unitName: match?.[2] || text };
}

function headerIndex(rows = [], required = []) {
  return rows.slice(0, 12).findIndex(row => required.every(header => row.some(value => cleanText(value).toLowerCase() === header.toLowerCase())));
}

function stableCommentId(comment = {}) {
  const identity = [comment.storeCode, comment.visitDate, comment.surveyItem, comment.commentText].map(value => cleanText(value).toLowerCase()).join('|');
  return crypto.createHash('sha256').update(identity).digest('hex');
}

function parseSmgRows(rows = []) {
  const period = reportPeriod(rows);
  const commentHeader = headerIndex(rows, ['Unit', 'Survey Item', 'Comment Text']);
  if (commentHeader >= 0) {
    const header = rows[commentHeader].map(value => cleanText(value));
    const index = name => header.findIndex(value => value.toLowerCase() === name.toLowerCase());
    const commentDateIndex = index('Comment Date');
    const visitDateIndexes = header.map((value, position) => value.toLowerCase() === 'visit date' ? position : -1).filter(position => position >= 0);
    const comments = rows.slice(commentHeader + 1).map(row => {
      const unit = unitDetails(row[index('Unit')]);
      const comment = {
        ...unit,
        surveyItem: cleanText(row[index('Survey Item')]),
        commentText: cleanText(row[index('Comment Text')]),
        commentDate: isoDate(commentDateIndex >= 0 ? row[commentDateIndex] : row[visitDateIndexes[0]]),
        visitDate: isoDate(row[visitDateIndexes.at(-1)])
      };
      return { ...comment, externalReviewId: stableCommentId(comment) };
    }).filter(comment => comment.storeCode && comment.surveyItem && comment.commentText);
    return { type: 'comments', period, comments, metrics: [] };
  }

  const comparisonHeader = headerIndex(rows, ['Restaurant', 'Measure', 'Difference']);
  if (comparisonHeader >= 0) {
    const metrics = rows.slice(comparisonHeader + 1).map(row => {
      const unit = unitDetails(row[0]);
      return {
        ...unit,
        measure: cleanText(row[1]),
        current: Number.isFinite(Number(row[2])) ? Number(row[2]) : null,
        previous: Number.isFinite(Number(row[3])) ? Number(row[3]) : null,
        difference: Number.isFinite(Number(row[4])) ? Number(row[4]) : null,
        responseCount: Number.isFinite(Number(row[6])) ? Number(row[6]) : (Number.isFinite(Number(row[5])) ? Number(row[5]) : null),
        previousResponseCount: Number.isFinite(Number(row[7])) ? Number(row[7]) : null
      };
    }).filter(metric => metric.storeCode && metric.measure && metric.current !== null);
    return { type: 'comparison', period, comments: [], metrics };
  }
  throw new Error('The workbook does not match an SMG comment or comparison report');
}

function parseSmgWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) throw new Error('The workbook does not contain a worksheet');
  return parseSmgRows(XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: true }));
}

module.exports = { parseSmgRows, parseSmgWorkbook, stableCommentId, unitDetails, reportPeriod };
