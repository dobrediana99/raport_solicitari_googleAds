const { buildReport } = require('../../index');

const jsonHeaders = { 'Content-Type': 'application/json' };

function parseJsonBody(event) {
  if (!event.body) return {};
  if (typeof event.body === 'object') return event.body;
  try {
    return JSON.parse(event.body);
  } catch {
    throw new Error('Body JSON invalid.');
  }
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...jsonHeaders, Allow: 'POST' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const body = parseJsonBody(event);
    const { startDate, endDate, sources, sourcesSolicitari, sourcesComenzi } = body;

    if (!startDate || !endDate) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'startDate și endDate sunt obligatorii.' })
      };
    }

    const resolvedSourcesSolicitari = sourcesSolicitari ?? sources;
    const resolvedSourcesComenzi = sourcesComenzi ?? resolvedSourcesSolicitari;

    const report = await buildReport(startDate, endDate, sources || [], {
      sourcesSolicitari: resolvedSourcesSolicitari,
      sourcesComenzi: resolvedSourcesComenzi
    });

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify(report)
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error.message || 'Eroare internă server.' })
    };
  }
};
