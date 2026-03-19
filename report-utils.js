/**
 * Pure report utilities – testable logic for KPI/financials and date handling.
 * Used by index.js and by regression tests.
 */

const { DateTime } = require('luxon');
const EXCHANGE_RATE_RON_EUR = 5.1;

// --- Parsing ---

function parseNumberLoose(val) {
  if (val === null || val === undefined || val === '') return null;
  let str = String(val).replace(/\s/g, '').replace(/[€$£%\xa0]/g, '');
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf(',') < str.indexOf('.')) str = str.replace(/,/g, '');
    else str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',')) {
    str = str.replace(',', '.');
  }
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function isRonCurrency(currencyLabel) {
  const normalized = String(currencyLabel || '').toUpperCase();
  return normalized.includes('RON') || normalized.includes('LEI');
}

function convertToEur(value, currencyLabel) {
  if (value === null || value === undefined) return null;
  const numeric = Number(value);
  if (isNaN(numeric)) return null;
  return isRonCurrency(currencyLabel) ? numeric / EXCHANGE_RATE_RON_EUR : numeric;
}

/**
 * Get numeric value from column_values
 */
function getNumericColumnValue(colValues, colId) {
  if (!colValues || !colId) return null;
  const col = colValues.find(c => c.id === colId);
  if (!col) return null;

  let raw = null;

  if (col.display_value) raw = col.display_value;
  else if (col.number) raw = col.number;
  else if (col.text) raw = col.text;
  else if (col.value) {
    try {
      const parsed = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
      raw = parsed?.number ?? parsed?.value ?? parsed?.text ?? parsed;
    } catch {
      raw = col.value;
    }
  }

  return parseNumberLoose(raw);
}

/**
 * 🔥 NEW: generic text getter (folosit pentru Excel)
 */
function getTextColumnValue(colValues, colId) {
  if (!colValues || !colId) return '';
  const col = colValues.find(c => c.id === colId);
  if (!col) return '';

  if (col.text) return String(col.text).trim();

  if (col.value) {
    try {
      const parsed = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
      return parsed?.label || parsed?.text || '';
    } catch {
      return '';
    }
  }

  return '';
}

/**
 * 🔥 NEW: helper pentru Solicitari → Excel row
 */
function buildSolicitareRow(item) {
  const colValues = item.column_values || [];

  return {
    "Name": item.name || '',

    "Completare Formular": getTextColumnValue(colValues, 'color_mm1g3k16'),
    "Prioritate": getTextColumnValue(colValues, 'color_mkpx8h4r'),
    "Volum Lunar": getTextColumnValue(colValues, 'color_mky4y026'),
    "Tip Companie": getTextColumnValue(colValues, 'color_mkrbz0s5'),

    "Expected Value (RON)": getNumericColumnValue(colValues, 'numeric_mm1g4the'),

    "Value of Customer": getTextColumnValue(colValues, 'color_mm1ggp28'),
    "Pagina Sursa": getTextColumnValue(colValues, 'color_mm1grjrc')
  };
}

/**
 * Extract date
 */
function extractDate(colValues, colId, options = {}) {
  const { zone = 'Europe/Bucharest' } = options;
  if (!colValues || !colId) return null;

  const col = colValues.find(c => c.id === colId);
  if (!col) return null;

  if (col.date) return normalizeToISODate(col.date, zone);

  if (col.value) {
    try {
      const parsed = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
      if (parsed?.date) return normalizeToISODate(parsed.date, zone);
    } catch {}
  }

  const t = (col.text ?? '').trim();
  if (t && /^\d{4}-\d{2}-\d{2}/.test(t)) {
    return normalizeToISODate(t, zone);
  }

  return null;
}

function normalizeToISODate(str, zone) {
  if (!str) return null;
  let s = str.trim();

  if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(s)) {
    s = s.replace(/\s+/, 'T');
  }

  const dt = DateTime.fromISO(s, { zone });
  return dt.isValid ? dt.toISODate() : null;
}

function isDateInRange(dateIsoStr, startDateStr, endDateStr, zone = 'Europe/Bucharest') {
  if (!dateIsoStr) return { inRange: false, missing: true };

  const start = DateTime.fromISO(startDateStr, { zone }).startOf('day');
  const end = DateTime.fromISO(endDateStr, { zone }).endOf('day');
  const d = DateTime.fromISO(dateIsoStr, { zone });

  if (!d.isValid) return { inRange: false, invalid: true };

  return { inRange: d >= start && d <= end };
}

/**
 * Financials (unchanged)
 */
function computeFinancials(validComenzi, colIds = {}) {
  const {
    dealValue = 'deal_value',
    profitFormula = 'formula_mkre3gx1',
    profitabilityFormula = 'formula_mkxwd14p',
    monedaCursa = 'color_mkse3amh'
  } = colIds;

  let total_pret_client = 0;
  let total_profit_all = 0;
  let valid_price_count = 0;
  let valid_profit_count = 0;

  validComenzi.forEach(item => {
    const colValues = item.column_values || [];

    const pret = getNumericColumnValue(colValues, dealValue);
    const profit = getNumericColumnValue(colValues, profitFormula);
    const currency = getTextColumnValue(colValues, monedaCursa) || 'EUR';

    const pretEur = convertToEur(pret, currency);
    const profitEur = convertToEur(profit, currency);

    if (pretEur !== null) {
      total_pret_client += pretEur;
      valid_price_count++;
    }

    if (profitEur !== null) {
      total_profit_all += profitEur;
      valid_profit_count++;
    }
  });

  return {
    total_pret_client,
    avg_pret_client: valid_price_count ? total_pret_client / valid_price_count : null,
    total_profit_all,
    avg_profit: valid_profit_count ? total_profit_all / valid_profit_count : null
  };
}

module.exports = {
  parseNumberLoose,
  getNumericColumnValue,
  getTextColumnValue,
  buildSolicitareRow, // 🔥 IMPORTANT EXPORT
  extractDate,
  normalizeToISODate,
  isDateInRange,
  computeFinancials,
  isRonCurrency,
  convertToEur,
  EXCHANGE_RATE_RON_EUR
};
