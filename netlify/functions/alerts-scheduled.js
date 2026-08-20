exports.config = {
  schedule: '*/5 * * * *'
};

exports.handler = async () => {
  const baseUrl = process.env.URL || process.env.DEPLOY_PRIME_URL;
  const secret = process.env.ALERT_CRON_SECRET;
  if (!baseUrl || !secret) {
    return {
      statusCode: 200,
      body: JSON.stringify({ skipped: true, reason: 'ALERT_CRON_SECRET or site URL is not configured' })
    };
  }

  const response = await fetch(`${baseUrl}/api/alerts/check?dryRun=false&secret=${encodeURIComponent(secret)}`);
  const body = await response.text();
  return {
    statusCode: response.status,
    body
  };
};
