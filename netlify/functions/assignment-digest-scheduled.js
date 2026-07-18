exports.config = {
  schedule: '0 14 * * 1'
};

exports.handler = async () => {
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.ALERT_CRON_SECRET;
  if (!baseUrl || !secret) {
    return {
      statusCode: 200,
      body: JSON.stringify({ skipped: true, reason: 'Missing URL or ALERT_CRON_SECRET' })
    };
  }

  const response = await fetch(`${baseUrl}/api/assignments/digest?secret=${encodeURIComponent(secret)}`);
  const text = await response.text();
  return {
    statusCode: response.ok ? 200 : response.status,
    body: text
  };
};
