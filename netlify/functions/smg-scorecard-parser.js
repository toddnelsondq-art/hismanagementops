const { PDFParse } = require('pdf-parse');

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

const FOCUS_MEASURES = [
  'Overall Satisfaction', 'Taste of Order', 'Accuracy of Order', 'Portion Size of Order',
  'Speed of Service', 'Friendliness of Staff', 'Interior Cleanliness', 'Exterior Cleanliness',
  'Burger Likelihood to Repurchase', 'Blizzard Upside Down', 'Experienced Problem', 'Problem Resolution'
];

function scorecardPeriod(text = '') {
  const match = String(text).match(/Monthly Store Summary Report\s+([A-Za-z]+),\s*(20\d{2})/i);
  const month = MONTHS[String(match?.[1] || '').toLowerCase()];
  const year = Number(match?.[2]);
  if (month === undefined || !year) return { reportMonth: '', start: '', end: '' };
  const end = new Date(Date.UTC(year, month + 1, 0));
  const start = new Date(Date.UTC(year, month - 2, 1));
  return {
    reportMonth: `${year}-${String(month + 1).padStart(2, '0')}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function focusAreas(text = '', channel = 'ON-SITE') {
  const nextChannel = channel === 'ON-SITE' ? 'On-site:' : 'Action #2';
  const match = String(text).match(new RegExp(`WHERE SHOULD I FOCUS - ${channel}\\s+([\\s\\S]*?)\\s+${nextChannel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'));
  if (!match) return [];
  const areaText = match[1].replace(/\s+/g, ' ').trim();
  return FOCUS_MEASURES.filter(measure => areaText.toLowerCase().includes(measure.toLowerCase())).slice(0, 2);
}

function benchmarkSummaries(text = '') {
  const summaries = {};
  const pattern = /vs\. DMA Average\s+(\d+)%\s+(Overall|On-site|Digital)\s+Previous 3 Months\s+Vs\. System\s+Average\s+(\d+)%\s+Total Customer\s+Responses\s+(\d+)\*?\s+Target:\s*\d+\s+DMA Rank Order\s+([^\n]+)/gi;
  for (const match of String(text).matchAll(pattern)) {
    const key = match[2].toLowerCase().replace('-', '');
    const rankMatch = match[5].trim().match(/#(\d+)\s+of\s+(\d+)/i);
    summaries[key] = {
      dmaAverage: Number(match[1]) / 100,
      systemAverage: Number(match[3]) / 100,
      responseCount: Number(match[4]),
      dmaRank: rankMatch ? Number(rankMatch[1]) : null,
      dmaRankPopulation: rankMatch ? Number(rankMatch[2]) : null,
      lowSample: /\*/.test(match[0])
    };
  }
  return summaries;
}

function parseSmgScorecardText(text = '') {
  const pages = String(text || '').replace(/\r/g, '').split(/\n\s*--\s*\d+\s+of\s+\d+\s*--\s*\n/i).filter(page => page.trim());
  const scorecards = [];
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const restaurant = page.match(/Restaurant:\s*(\d{4,6})\s*-\s*(.+?)\s+Previous Three\s+months/i);
    if (!restaurant) continue;
    const period = scorecardPeriod(page);
    const actionPage = pages[index + 1] || '';
    scorecards.push({
      storeCode: restaurant[1],
      storeName: restaurant[2].replace(/\s+/g, ' ').trim(),
      ...period,
      benchmarks: benchmarkSummaries(page),
      onsiteFocusAreas: focusAreas(actionPage, 'ON-SITE'),
      digitalFocusAreas: focusAreas(actionPage, 'DIGITAL')
    });
  }
  if (!scorecards.length) throw new Error('The PDF does not match an SMG Monthly Store Summary Report');
  return { type: 'monthly-scorecard', scorecards, pageCount: pages.length };
}

async function parseSmgScorecardPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return { ...parseSmgScorecardText(result.text), pageCount: result.total || 0 };
  } finally {
    await parser.destroy();
  }
}

module.exports = { scorecardPeriod, focusAreas, benchmarkSummaries, parseSmgScorecardText, parseSmgScorecardPdf };
