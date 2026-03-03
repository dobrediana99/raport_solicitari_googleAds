const { runAutomatedWeeklyReport } = require('../../index');

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { start, end } = await runAutomatedWeeklyReport();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: `Email trimis cu succes pentru perioada ${start} - ${end}.`
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Eroare internă server.' })
    };
  }
};
