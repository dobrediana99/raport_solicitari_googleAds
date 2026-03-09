const { buildFacturiScadenteData, buildPlatiFurnizoriData } = require('../../index');

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
    const { startDate, endDate, includeDetails, includeFurnizori } = body;

    if (!startDate || !endDate) {
      return {
        statusCode: 400,
        headers: jsonHeaders,
        body: JSON.stringify({ error: 'startDate și endDate sunt obligatorii.' })
      };
    }

    const facturi = await buildFacturiScadenteData(startDate, endDate, {
      includeDetails: includeDetails === true
    });
    let furnizori = null;
    if (includeFurnizori === true) {
      furnizori = await buildPlatiFurnizoriData(startDate, endDate, {
        includeDetails: includeDetails === true
      });
    }

    return {
      statusCode: 200,
      headers: jsonHeaders,
      body: JSON.stringify(
        includeFurnizori === true
          ? { facturi_scadente: facturi, plati_furnizori: furnizori }
          : { facturi_scadente: facturi }
      )
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: jsonHeaders,
      body: JSON.stringify({ error: error.message || 'Eroare internă server.' })
    };
  }
};
