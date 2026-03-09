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
 * Get numeric value from column_values. Tries display_value (formula), number, text, value.
 * Returns null for unparseable values (never 0 as fallback).
 */
function getNumericColumnValue(colValues, colId) {
  if (!colValues || !colId) return null;
  const col = colValues.find(c => c.id === colId);
  if (!col) return null;
  let raw = null;
  if (col.display_value != null && col.display_value !== '') raw = col.display_value;
  else if (col.number != null && col.number !== '') raw = col.number;
  else if (col.text != null && col.text !== '') raw = col.text;
  else if (col.value != null && col.value !== '') {
    try {
      const parsed = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
      if (parsed && typeof parsed === 'object') {
        raw = parsed.display_value ?? parsed.value ?? parsed.number ?? parsed.text;
      } else {
        raw = parsed;
      }
    } catch {
      raw = col.value;
    }
  }
  return parseNumberLoose(raw);
}

/**
 * Extract date string from column. Priority: value.date (JSON), then text if YYYY-MM-DD or YYYY-MM-DD HH:mm.
 * Returns ISO date string or null.
 */
function extractDate(colValues, colId, options = {}) {
  const { zone = 'Europe/Bucharest' } = options;
  if (!colValues || !colId) return null;
  const col = colValues.find(c => c.id === colId);
  if (!col) return null;

  // 1) value.date (typed or JSON)
  if (col.date) return normalizeToISODate(col.date, zone);
  if (col.value != null && col.value !== '') {
    try {
      const parsed = typeof col.value === 'string' ? JSON.parse(col.value) : col.value;
      if (parsed && parsed.date) return normalizeToISODate(parsed.date, zone);
    } catch (_) {}
  }

  // 2) text fallback – only if parseable
  const t = (col.text ?? '').trim();
  if (t && /^\d{4}-\d{2}-\d{2}/.test(t)) return normalizeToISODate(t, zone);
  return null;
}

function normalizeToISODate(str, zone) {
  if (!str || typeof str !== 'string') return null;
  let trimmed = str.trim();
  // YYYY-MM-DD HH:mm -> ISO with T for Luxon
  if (/^\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/.test(trimmed)) {
    trimmed = trimmed.replace(/\s+/, 'T');
  }
  const dt = DateTime.fromISO(trimmed, { zone });
  if (!dt.isValid) return null;
  return dt.toISODate();
}

/**
 * Check if a date string falls in [start, end] and is valid. Returns { inRange, invalid }.
 */
function isDateInRange(dateIsoStr, startDateStr, endDateStr, zone = 'Europe/Bucharest') {
  if (!dateIsoStr) return { inRange: false, invalid: false, missing: true };
  const start = DateTime.fromISO(startDateStr, { zone }).startOf('day');
  const end = DateTime.fromISO(endDateStr, { zone }).endOf('day');
  const itemDate = DateTime.fromISO(dateIsoStr, { zone });
  if (!itemDate.isValid) return { inRange: false, invalid: true, missing: false };
  return { inRange: itemDate >= start && itemDate <= end, invalid: false, missing: false };
}

/**
 * Compute financials from items with column_values.
 * Items are already filtered by date and source.
 * Returns { financials, financialsByCurrency, profit_from_formula_count, profit_from_fallback_count, profit_missing_count }.
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
    const currencyLabel = getStatusLabel(colValues, monedaCursa) || 'EUR';
    const pretEur = convertToEur(pret, currencyLabel);
    const profitEur = convertToEur(profit, currencyLabel);

    if (profit !== null) {
      profit_from_formula_count++;
    } else {
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

    if (!byCurrency[currencyLabel]) {
      byCurrency[currencyLabel] = {
        total_venue: 0,
        total_profit: 0,
        venue_count: 0,
        profit_count: 0,
        sum_profitability_formula: 0,
        count_profitability_formula: 0
      };
    }
    const cur = byCurrency[currencyLabel];
    if (pret !== null) {
      cur.total_venue += pret;
      cur.venue_count++;
    }
    if (profit !== null) {
      cur.total_profit += profit;
      cur.profit_count++;
    }
    if (profitability !== null) {
      cur.sum_profitability_formula += profitability;
      cur.count_profitability_formula++;
    }
  });

  const financials = {
    total_pret_client: total_pret_client,
    avg_pret_client: valid_price_count > 0 ? parseFloat((total_pret_client / valid_price_count).toFixed(2)) : null,
    total_profit_all: total_profit_all,
    avg_profit: valid_profit_count > 0 ? parseFloat((total_profit_all / valid_profit_count).toFixed(2)) : null,
    // Business rule: use average of monday % formula column (formula_mkxwd14p).
    profitabilitate_ponderata: count_profitability_formula > 0
      ? parseFloat((sum_profitability_formula / count_profitability_formula).toFixed(2))
      : null,
    valid_price_count,
    valid_profit_count,
    valid_profitability_count: count_profitability_formula,
    exchange_rate_ron_eur: EXCHANGE_RATE_RON_EUR
  };

  const financialsByCurrency = {};
  for (const [currency, cur] of Object.entries(byCurrency)) {
    financialsByCurrency[currency] = {
      total_venue: cur.total_venue,
      total_profit: cur.total_profit,
      avg_venue: cur.venue_count > 0 ? parseFloat((cur.total_venue / cur.venue_count).toFixed(2)) : null,
      avg_profit: cur.profit_count > 0 ? parseFloat((cur.total_profit / cur.profit_count).toFixed(2)) : null,
      profitability: cur.count_profitability_formula > 0
        ? parseFloat((cur.sum_profitability_formula / cur.count_profitability_formula).toFixed(2))
        : null,
      item_count: cur.venue_count,
      profitability_count: cur.count_profitability_formula
    };
  }

  const mixedCurrencies = Object.keys(byCurrency).length > 1;

  return {
    financials,
    financialsByCurrency,
    mixedCurrencies,
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
