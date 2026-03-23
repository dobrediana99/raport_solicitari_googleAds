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
      raw = parsed?.display_value ?? parsed?.number ?? parsed?.value ?? parsed?.text ?? parsed;
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

  if (!d.isValid) return { inRange: false, invalid: true, missing: false };

  return { inRange: d >= start && d <= end, invalid: false, missing: false };
}

/**
 * Financials for Comenzi section.
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
  let sum_profitability_formula = 0;
  let count_profitability_formula = 0;
  let profit_from_formula_count = 0;
  let profit_from_fallback_count = 0;
  let profit_missing_count = 0;

  const byCurrency = {};

  validComenzi.forEach(item => {
    const colValues = item.column_values || [];

    const pret = getNumericColumnValue(colValues, dealValue);
    const profit = getNumericColumnValue(colValues, profitFormula);
    const profitability = getNumericColumnValue(colValues, profitabilityFormula);
    const currency = getStatusLabel(colValues, monedaCursa) || 'EUR';

    const pretEur = convertToEur(pret, currency);
    const profitEur = convertToEur(profit, currency);

    if (profit !== null) {
      profit_from_formula_count++;
    } else {
      // We intentionally no longer derive fallback profit from provider price.
      profit_missing_count++;
    }

    if (profitability !== null) {
      sum_profitability_formula += profitability;
      count_profitability_formula++;
    }

    if (pretEur !== null) {
      total_pret_client += pretEur;
      valid_price_count++;
    }

    if (profitEur !== null) {
      total_profit_all += profitEur;
      valid_profit_count++;
    }

    if (!byCurrency[currency]) {
      byCurrency[currency] = {
        total_venue: 0,
        total_profit: 0,
        venue_count: 0,
        profit_count: 0,
        sum_profitability_formula: 0,
        count_profitability_formula: 0
      };
    }

    const currencyStats = byCurrency[currency];
    if (pret !== null) {
      currencyStats.total_venue += pret;
      currencyStats.venue_count++;
    }
    if (profit !== null) {
      currencyStats.total_profit += profit;
      currencyStats.profit_count++;
    }
    if (profitability !== null) {
      currencyStats.sum_profitability_formula += profitability;
      currencyStats.count_profitability_formula++;
    }
  });

  const financials = {
    total_pret_client,
    avg_pret_client: valid_price_count > 0 ? parseFloat((total_pret_client / valid_price_count).toFixed(2)) : null,
    total_profit_all,
    avg_profit: valid_profit_count > 0 ? parseFloat((total_profit_all / valid_profit_count).toFixed(2)) : null,
    // Keep legacy field name used by UI/backend.
    profitabilitate_ponderata: count_profitability_formula > 0
      ? parseFloat((sum_profitability_formula / count_profitability_formula).toFixed(2))
      : null,
    valid_price_count,
    valid_profit_count,
    valid_profitability_count: count_profitability_formula,
    exchange_rate_ron_eur: EXCHANGE_RATE_RON_EUR
  };

  const financialsByCurrency = {};
  for (const [currency, stats] of Object.entries(byCurrency)) {
    financialsByCurrency[currency] = {
      total_venue: stats.total_venue,
      total_profit: stats.total_profit,
      avg_venue: stats.venue_count > 0 ? parseFloat((stats.total_venue / stats.venue_count).toFixed(2)) : null,
      avg_profit: stats.profit_count > 0 ? parseFloat((stats.total_profit / stats.profit_count).toFixed(2)) : null,
      profitability: stats.count_profitability_formula > 0
        ? parseFloat((stats.sum_profitability_formula / stats.count_profitability_formula).toFixed(2))
        : null,
      item_count: stats.venue_count,
      profitability_count: stats.count_profitability_formula
    };
  }

  return {
    financials,
    financialsByCurrency,
    mixedCurrencies: Object.keys(byCurrency).length > 1,
    profit_from_formula_count,
    profit_from_fallback_count,
    profit_missing_count
  };
}

function getStatusLabel(colValues, colId) {
  if (!colValues || !colId) return null;
  const col = colValues.find(c => c.id === colId);
  if (!col) return null;
  if (col.label != null && col.label !== '') return String(col.label).trim();
  if (col.text != null && col.text !== '') return String(col.text).trim();
  if (col.value != null && col.value !== '') {
    try {
      const parsed = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
      if (parsed && parsed.label) return String(parsed.label).trim();
    } catch (_) {}
  }
  return null;
}

function stripDiacritics(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizePaymentStatus(value) {
  const normalized = stripDiacritics(value).toLowerCase().trim();
  if (!normalized || normalized === '(necompletat)' || normalized === 'necompletat') return null;
  if (normalized.includes('neincasat') || normalized.includes('ne incasat')) return 'neincasat';
  if (normalized.includes('incasat')) return 'incasat';
  return normalized;
}

function getOverdueBucket(overdueDays) {
  if (typeof overdueDays !== 'number' || !Number.isFinite(overdueDays) || overdueDays < 0) return null;
  if (overdueDays > 90) return 'over_90';
  if (overdueDays >= 60) return 'between_90_60';
  if (overdueDays >= 30) return 'between_60_30';
  if (overdueDays >= 15) return 'between_30_15';
  return 'between_15_0';
}

function getUpcomingBucket(daysToDue) {
  if (typeof daysToDue !== 'number' || !Number.isFinite(daysToDue) || daysToDue < 0) return null;
  if (daysToDue <= 5) return 'due_0_5';
  if (daysToDue <= 15) return 'due_5_15';
  if (daysToDue <= 60) return 'due_15_60';
  return null;
}

function getCollectionDelayBucket(delayDays) {
  if (typeof delayDays !== 'number' || !Number.isFinite(delayDays)) return null;
  if (delayDays < 0) return 'before_due';
  if (delayDays <= 3) return 'max_3';
  if (delayDays <= 15) return 'days_3_15';
  if (delayDays <= 30) return 'days_15_30';
  if (delayDays <= 60) return 'days_30_60';
  if (delayDays <= 90) return 'days_60_90';
  return 'over_90';
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
  getStatusLabel,
  normalizePaymentStatus,
  getOverdueBucket,
  getUpcomingBucket,
  getCollectionDelayBucket,
  isRonCurrency,
  convertToEur,
  EXCHANGE_RATE_RON_EUR
};
