process.env.NODE_ENV = 'test';
process.env.MAILGUN_WEBHOOK_SIGNING_KEY = 'test-signing-key';
process.env.FINANCIAL_REPORT_ALLOWED_SENDERS = 'reports@example.com';

const crypto = require('crypto');
const { parseMultipartForm, parseFinancialAttachment, verifyMailgunRequest } = require('../netlify/functions/api.js').__test;

const timestamp = String(Math.floor(Date.now() / 1000));
const token = 'test-token';
const signature = crypto.createHmac('sha256', process.env.MAILGUN_WEBHOOK_SIGNING_KEY).update(`${timestamp}${token}`).digest('hex');
const html = [
  [70, 41, 'Location'], [141, 41, 'Store 11439'],
  [70, 65, 'For Period of'], [141, 65, 'Friday, August 28, 2026'],
  [32, 273, 'Total Sales'], [111, 273, '2464.56'], [184, 273, '81.53'], [248, 273, '2383.03'], [320, 273, '100.00'], [368, 273, '2992.21'],
  [32, 417, 'Total'], [118, 418, '177'], [184, 418, '2383.03'], [246, 418, '13.46'], [368, 418, '232'],
  [32, 465, 'Total Labor Hours'], [192, 465, '37.80'], [32, 481, 'Staff Labor Gross'], [192, 481, '494.07'],
  [32, 513, 'Total Labor % of Net Sales'], [192, 513, '20.73']
].map(([left, top, text]) => `<DIV style="left:${left}PX;top:${top}PX;width:100PX;height:16PX;"><span>${text}</span></DIV>`).join('\n');
const boundary = 'dqops-test-boundary';
const parts = [];
function field(name, value) {
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
}
field('timestamp', timestamp);
field('token', token);
field('signature', signature);
field('sender', 'reports@example.com');
parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="attachment-1"; filename="Recap.html"\r\nContent-Type: text/html\r\n\r\n${html}\r\n`);
parts.push(`--${boundary}--\r\n`);

(async () => {
  const event = {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.from(parts.join('')).toString('base64'),
    isBase64Encoded: true
  };
  const parsed = await parseMultipartForm(event);
  if (verifyMailgunRequest(parsed.fields) !== 'reports@example.com') throw new Error('The signed sender was not accepted');
  if (parsed.files.length !== 1) throw new Error('The email attachment was not parsed');
  const report = parseFinancialAttachment(parsed.files[0]).reports[0];
  if (report.sourceStoreCode !== '11439' || report.netSales !== 2383.03) throw new Error('The emailed HTML report was not parsed');
  console.log('Signed Mailgun multipart email parsing passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
