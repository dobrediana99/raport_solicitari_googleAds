const { DateTime } = require('luxon');
const { TZ, runAutomatedWeeklyReport } = require('../../index');

/**
 * Netlify Scheduled Functions use UTC cron.
 * We run hourly on Monday (UTC) and execute only when it's 08:00 in Europe/Bucharest.
 */
exports.config = {
  schedule: '0 * * * 1'
};

exports.handler = async function handler() {
  const nowBucharest = DateTime.now().setZone(TZ);
  if (nowBucharest.weekday !== 1 || nowBucharest.hour !== 8) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        skipped: true,
        reason: 'Aștept intervalul Luni 08:00 Europe/Bucharest.',
        now: nowBucharest.toISO()
      })
    };
  }

  try {
    const { start, end } = await runAutomatedWeeklyReport();
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        skipped: false,
        period: { start, end },
        sentAt: nowBucharest.toISO()
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message || 'Eroare internă server.'
      })
    };
  }
};
