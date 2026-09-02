const { PDFParse } = require('pdf-parse');

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

function cleanText(value = '') {
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\t ]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inspectionDateFromText(text = '') {
  const match = String(text).match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i);
  if (!match) return '';
  const month = MONTHS[match[2].slice(0, 3).toLowerCase()];
  return `${match[3]}-${month}-${String(Number(match[1])).padStart(2, '0')}`;
}

function splitFpcTasks(text = '') {
  const lines = String(text).replace(/\r/g, '').split('\n');
  const tasks = [];
  let section = '';
  let task = null;

  const flush = () => {
    if (!task) return;
    task.text = cleanText(task.lines.join('\n'));
    delete task.lines;
    tasks.push(task);
    task = null;
  };

  for (const sourceLine of lines) {
    const line = sourceLine.trim();
    const sectionMatch = line.match(/^Section:\s*(.+)$/i);
    if (sectionMatch) {
      flush();
      section = cleanText(sectionMatch[1]);
      continue;
    }
    if (!line || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line) || /^Task\s+Response$/i.test(cleanText(line))) continue;
    const start = line.match(/^(\d+(?:\.\d+)*)\.\s+(.+)$/);
    if (start) {
      flush();
      task = { id: start[1], section, lines: [start[2]] };
    } else if (task) {
      task.lines.push(line);
    }
  }
  flush();
  return tasks;
}

function criterionLabel(questionText = '', deficiencyText = '') {
  const prompt = cleanText(deficiencyText).match(/^Describe\s+(?:the\s+)?(.+?)\s+deficienc(?:y|ies)\b/i)?.[1];
  if (prompt) return cleanText(prompt).replace(/^he\s+/i, '');
  return cleanText(questionText)
    .replace(/\s+No$/i, '')
    .replace(/^(?:Does|Do|Is|Are|Did|Has|Have)\s+(?:the\s+)?/i, '')
    .replace(/\s+meet\s+the\s+SOP(?:\s*\(NC\))?\??$/i, '')
    .replace(/\?$/, '')
    .trim();
}

function deficiencyResponse(text = '') {
  const clean = cleanText(text);
  const marker = clean.match(/\bdeficienc(?:y|ies)\b/i);
  return marker ? clean.slice(marker.index + marker[0].length).trim() : '';
}

function parseFpcReportText(text = '') {
  const clean = String(text || '').replace(/\r/g, '');
  const header = clean.split('\n').map(line => line.trim()).filter(Boolean).slice(0, 8);
  const ownerLine = header.find(line => /@\s*\d{4,6}\b/.test(line)) || '';
  const storeCode = ownerLine.match(/@\s*(\d{4,6})\b/)?.[1] || '';
  const inspector = cleanText(ownerLine.replace(/\s*@\s*\d{4,6}\b.*$/, ''));
  const locationLine = header.find(line => /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(line)) || '';
  const tasks = splitFpcTasks(clean);
  const taskMap = new Map(tasks.map(task => [`${task.section}\u0000${task.id}`, task]));
  const failures = [];

  for (const task of tasks) {
    if (!/\bNo$/i.test(task.text)) continue;
    const deficiency = taskMap.get(`${task.section}\u0000${task.id}.1`);
    if (!deficiency || !/^Describe\b/i.test(deficiency.text) || !/\bdeficienc(?:y|ies)\b/i.test(deficiency.text)) continue;
    const response = deficiencyResponse(deficiency.text);
    if (!response) continue;
    const criterion = criterionLabel(task.text, deficiency.text) || `FPC item ${task.id}`;
    failures.push({
      id: task.id,
      section: task.section || 'FPC',
      criterion,
      deficiency: response,
      description: `${task.section ? `${task.section} · ` : ''}${criterion} — ${response}`
    });
  }

  return {
    storeCode,
    inspector,
    inspectionDate: inspectionDateFromText(clean),
    locationText: cleanText(locationLine.replace(/^\d+(?:\.\d+)?\s+miles?\s+from\s+/i, '')),
    failures,
    taskCount: tasks.length
  };
}

async function parseFpcPdf(buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return { ...parseFpcReportText(result.text), pageCount: result.total || 0 };
  } finally {
    await parser.destroy();
  }
}

module.exports = { cleanText, inspectionDateFromText, splitFpcTasks, parseFpcReportText, parseFpcPdf };
