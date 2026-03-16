const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const { DateTime } = require('luxon');
const reportUtils = require('./report-utils');

// ====================================================
// HARDCODED ENV VARS
// ====================================================
const PORT = 4000;
const TZ = 'Europe/Bucharest';
const MONDAY_API_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjU4NzY4OTI3NiwiYWFpIjoxMSwidWlkIjo5NjI4MDI0NiwiaWFkIjoiMjAyNS0xMS0xOFQxMDo0OTozMi4wMDBaIiwicGVyIjoibWU6d3JpdGUiLCJhY3RpZCI6MjgzNzcyNDAsInJnbiI6ImV1YzEifQ.E7W4LqdVv3K1oqtqIoD5MbqJOT4pLn4vWEQhhqoQTJo';
const GMAIL_USER = 'diana.d@crystal-logistics-services.com';
const GMAIL_APP_PASSWORD = 'sxtt gmyu dnwk hrut';
const EMAIL_FROM = 'diana.d@crystal-logistics-services.com';

const BOARD_SOLICITARI = 1905911565;
const BOARD_COMENZI = 2030349838;
const DEFAULT_REPORT_SOURCES = ['website', 'Telefon / WhatsApp Fix', 'newsletter'];
const AUTO_REPORT_RECIPIENTS = [
  'rafael.o@crystal-logistics-services.com',
  'ana-maria.t@crystal-logistics-services.com',
  'narcisa.g@crystal-logistics-services.com',
  'beatrice.s@crystal-logistics-services.com',
  'bianca.o@crystal-logistics-services.com',
  'bogdan.s@crystal-logistics-services.com',
  'alin.l@crystal-logistics-services.com'
];
const AUTO_REPORT_SUBJECT_TEMPLATE = 'Raport GoogleAds + Facturi Scadente – {start} – {end}';
const AUTO_REPORT_RECIPIENTS_NO_FACTURI = [
  'andrei.focsaneanu@sinaps.ro',
  'andreea.lisei@sinaps.ro'
];
const AUTO_REPORT_SUBJECT_TEMPLATE_NO_FACTURI = 'Raport GoogleAds – {start} – {end}';
const AUTO_REPORT_CRON_EXPRESSION = '0 8 * * 1'; // Luni la 08:00 (Europe/Bucharest)

// ====================================================
// AUTOMATION CONFIG
// ====================================================
const AUTO_REPORT_SOURCES_SOLICITARI = [...DEFAULT_REPORT_SOURCES];
const AUTO_REPORT_SOURCES_COMENZI = [...DEFAULT_REPORT_SOURCES];

const FACTURI_OVERDUE_BUCKETS = [
  { key: 'over_90', label: 'Scadenta depasita peste 90 zile' },
  { key: 'between_90_60', label: 'Scadenta depasita intre 90-60 zile' },
  { key: 'between_60_30', label: 'Scadenta depasita intre 60-30 zile' },
  { key: 'between_30_15', label: 'Scadenta depasita intre 30-15 zile' },
  { key: 'between_15_0', label: 'Scadenta depasita intre 0-15 zile' }
];

const FACTURI_UPCOMING_BUCKETS = [
  { key: 'due_0_5', label: 'Scadenta in 0-5 zile' },
  { key: 'due_5_15', label: 'Scadenta in 5-15 zile' },
  { key: 'due_15_60', label: 'Scadenta in 15-60 zile' }
];

const FACTURI_COLLECTION_DELAY_BUCKETS = [
  { key: 'before_due', label: 'Incasate inainte de scadenta' },
  { key: 'max_3', label: 'Incasate in max 3 zile de la scadenta' },
  { key: 'days_3_15', label: 'Incasate intre 3-15 zile de la scadenta' },
  { key: 'days_15_30', label: 'Incasate intre 15-30 zile de la scadenta' },
  { key: 'days_30_60', label: 'Incasate intre 30-60 zile de la scadenta' },
  { key: 'days_60_90', label: 'Incasate intre 60-90 zile de la scadenta' },
  { key: 'over_90', label: 'Incasate dupa peste 90 zile de la scadenta' },
  { key: 'missing_due', label: 'Incasate fara data scadenta' }
];

const PLATI_FURNIZORI_OVERDUE_BUCKETS = [
  { key: 'over_90', label: 'Scadenta furnizor depasita peste 90 zile' },
  { key: 'between_90_60', label: 'Scadenta furnizor depasita intre 90-60 zile' },
  { key: 'between_60_30', label: 'Scadenta furnizor depasita intre 60-30 zile' },
  { key: 'between_30_15', label: 'Scadenta furnizor depasita intre 30-15 zile' },
  { key: 'between_15_0', label: 'Scadenta furnizor depasita intre 0-15 zile' }
];

const PLATI_FURNIZORI_UPCOMING_BUCKETS = [
  { key: 'due_0_5', label: 'Scadenta furnizor in 0-5 zile' },
  { key: 'due_5_15', label: 'Scadenta furnizor in 5-15 zile' },
  { key: 'due_15_60', label: 'Scadenta furnizor in 15-60 zile' }
];

const PLATI_FURNIZORI_DELAY_BUCKETS = [
  { key: 'before_due', label: 'Platite inainte de scadenta' },
  { key: 'max_3', label: 'Platite in max 3 zile de la scadenta' },
  { key: 'days_3_15', label: 'Platite intre 3-15 zile de la scadenta' },
  { key: 'days_15_30', label: 'Platite intre 15-30 zile de la scadenta' },
  { key: 'days_30_60', label: 'Platite intre 30-60 zile de la scadenta' },
  { key: 'days_60_90', label: 'Platite intre 60-90 zile de la scadenta' },
  { key: 'over_90', label: 'Platite dupa peste 90 zile de la scadenta' },
  { key: 'missing_due', label: 'Platite fara data scadenta furnizor' }
];

const FACTURI_STATUS_PLATA_COLUMN_ID = 'color_mkv5g682';
const FACTURI_STATUS_NEINCASAT_INDEXES = [0, 3]; // Neincasat + Litigiu (Neincasat)
const FACTURI_STATUS_INCASAT_INDEXES = [1, 6]; // Incasata + Incasata Partial
const FACTURI_DATA_INCASARII_COLUMN_ID = 'date_mkv05mkx';

const FURNIZORI_STATUS_PLATA_COLUMN_ID = 'color_mksv1jpm';
const FURNIZORI_STATUS_NEPLATIT_INDEXES = [5]; // Neplatit
const FURNIZORI_STATUS_PLATIT_INDEXES = [1, 0]; // Platit + Achitat Partial
const FURNIZORI_DATA_PLATII_COLUMN_ID = 'date_mkv0ybzt';
const FACTURI_COLUMN_IDS_SUMMARY = [
  'color_mkv5g682',
  'color_mkxtd25m',
  'text_mky4r781',
  'date_mkyhsbh4',
  'date_mkv05mkx',
  'deal_creation_date',
  'deal_value',
  'color_mkse3amh'
];
const FACTURI_COLUMN_IDS_DETAILS = [
  'color_mkv5g682',
  'color_mkxtd25m',
  'text_mky4r781',
  'date_mkyhsbh4',
  'date_mkvyt36d',
  'date_mkv05mkx',
  'deal_creation_date',
  'date_mkxcj9sp',
  'pulse_id_mks1dcwz',
  'deal_owner',
  'multiple_person_mkt9b24z',
  'color_mktcvtpz',
  'email_mkvneqyg',
  'deal_value',
  'color_mkse3amh',
  'color_mktcqj26',
  'long_text_mksezgvz',
  'numeric_mksek8d2',
  'color_mksex1w8',
  'text_mksv7kwg',
  'color_mkseanqh',
  'color_mkse642z',
  'numeric_mkpknkjp',
  'color_mkt9as8p',
  'numeric_mksev08g',
  'file_mkseqket',
  'color_mksv1jpm',
  'board_relation_mkpw4bcs'
];

const FURNIZORI_COLUMN_IDS_SUMMARY = [
  'color_mksv1jpm',
  'date_mkxtsgp8',
  'date_mkv0ybzt',
  'deal_creation_date',
  'numeric_mkpknkjp',
  'color_mkse3amh',
  'file_mksegx89'
];

const FURNIZORI_COLUMN_IDS_DETAILS = [
  'color_mksv1jpm',
  'date_mkxtsgp8',
  'date_mkv0ybzt',
  'deal_creation_date',
  'date_mkxcj9sp',
  'pulse_id_mks1dcwz',
  'deal_owner',
  'multiple_person_mkt9b24z',
  'color_mktcvtpz',
  'email_mkvneqyg',
  'numeric_mkpknkjp',
  'color_mkse3amh',
  'color_mkt9as8p',
  'long_text_mksezgvz',
  'numeric_mksev08g',
  'color_mksed6qr',
  'text_mksv7kwg',
  'date_mkvyt36d',
  'color_mkseanqh',
  'color_mkse642z',
  'file_mksegx89',
  'file_mkseqket',
  'board_relation_mkse9rp2'
];
const SOLICITARI_COLUMN_IDS = [
  'deal_creation_date',
  'deal_stage',
  'color_mkpv6sj4',
  'color_mksh2abx',
  'dropdown_mkx6jyjf',
  'dropdown_mkx687jv',
  'color_mkx12a19',
  'color_mksemxby',
  'dropdown_mkxk7c69'
];
const COMENZI_COLUMN_IDS = [
  'deal_creation_date',
  'color_mktcvtpz',
  'deal_value',
  'formula_mkre3gx1',
  'formula_mkxwd14p',
  'color_mkse3amh',
  'color_mktcr7h6',
  'color_mktaev1d',
  'deal_owner',
  'color_mkx1kx5j',
  'color_mkse1tmc',
  'color_mkrb3hhk',
  'dropdown_mkx1naw3',
  'dropdown_mktsr9n2',
  'dropdown_mktswwk3',
  'dropdown_mkyq2ne1',
  'lookup_mkxttcky'
];

// ====================================================
// UTILS & PARSERS (display / distribution; numeric/date use report-utils)
// ====================================================
const cleanDisplayString = (value) => {
  const str = String(value ?? '').trim();
  if (!str) return null;
  const lowered = str.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined' || str === '[object Object]') return null;
  return str;
};

const extractDisplayValue = (input, depth = 0) => {
  if (input === null || input === undefined || depth > 3) return null;

  if (typeof input === 'string' || typeof input === 'number' || typeof input === 'boolean') {
    return cleanDisplayString(input);
  }

  if (Array.isArray(input)) {
    const parts = input
      .map(val => extractDisplayValue(val, depth + 1))
      .filter(Boolean);
    return parts.length ? parts.join(', ') : null;
  }

  if (typeof input === 'object') {
    const preferredKeys = ['label', 'name', 'title', 'text', 'display_value', 'number', 'date', 'labels', 'value'];
    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        const extracted = extractDisplayValue(input[key], depth + 1);
        if (extracted) return extracted;
      }
    }
  }

  return null;
};

const getColValue = (colValues, colId) => {
  const col = colValues.find(c => c.id === colId);
  if (!col) return "(necompletat)";

  // 1) preferă text dacă există
  const t = cleanDisplayString(col.text);
  if (t) return t;

  // 2) typed fields fallback (status/formula/mirror/date/number)
  for (const typedVal of [col.label, col.display_value, col.number, col.date]) {
    const extracted = extractDisplayValue(typedVal);
    if (extracted) return extracted;
  }

  // 3) fallback pe value (formula/number/etc.)
  const v = col.value;
  if (v === null || v === undefined || v === "") return "(necompletat)";

  // uneori value e JSON string; evităm serializarea brută a obiectelor
  try {
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    const extracted = extractDisplayValue(parsed);
    if (extracted) return extracted;
  } catch {
    const extracted = extractDisplayValue(v);
    if (extracted) return extracted;
  }

  return "(necompletat)";
};

const getFallbackValue = (colValues, primaryId, fallbackId) => {
  let val = getColValue(colValues, primaryId);
  if (val === "(necompletat)") val = getColValue(colValues, fallbackId);
  return val;
};

const normalizeBreakdownValue = (rawValue) => {
  const extracted = extractDisplayValue(rawValue);
  const normalized = cleanDisplayString(extracted);
  if (!normalized) return 'Nespecificat';

  const lowered = normalized.toLowerCase();
  if (lowered === '(necompletat)' || lowered === 'necompletat') return 'Nespecificat';
  return normalized;
};

const buildDateQueryParams = (dateColumnId, startDateStr, endDateStr) => (
  `{ rules: [{ column_id: "${dateColumnId}", operator: between, compare_value: ["${startDateStr}", "${endDateStr}"] }] }`
);

const buildStatusQueryParams = (statusColumnId, statusIndexes) => {
  const indexes = (Array.isArray(statusIndexes) ? statusIndexes : [])
    .filter(Number.isInteger)
    .join(', ');
  return `{ rules: [{ column_id: "${statusColumnId}", operator: any_of, compare_value: [${indexes}] }] }`;
};

const buildStatusAndDateQueryParams = (statusColumnId, statusIndexes, dateColumnId, startDateStr, endDateStr) => {
  const indexes = (Array.isArray(statusIndexes) ? statusIndexes : [])
    .filter(Number.isInteger)
    .join(', ');
  return `{ rules: [
    { column_id: "${statusColumnId}", operator: any_of, compare_value: [${indexes}] },
    { column_id: "${dateColumnId}", operator: between, compare_value: ["${startDateStr}", "${endDateStr}"] }
  ] }`;
};

const buildStatusAndPositiveAmountQueryParams = (statusColumnId, statusIndexes, amountColumnId) => {
  const indexes = (Array.isArray(statusIndexes) ? statusIndexes : [])
    .filter(Number.isInteger)
    .join(', ');
  return `{ rules: [
    { column_id: "${statusColumnId}", operator: any_of, compare_value: [${indexes}] },
    { column_id: "${amountColumnId}", operator: greater_than, compare_value: [0] }
  ] }`;
};

const buildStatusDateAndPositiveAmountQueryParams = (
  statusColumnId,
  statusIndexes,
  dateColumnId,
  startDateStr,
  endDateStr,
  amountColumnId
) => {
  const indexes = (Array.isArray(statusIndexes) ? statusIndexes : [])
    .filter(Number.isInteger)
    .join(', ');
  return `{ rules: [
    { column_id: "${statusColumnId}", operator: any_of, compare_value: [${indexes}] },
    { column_id: "${dateColumnId}", operator: between, compare_value: ["${startDateStr}", "${endDateStr}"] },
    { column_id: "${amountColumnId}", operator: greater_than, compare_value: [0] }
  ] }`;
};

const delay = ms => new Promise(res => setTimeout(res, ms));

const initFacturiBucketMap = (definitions) => {
  const out = {};
  definitions.forEach(def => {
    out[def.key] = {
      key: def.key,
      label: def.label,
      items: [],
      item_count: 0,
      total_pret_client_eur: 0,
      total_by_currency: {}
    };
  });
  return out;
};

const normalizeCurrency = (rawCurrency) => {
  const cleaned = cleanDisplayString(rawCurrency);
  return cleaned || 'N/A';
};

const addCurrencyAmount = (target, currency, amount) => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return;
  const key = normalizeCurrency(currency);
  target[key] = (target[key] || 0) + Number(amount);
};

const formatCurrencyTotals = (totals) => {
  const entries = Object.entries(totals || {});
  if (!entries.length) return '—';
  return entries
    .map(([currency, value]) => `${currency}: ${Number(value).toFixed(2)}`)
    .join(' | ');
};

const round2 = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

const normalizeMissing = (value) => {
  return value === '(necompletat)' ? '' : value;
};

const hasPositiveClientPrice = (priceValue) => {
  if (priceValue === null || priceValue === undefined) return false;
  const n = Number(priceValue);
  return Number.isFinite(n) && n > 0;
};

const hasPositiveAmount = (value) => {
  if (value === null || value === undefined) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
};

const normalizeInvoiceStatus = (value) => {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
};

const isFacturaEmisa = (statusGenerareFactura, nrFactura) => {
  const normalizedStatus = normalizeInvoiceStatus(statusGenerareFactura);
  if (normalizedStatus.includes('emisa') && normalizedStatus.includes('trimisa')) return true;

  const normalizedNr = normalizeMissing(nrFactura);
  if (normalizedNr && String(normalizedNr).trim()) return true;

  return false;
};

const normalizeSupplierPaymentStatus = (value) => {
  const normalized = normalizeInvoiceStatus(value);
  if (!normalized || normalized === '(necompletat)' || normalized === 'necompletat') return null;
  if (normalized.includes('neplatit')) return 'neplatit';
  if (normalized.includes('platit') || normalized.includes('achitat')) return 'platit';
  return normalized;
};

const isOlderThanDays = (dateIso, referenceDate, days) => {
  if (!dateIso || dateIso === '(necompletat)') return false;
  const date = DateTime.fromISO(String(dateIso), { zone: TZ }).startOf('day');
  if (!date.isValid) return false;
  const diff = Math.floor(referenceDate.diff(date, 'days').days);
  return diff > days;
};

const hasFileValue = (raw) => {
  const text = normalizeMissing(raw);
  if (text && String(text).trim()) return true;
  return false;
};

const pickFirstDate = (colValues, ids) => {
  for (const id of ids) {
    const dateStr = reportUtils.extractDate(colValues, id, { zone: TZ });
    if (dateStr) return dateStr;
  }
  return null;
};

const toDayStart = (dateIso) => DateTime.fromISO(dateIso, { zone: TZ }).startOf('day');

const getCashflowScadentaInfo = (rowData) => {
  const dueRaw = normalizeMissing(rowData?.data_scadenta);
  if (!dueRaw) return '(fara data scadenta)';

  const movementRaw = normalizeMissing(rowData?.data_incasarii);
  if (!movementRaw) return '(fara data incasarii)';

  const dueDate = toDayStart(String(dueRaw));
  const movementDate = toDayStart(String(movementRaw));
  if (!dueDate.isValid || !movementDate.isValid) return '(date invalide)';

  const diff = Math.floor(movementDate.diff(dueDate, 'days').days);
  if (diff >= 0) return `${diff} zile depasire`;
  return `${Math.abs(diff)} zile pana la scadenta`;
};

const makeFacturiRow = (item, options = {}) => {
  const { referenceDate } = options;
  const cols = item.column_values || [];
  const statusPlataRaw = getColValue(cols, 'color_mkv5g682');
  const statusPlata = reportUtils.normalizePaymentStatus(statusPlataRaw);
  const statusGenerareFactura = getColValue(cols, 'color_mkxtd25m');
  const nrFactura = getColValue(cols, 'text_mky4r781');
  const pretClient = reportUtils.getNumericColumnValue(cols, 'deal_value');
  const moneda = normalizeCurrency(getColValue(cols, 'color_mkse3amh'));
  const dataScadenta = reportUtils.extractDate(cols, 'date_mkyhsbh4', { zone: TZ });
  const dataIncasarii = reportUtils.extractDate(cols, 'date_mkv05mkx', { zone: TZ });
  // "Data emiterii facturii" nu exista explicit in board; folosim Data bonusare, apoi fallback Data Ctr.
  const dataEmitereFactura = pickFirstDate(cols, ['date_mkxcj9sp', 'deal_creation_date']);
  const dataCtr = reportUtils.extractDate(cols, 'deal_creation_date', { zone: TZ });

  let zileDepasireScadenta = null;
  let zilePanaLaScadenta = null;
  let zileScadentaInfo = '(fara data scadenta)';
  let overdueDays = null;
  let daysToDue = null;

  if (dataScadenta) {
    const dueDate = toDayStart(dataScadenta);
    const diff = Math.floor(referenceDate.diff(dueDate, 'days').days);
    if (diff >= 0) {
      overdueDays = diff;
      zileDepasireScadenta = diff;
      zileScadentaInfo = `${diff} zile depasire`;
    } else {
      daysToDue = Math.abs(diff);
      zilePanaLaScadenta = Math.abs(diff);
      zileScadentaInfo = `${Math.abs(diff)} zile pana la scadenta`;
    }
  }

  return {
    item_id: item.id,
    item_name: item.name,
    nume_companie: getColValue(cols, 'board_relation_mkpw4bcs'),
    data_ctr: dataCtr || '(necompletat)',
    nr_cursa: getColValue(cols, 'pulse_id_mks1dcwz'),
    nume_principal: getColValue(cols, 'deal_owner'),
    nume_secundar: getColValue(cols, 'multiple_person_mkt9b24z'),
    sursa_client: getColValue(cols, 'color_mktcvtpz'),
    email_contabilitate_client: getColValue(cols, 'email_mkvneqyg'),
    pret_client: pretClient,
    moneda,
    client_pe: getColValue(cols, 'color_mktcqj26'),
    observatii_interne: getColValue(cols, 'long_text_mksezgvz'),
    termen_plata_client: reportUtils.getNumericColumnValue(cols, 'numeric_mksek8d2'),
    conditii_plata_client: getColValue(cols, 'color_mksex1w8'),
    data_descarcare: (() => {
      const textDate = getColValue(cols, 'text_mksv7kwg');
      if (textDate !== '(necompletat)') return textDate;
      const fallbackDate = reportUtils.extractDate(cols, 'date_mkvyt36d', { zone: TZ });
      return fallbackDate || '(necompletat)';
    })(),
    trimite_originale_clientului: getColValue(cols, 'color_mkseanqh'),
    motiv_plata_termen: getColValue(cols, 'color_mkse642z'),
    pret_furnizor: reportUtils.getNumericColumnValue(cols, 'numeric_mkpknkjp'),
    furnizor_pe: getColValue(cols, 'color_mkt9as8p'),
    plata_la_furnizor: reportUtils.getNumericColumnValue(cols, 'numeric_mksev08g'),
    pod: getColValue(cols, 'file_mkseqket'),
    plata_furnizor: getColValue(cols, 'color_mksv1jpm'),
    data_scadenta: dataScadenta || '(necompletat)',
    data_emitere_factura: dataEmitereFactura || '(necompletat)',
    data_incasarii: dataIncasarii || '(necompletat)',
    zile_depasire_scadenta: zileDepasireScadenta,
    zile_pana_la_scadenta: zilePanaLaScadenta,
    zile_scadenta_info: zileScadentaInfo,
    overdue_days: overdueDays,
    days_to_due: daysToDue,
    status_plata_client_raw: statusPlataRaw,
    status_plata_client: statusPlata,
    status_generare_factura: statusGenerareFactura,
    nr_factura: nrFactura,
    are_factura_emisa: isFacturaEmisa(statusGenerareFactura, nrFactura)
  };
};

const makeFurnizorRow = (item, options = {}) => {
  const { referenceDate } = options;
  const cols = item.column_values || [];
  const statusPlataRaw = getColValue(cols, FURNIZORI_STATUS_PLATA_COLUMN_ID);
  const statusPlata = normalizeSupplierPaymentStatus(statusPlataRaw);
  const pretFurnizor = reportUtils.getNumericColumnValue(cols, 'numeric_mkpknkjp');
  const moneda = normalizeCurrency(getColValue(cols, 'color_mkse3amh'));
  const dataScadenta = reportUtils.extractDate(cols, 'date_mkxtsgp8', { zone: TZ });
  const dataPlata = reportUtils.extractDate(cols, 'date_mkv0ybzt', { zone: TZ });
  const dataCtr = reportUtils.extractDate(cols, 'deal_creation_date', { zone: TZ });

  let zileDepasireScadenta = null;
  let zilePanaLaScadenta = null;
  let zileScadentaInfo = '(fara data scadenta)';
  let overdueDays = null;
  let daysToDue = null;

  if (dataScadenta) {
    const dueDate = toDayStart(dataScadenta);
    const diff = Math.floor(referenceDate.diff(dueDate, 'days').days);
    if (diff >= 0) {
      overdueDays = diff;
      zileDepasireScadenta = diff;
      zileScadentaInfo = `${diff} zile depasire`;
    } else {
      daysToDue = Math.abs(diff);
      zilePanaLaScadenta = Math.abs(diff);
      zileScadentaInfo = `${Math.abs(diff)} zile pana la scadenta`;
    }
  }

  const facturaFurnizor = getColValue(cols, 'file_mksegx89');

  return {
    item_id: item.id,
    item_name: item.name,
    nume_companie: getColValue(cols, 'board_relation_mkse9rp2'),
    data_ctr: dataCtr || '(necompletat)',
    nr_cursa: getColValue(cols, 'pulse_id_mks1dcwz'),
    nume_principal: getColValue(cols, 'deal_owner'),
    nume_secundar: getColValue(cols, 'multiple_person_mkt9b24z'),
    sursa_client: getColValue(cols, 'color_mktcvtpz'),
    email_contabilitate_client: getColValue(cols, 'email_mkvneqyg'),
    pret_client: pretFurnizor,
    moneda,
    client_pe: getColValue(cols, 'color_mkt9as8p'),
    observatii_interne: getColValue(cols, 'long_text_mksezgvz'),
    termen_plata_client: reportUtils.getNumericColumnValue(cols, 'numeric_mksev08g'),
    conditii_plata_client: getColValue(cols, 'color_mksed6qr'),
    data_descarcare: (() => {
      const textDate = getColValue(cols, 'text_mksv7kwg');
      if (textDate !== '(necompletat)') return textDate;
      const fallbackDate = reportUtils.extractDate(cols, 'date_mkvyt36d', { zone: TZ });
      return fallbackDate || '(necompletat)';
    })(),
    trimite_originale_clientului: getColValue(cols, 'color_mkseanqh'),
    motiv_plata_termen: getColValue(cols, 'color_mkse642z'),
    pret_furnizor: pretFurnizor,
    furnizor_pe: getColValue(cols, 'color_mkt9as8p'),
    plata_la_furnizor: reportUtils.getNumericColumnValue(cols, 'numeric_mksev08g'),
    pod: getColValue(cols, 'file_mkseqket'),
    plata_furnizor: getColValue(cols, 'color_mksv1jpm'),
    factura_furnizor: facturaFurnizor,
    data_scadenta: dataScadenta || '(necompletat)',
    data_emitere_factura: dataCtr || '(necompletat)',
    data_incasarii: dataPlata || '(necompletat)',
    zile_depasire_scadenta: zileDepasireScadenta,
    zile_pana_la_scadenta: zilePanaLaScadenta,
    zile_scadenta_info: zileScadentaInfo,
    overdue_days: overdueDays,
    days_to_due: daysToDue,
    status_plata_client_raw: statusPlataRaw,
    status_plata_client: statusPlata,
    status_generare_factura: '(necompletat)',
    nr_factura: '(necompletat)',
    are_factura_emisa: hasFileValue(facturaFurnizor)
  };
};

const addFacturiRowToBucket = (bucket, row) => {
  bucket.items.push(row);
  bucket.item_count += 1;
  if (row.pret_client !== null && row.pret_client !== undefined) {
    const pretEur = reportUtils.convertToEur(row.pret_client, row.moneda);
    if (pretEur !== null) bucket.total_pret_client_eur += pretEur;
    addCurrencyAmount(bucket.total_by_currency, row.moneda, row.pret_client);
  }
};

const buildFacturiSectionSummary = (bucketMap) => {
  const buckets = Object.values(bucketMap);
  const totalItems = buckets.reduce((acc, b) => acc + b.item_count, 0);
  return buckets.map((bucket) => ({
    key: bucket.key,
    valoare: bucket.label,
    nr: bucket.item_count,
    procent: totalItems > 0 ? ((bucket.item_count / totalItems) * 100).toFixed(1) : '0.0',
    total_pret_client_eur: round2(bucket.total_pret_client_eur),
    total_by_currency: bucket.total_by_currency
  }));
};

const buildFacturiSectionTotals = (bucketMap) => {
  const out = {
    item_count: 0,
    total_pret_client_eur: 0,
    total_by_currency: {}
  };
  Object.values(bucketMap).forEach(bucket => {
    out.item_count += bucket.item_count;
    out.total_pret_client_eur += bucket.total_pret_client_eur;
    Object.entries(bucket.total_by_currency).forEach(([currency, value]) => {
      out.total_by_currency[currency] = (out.total_by_currency[currency] || 0) + value;
    });
  });
  return {
    item_count: out.item_count,
    total_pret_client_eur: round2(out.total_pret_client_eur),
    total_by_currency: out.total_by_currency
  };
};

// ====================================================
// MONDAY API CLIENT
// ====================================================
async function fetchBoardItems(boardId, options = {}) {
  const {
    cursor = null,
    retries = 5,
    queryParams = null,
    columnIds = null
  } = options;

  const itemsPageArgs = cursor
    ? `limit: 250, cursor: "${cursor}"`
    : (queryParams ? `limit: 250, query_params: ${queryParams}` : 'limit: 250');

  const columnIdsArg = Array.isArray(columnIds) && columnIds.length > 0
    ? `(ids: [${columnIds.map(id => `"${id}"`).join(', ')}])`
    : '';

  const query = `
    query {
      boards(ids: [${boardId}]) {
        items_page(${itemsPageArgs}) {
          cursor
          items {
            id
            name
            column_values${columnIdsArg} {
              id
              type
              text
              value
              ... on FormulaValue { display_value }
              ... on NumbersValue { number symbol }
              ... on DateValue { date }
              ... on StatusValue { label }
              ... on BoardRelationValue { display_value }
              ... on MirrorValue { display_value }
            }
          }
        }
      }
    }
  `;
  
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.post('https://api.monday.com/v2', 
        { query },
        { headers: { 'Authorization': MONDAY_API_TOKEN, 'API-Version': '2023-10' } }
      );
      if (res.data.errors) throw new Error(JSON.stringify(res.data.errors));
      return res.data.data.boards[0].items_page;
    } catch (err) {
      if (i === retries - 1) throw err;
      await delay(Math.pow(2, i) * 1000); // 1s, 2s, 4s...
    }
  }
}

async function getAllItems(boardId, queryParams = null, columnIds = null) {
  let items = [];
  let cursor = null;
  do {
    const page = await fetchBoardItems(boardId, { cursor, queryParams, columnIds });
    if (page && page.items) items.push(...page.items);
    cursor = page ? page.cursor : null;
  } while (cursor);
  return items;
}

async function getItemsByIds(itemIds, columnIds = null) {
  const ids = Array.isArray(itemIds) ? itemIds.map(id => String(id)).filter(Boolean) : [];
  if (!ids.length) return [];
  // Monday API returns max 25 items for items(ids: [...]).
  const chunkSize = 25;
  const concurrentRequests = 4;
  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize));

  const results = [];
  const columnIdsArg = Array.isArray(columnIds) && columnIds.length > 0
    ? `(ids: [${columnIds.map(id => `"${id}"`).join(', ')}])`
    : '';

  const fetchChunk = async (chunk) => {
    const query = `
      query {
        items(ids: [${chunk.join(',')}]) {
          id
          name
          column_values${columnIdsArg} {
            id
            type
            text
            value
            ... on FormulaValue { display_value }
            ... on NumbersValue { number symbol }
            ... on DateValue { date }
            ... on StatusValue { label }
            ... on BoardRelationValue { display_value }
            ... on MirrorValue { display_value }
          }
        }
      }
    `;
    const retries = 3;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await axios.post(
          'https://api.monday.com/v2',
          { query },
          { headers: { Authorization: MONDAY_API_TOKEN, 'API-Version': '2023-10' } }
        );
        if (res.data.errors) throw new Error(JSON.stringify(res.data.errors));
        return res.data.data?.items || [];
      } catch (err) {
        if (i === retries - 1) throw err;
        await delay(Math.pow(2, i) * 250);
      }
    }
    return [];
  };

  for (let i = 0; i < chunks.length; i += concurrentRequests) {
    const currentBatch = chunks.slice(i, i + concurrentRequests);
    const batchResults = await Promise.all(currentBatch.map(fetchChunk));
    batchResults.forEach(items => results.push(...items));
  }
  return results;
}

function buildFacturiScadenteReport(input, options = {}) {
  const {
    startDateStr,
    endDateStr,
    referenceDateStr
  } = options;
  const unpaidItems = Array.isArray(input?.unpaidItems) ? input.unpaidItems : [];
  const paidItemsInPeriod = Array.isArray(input?.paidItemsInPeriod) ? input.paidItemsInPeriod : [];

  const referenceDate = referenceDateStr
    ? DateTime.fromISO(referenceDateStr, { zone: TZ }).startOf('day')
    : DateTime.now().setZone(TZ).startOf('day');

  const cashFlowStart = DateTime.fromISO(startDateStr, { zone: TZ }).startOf('day');
  const cashFlowEnd = DateTime.fromISO(endDateStr, { zone: TZ }).endOf('day');

  const overdueBuckets = initFacturiBucketMap(FACTURI_OVERDUE_BUCKETS);
  const upcomingBuckets = initFacturiBucketMap(FACTURI_UPCOMING_BUCKETS);
  const delayBuckets = initFacturiBucketMap(FACTURI_COLLECTION_DELAY_BUCKETS);
  const collectedInPeriod = {
    key: 'cashflow_collected',
    label: 'Incasari in perioada analizata',
    items: [],
    item_count: 0,
    total_pret_client_eur: 0,
    total_by_currency: {}
  };

  const counters = {
    unpaid_missing_due_date: 0,
    unpaid_overdue_without_invoice: 0,
    paid_missing_collection_date: 0,
    cashflow_missing_due_date_for_delay: 0,
    skipped_zero_client_price: 0
  };

  const statusDistribution = {};

  unpaidItems.forEach(item => {
    const row = makeFacturiRow(item, { referenceDate });
    if (!hasPositiveAmount(row.pret_client)) {
      counters.skipped_zero_client_price++;
      return;
    }
    const status = row.status_plata_client || 'nespecificat';
    statusDistribution[status] = (statusDistribution[status] || 0) + 1;

    if (status === 'neincasat') {
      if (row.overdue_days !== null) {
        if (!row.are_factura_emisa) {
          if (isOlderThanDays(row.data_ctr, referenceDate, 30)) {
            counters.unpaid_overdue_without_invoice++;
          }
          return;
        }
        const overdueKey = reportUtils.getOverdueBucket(row.overdue_days);
        if (overdueKey && overdueBuckets[overdueKey]) addFacturiRowToBucket(overdueBuckets[overdueKey], row);
      } else if (row.days_to_due !== null) {
        const upcomingKey = reportUtils.getUpcomingBucket(row.days_to_due);
        if (upcomingKey && upcomingBuckets[upcomingKey]) addFacturiRowToBucket(upcomingBuckets[upcomingKey], row);
      } else {
        counters.unpaid_missing_due_date++;
      }
    }
  });

  paidItemsInPeriod.forEach(item => {
    const row = makeFacturiRow(item, { referenceDate });
    if (!hasPositiveAmount(row.pret_client)) {
      counters.skipped_zero_client_price++;
      return;
    }
    const status = row.status_plata_client || 'nespecificat';
    statusDistribution[status] = (statusDistribution[status] || 0) + 1;

    if (row.data_incasarii === '(necompletat)') {
      counters.paid_missing_collection_date++;
      return;
    }

    const collectionDate = toDayStart(row.data_incasarii);
    if (collectionDate < cashFlowStart || collectionDate > cashFlowEnd) return;

    addFacturiRowToBucket(collectedInPeriod, row);
    if (row.data_scadenta !== '(necompletat)') {
      const dueDate = toDayStart(row.data_scadenta);
      const delayDays = Math.floor(collectionDate.diff(dueDate, 'days').days);
      const delayKey = reportUtils.getCollectionDelayBucket(delayDays);
      if (delayKey && delayBuckets[delayKey]) {
        addFacturiRowToBucket(delayBuckets[delayKey], {
          ...row,
          intarziere_incasare_zile: delayDays
        });
      }
    } else {
      counters.cashflow_missing_due_date_for_delay++;
      if (delayBuckets.missing_due) {
        addFacturiRowToBucket(delayBuckets.missing_due, {
          ...row,
          intarziere_incasare_zile: null
        });
      }
    }
  });

  // Keep status coverage explicit in case query indexes miss a valid status label.
  if (!statusDistribution.incasat) {
    statusDistribution.incasat = paidItemsInPeriod.length;
  }
  if (!statusDistribution.neincasat && unpaidItems.length > 0) {
    statusDistribution.neincasat = unpaidItems.length;
  }

  if (paidItemsInPeriod.length === 0) {
    counters.paid_missing_collection_date = 0;
  }

  const overdueSummary = buildFacturiSectionSummary(overdueBuckets);
  const upcomingSummary = buildFacturiSectionSummary(upcomingBuckets);
  const delaySummary = buildFacturiSectionSummary(delayBuckets);

  return {
    metadata: {
      reference_date: referenceDate.toISODate(),
      cashflow_period: { start: startDateStr, end: endDateStr },
      source_counts: {
        unpaid_items: unpaidItems.length,
        paid_items_in_period: paidItemsInPeriod.length
      }
    },
    status_distribution: Object.entries(statusDistribution).map(([status, nr]) => ({ status, nr })),
    counters,
    overdue: {
      buckets: overdueBuckets,
      summary: overdueSummary,
      totals: buildFacturiSectionTotals(overdueBuckets)
    },
    upcoming: {
      buckets: upcomingBuckets,
      summary: upcomingSummary,
      totals: buildFacturiSectionTotals(upcomingBuckets)
    },
    cashflow: {
      collected_in_period: {
        ...collectedInPeriod,
        total_pret_client_eur: round2(collectedInPeriod.total_pret_client_eur)
      },
      delay_buckets: delayBuckets,
      delay_summary: delaySummary,
      delay_totals: buildFacturiSectionTotals(delayBuckets)
    }
  };
}

function buildPlatiFurnizoriReport(input, options = {}) {
  const {
    startDateStr,
    endDateStr,
    referenceDateStr
  } = options;
  const unpaidItems = Array.isArray(input?.unpaidItems) ? input.unpaidItems : [];
  const paidItemsInPeriod = Array.isArray(input?.paidItemsInPeriod) ? input.paidItemsInPeriod : [];

  const referenceDate = referenceDateStr
    ? DateTime.fromISO(referenceDateStr, { zone: TZ }).startOf('day')
    : DateTime.now().setZone(TZ).startOf('day');

  const cashFlowStart = DateTime.fromISO(startDateStr, { zone: TZ }).startOf('day');
  const cashFlowEnd = DateTime.fromISO(endDateStr, { zone: TZ }).endOf('day');

  const overdueBuckets = initFacturiBucketMap(PLATI_FURNIZORI_OVERDUE_BUCKETS);
  const upcomingBuckets = initFacturiBucketMap(PLATI_FURNIZORI_UPCOMING_BUCKETS);
  const delayBuckets = initFacturiBucketMap(PLATI_FURNIZORI_DELAY_BUCKETS);
  const paidInPeriod = {
    key: 'cashflow_paid',
    label: 'Plati furnizori in perioada analizata',
    items: [],
    item_count: 0,
    total_pret_client_eur: 0,
    total_by_currency: {}
  };

  const counters = {
    unpaid_missing_due_date: 0,
    unpaid_overdue_without_invoice: 0,
    paid_missing_collection_date: 0,
    cashflow_missing_due_date_for_delay: 0,
    skipped_zero_client_price: 0
  };

  const statusDistribution = {};

  unpaidItems.forEach(item => {
    const row = makeFurnizorRow(item, { referenceDate });
    if (!hasPositiveAmount(row.pret_client)) {
      counters.skipped_zero_client_price++;
      return;
    }
    const status = row.status_plata_client || 'nespecificat';
    statusDistribution[status] = (statusDistribution[status] || 0) + 1;

    if (status === 'neplatit') {
      if (row.overdue_days !== null) {
        if (!row.are_factura_emisa) {
          if (isOlderThanDays(row.data_ctr, referenceDate, 30)) {
            counters.unpaid_overdue_without_invoice++;
          }
          return;
        }
        const overdueKey = reportUtils.getOverdueBucket(row.overdue_days);
        if (overdueKey && overdueBuckets[overdueKey]) addFacturiRowToBucket(overdueBuckets[overdueKey], row);
      } else if (row.days_to_due !== null) {
        const upcomingKey = reportUtils.getUpcomingBucket(row.days_to_due);
        if (upcomingKey && upcomingBuckets[upcomingKey]) addFacturiRowToBucket(upcomingBuckets[upcomingKey], row);
      } else {
        counters.unpaid_missing_due_date++;
      }
    }
  });

  paidItemsInPeriod.forEach(item => {
    const row = makeFurnizorRow(item, { referenceDate });
    if (!hasPositiveAmount(row.pret_client)) {
      counters.skipped_zero_client_price++;
      return;
    }
    const status = row.status_plata_client || 'nespecificat';
    statusDistribution[status] = (statusDistribution[status] || 0) + 1;

    if (row.data_incasarii === '(necompletat)') {
      counters.paid_missing_collection_date++;
      return;
    }

    const paymentDate = toDayStart(row.data_incasarii);
    if (paymentDate < cashFlowStart || paymentDate > cashFlowEnd) return;

    addFacturiRowToBucket(paidInPeriod, row);
    if (row.data_scadenta !== '(necompletat)') {
      const dueDate = toDayStart(row.data_scadenta);
      const delayDays = Math.floor(paymentDate.diff(dueDate, 'days').days);
      const delayKey = reportUtils.getCollectionDelayBucket(delayDays);
      if (delayKey && delayBuckets[delayKey]) {
        addFacturiRowToBucket(delayBuckets[delayKey], {
          ...row,
          intarziere_incasare_zile: delayDays
        });
      }
    } else {
      counters.cashflow_missing_due_date_for_delay++;
      if (delayBuckets.missing_due) {
        addFacturiRowToBucket(delayBuckets.missing_due, {
          ...row,
          intarziere_incasare_zile: null
        });
      }
    }
  });

  if (!statusDistribution.platit) {
    statusDistribution.platit = paidItemsInPeriod.length;
  }
  if (!statusDistribution.neplatit && unpaidItems.length > 0) {
    statusDistribution.neplatit = unpaidItems.length;
  }

  if (paidItemsInPeriod.length === 0) {
    counters.paid_missing_collection_date = 0;
  }

  const overdueSummary = buildFacturiSectionSummary(overdueBuckets);
  const upcomingSummary = buildFacturiSectionSummary(upcomingBuckets);
  const delaySummary = buildFacturiSectionSummary(delayBuckets);

  return {
    metadata: {
      reference_date: referenceDate.toISODate(),
      cashflow_period: { start: startDateStr, end: endDateStr },
      source_counts: {
        unpaid_items: unpaidItems.length,
        paid_items_in_period: paidItemsInPeriod.length
      }
    },
    status_distribution: Object.entries(statusDistribution).map(([status, nr]) => ({ status, nr })),
    counters,
    overdue: {
      buckets: overdueBuckets,
      summary: overdueSummary,
      totals: buildFacturiSectionTotals(overdueBuckets)
    },
    upcoming: {
      buckets: upcomingBuckets,
      summary: upcomingSummary,
      totals: buildFacturiSectionTotals(upcomingBuckets)
    },
    cashflow: {
      collected_in_period: {
        ...paidInPeriod,
        total_pret_client_eur: round2(paidInPeriod.total_pret_client_eur)
      },
      delay_buckets: delayBuckets,
      delay_summary: delaySummary,
      delay_totals: buildFacturiSectionTotals(delayBuckets)
    }
  };
}

function trimAgingItemsForSummary(report) {
  if (!report) return report;
  const clone = JSON.parse(JSON.stringify(report));
  const clearBucketItems = (bucketMap) => {
    Object.values(bucketMap || {}).forEach(bucket => {
      bucket.items = [];
    });
  };

  clearBucketItems(clone.upcoming?.buckets);
  clearBucketItems(clone.cashflow?.delay_buckets);
  if (clone.cashflow?.collected_in_period) clone.cashflow.collected_in_period.items = [];

  // Keep only top 10 for UI quick preview.
  if (clone.overdue?.buckets?.over_90?.items) {
    clone.overdue.buckets.over_90.items = clone.overdue.buckets.over_90.items.slice(0, 10);
  }
  Object.entries(clone.overdue?.buckets || {}).forEach(([key, bucket]) => {
    if (key !== 'over_90') bucket.items = [];
  });

  return clone;
}

function enrichAgingReportWithDetails(report, detailedItems, rowFactory, referenceDate) {
  if (!report || !Array.isArray(detailedItems) || !detailedItems.length || typeof rowFactory !== 'function') return report;
  const detailedMap = new Map();
  detailedItems.forEach((item) => {
    const row = rowFactory(item, { referenceDate });
    if (row?.item_id) detailedMap.set(String(row.item_id), row);
  });

  const updateRows = (rows) => {
    (rows || []).forEach((rowRef) => {
      const detailed = detailedMap.get(String(rowRef.item_id));
      if (!detailed) return;
      const existingDelay = rowRef.intarziere_incasare_zile;
      Object.assign(rowRef, detailed);
      if (existingDelay !== undefined) rowRef.intarziere_incasare_zile = existingDelay;
    });
  };

  Object.values(report.overdue?.buckets || {}).forEach(bucket => updateRows(bucket.items));
  Object.values(report.upcoming?.buckets || {}).forEach(bucket => updateRows(bucket.items));
  updateRows(report.cashflow?.collected_in_period?.items);
  Object.values(report.cashflow?.delay_buckets || {}).forEach(bucket => updateRows(bucket.items));
  return report;
}

async function buildFacturiScadenteData(startDateStr, endDateStr, options = {}) {
  const { includeDetails = true } = options;
  const facturiNeincasateQueryParams = buildStatusAndPositiveAmountQueryParams(
    FACTURI_STATUS_PLATA_COLUMN_ID,
    FACTURI_STATUS_NEINCASAT_INDEXES,
    'deal_value'
  );
  const facturiIncasateInPerioadaQueryParams = buildStatusDateAndPositiveAmountQueryParams(
    FACTURI_STATUS_PLATA_COLUMN_ID,
    FACTURI_STATUS_INCASAT_INDEXES,
    FACTURI_DATA_INCASARII_COLUMN_ID,
    startDateStr,
    endDateStr,
    'deal_value'
  );

  const [rawComenziFacturiNeincasate, rawComenziFacturiIncasateInPerioada] = await Promise.all([
    getAllItems(BOARD_COMENZI, facturiNeincasateQueryParams, FACTURI_COLUMN_IDS_SUMMARY),
    getAllItems(BOARD_COMENZI, facturiIncasateInPerioadaQueryParams, FACTURI_COLUMN_IDS_SUMMARY)
  ]);

  const fullReport = buildFacturiScadenteReport({
    unpaidItems: rawComenziFacturiNeincasate,
    paidItemsInPeriod: rawComenziFacturiIncasateInPerioada
  }, {
    startDateStr,
    endDateStr
  });

  if (!includeDetails) return trimAgingItemsForSummary(fullReport);

  const detailIds = new Set();
  Object.values(fullReport.overdue?.buckets || {}).forEach(bucket => (bucket.items || []).forEach(row => detailIds.add(String(row.item_id))));
  Object.values(fullReport.upcoming?.buckets || {}).forEach(bucket => (bucket.items || []).forEach(row => detailIds.add(String(row.item_id))));
  (fullReport.cashflow?.collected_in_period?.items || []).forEach(row => detailIds.add(String(row.item_id)));

  if (detailIds.size > 0) {
    const detailedItems = await getItemsByIds(Array.from(detailIds), FACTURI_COLUMN_IDS_DETAILS);
    enrichAgingReportWithDetails(
      fullReport,
      detailedItems,
      makeFacturiRow,
      DateTime.fromISO(fullReport.metadata.reference_date, { zone: TZ }).startOf('day')
    );
  }
  return fullReport;
}

async function buildPlatiFurnizoriData(startDateStr, endDateStr, options = {}) {
  const { includeDetails = true } = options;
  const furnizoriNeplatitiQueryParams = buildStatusAndPositiveAmountQueryParams(
    FURNIZORI_STATUS_PLATA_COLUMN_ID,
    FURNIZORI_STATUS_NEPLATIT_INDEXES,
    'numeric_mkpknkjp'
  );
  const furnizoriPlatitiInPerioadaQueryParams = buildStatusDateAndPositiveAmountQueryParams(
    FURNIZORI_STATUS_PLATA_COLUMN_ID,
    FURNIZORI_STATUS_PLATIT_INDEXES,
    FURNIZORI_DATA_PLATII_COLUMN_ID,
    startDateStr,
    endDateStr,
    'numeric_mkpknkjp'
  );

  const [rawFurnizoriNeplatiti, rawFurnizoriPlatitiInPerioada] = await Promise.all([
    getAllItems(BOARD_COMENZI, furnizoriNeplatitiQueryParams, FURNIZORI_COLUMN_IDS_SUMMARY),
    getAllItems(BOARD_COMENZI, furnizoriPlatitiInPerioadaQueryParams, FURNIZORI_COLUMN_IDS_SUMMARY)
  ]);

  const fullReport = buildPlatiFurnizoriReport({
    unpaidItems: rawFurnizoriNeplatiti,
    paidItemsInPeriod: rawFurnizoriPlatitiInPerioada
  }, {
    startDateStr,
    endDateStr
  });

  if (!includeDetails) return trimAgingItemsForSummary(fullReport);

  const detailIds = new Set();
  Object.values(fullReport.overdue?.buckets || {}).forEach(bucket => (bucket.items || []).forEach(row => detailIds.add(String(row.item_id))));
  Object.values(fullReport.upcoming?.buckets || {}).forEach(bucket => (bucket.items || []).forEach(row => detailIds.add(String(row.item_id))));
  (fullReport.cashflow?.collected_in_period?.items || []).forEach(row => detailIds.add(String(row.item_id)));

  if (detailIds.size > 0) {
    const detailedItems = await getItemsByIds(Array.from(detailIds), FURNIZORI_COLUMN_IDS_DETAILS);
    enrichAgingReportWithDetails(
      fullReport,
      detailedItems,
      makeFurnizorRow,
      DateTime.fromISO(fullReport.metadata.reference_date, { zone: TZ }).startOf('day')
    );
  }
  return fullReport;
}

// ====================================================
// REPORT GENERATOR
// ====================================================
async function buildReport(startDateStr, endDateStr, sources, options = {}) {
  const {
    sourcesSolicitari = sources,
    sourcesComenzi = undefined,
    includeFacturi = true,
    includeFacturiDetails = true
  } = options;
  const sourceListSolicitari = Array.isArray(sourcesSolicitari) ? sourcesSolicitari : (Array.isArray(sources) ? sources : []);
  const sourceListComenzi = sourcesComenzi === undefined || sourcesComenzi === null
    ? sourceListSolicitari
    : (Array.isArray(sourcesComenzi) ? sourcesComenzi : []);

  const allowedSolicitari = sourceListSolicitari.map(s => String(s).toLowerCase().trim()).filter(Boolean);
  const allowedComenzi = sourceListComenzi.length > 0
    ? sourceListComenzi.map(s => String(s).toLowerCase().trim()).filter(Boolean)
    : null;

  const start = DateTime.fromISO(startDateStr, { zone: TZ }).startOf('day');
  const end = DateTime.fromISO(endDateStr, { zone: TZ }).endOf('day');

  const counters = { excluded_missing_date: 0, excluded_invalid_date: 0, excluded_source: 0 };

  const processSolicitari = (items) => {
    return items.filter(item => {
      const dateStr = reportUtils.extractDate(item.column_values, 'deal_creation_date', { zone: TZ });
      if (!dateStr) { counters.excluded_missing_date++; return false; }
      const itemDate = DateTime.fromISO(dateStr, { zone: TZ });
      if (!itemDate.isValid) { counters.excluded_invalid_date++; return false; }
      if (itemDate < start || itemDate > end) return false;
      const source = getColValue(item.column_values, 'color_mkpv6sj4');
      if (source === "(necompletat)" || !allowedSolicitari.length || !allowedSolicitari.includes(source.toLowerCase())) {
        counters.excluded_source++;
        return false;
      }
      return true;
    });
  };

  const processComenzi = (items) => {
    return items.filter(item => {
      const dateStr = reportUtils.extractDate(item.column_values, 'deal_creation_date', { zone: TZ });
      if (!dateStr) { counters.excluded_missing_date++; return false; }
      const itemDate = DateTime.fromISO(dateStr, { zone: TZ });
      if (!itemDate.isValid) { counters.excluded_invalid_date++; return false; }
      if (itemDate < start || itemDate > end) return false;
      if (allowedComenzi !== null) {
        const source = getColValue(item.column_values, 'color_mktcvtpz');
        if (source === "(necompletat)" || !allowedComenzi.includes(source.toLowerCase())) {
          counters.excluded_source++;
          return false;
        }
      }
      return true;
    });
  };

  const calcDistribution = (items, mapperFn) => {
    const counts = {};
    items.forEach(item => {
      const val = normalizeBreakdownValue(mapperFn(item));
      counts[val] = (counts[val] || 0) + 1;
    });
    const total = items.length;
    return Object.keys(counts).map(val => ({
      valoare: val,
      nr: counts[val],
      procent: total > 0 ? (counts[val] / total * 100).toFixed(1) : '0.0'
    })).sort((a, b) => b.nr - a.nr);
  };

  console.log('Fetching Solicitari + Comenzi...');
  const solicitariQueryParams = buildDateQueryParams('deal_creation_date', startDateStr, endDateStr);
  const comenziQueryParams = buildDateQueryParams('deal_creation_date', startDateStr, endDateStr);
  const facturiPromise = includeFacturi
    ? buildFacturiScadenteData(startDateStr, endDateStr, { includeDetails: includeFacturiDetails })
    : Promise.resolve(null);
  const furnizoriPromise = includeFacturi
    ? buildPlatiFurnizoriData(startDateStr, endDateStr, { includeDetails: includeFacturiDetails })
    : Promise.resolve(null);

  const [rawSolicitari, rawComenzi, facturiScadente, platiFurnizori] = await Promise.all([
    getAllItems(BOARD_SOLICITARI, solicitariQueryParams, SOLICITARI_COLUMN_IDS),
    getAllItems(BOARD_COMENZI, comenziQueryParams, COMENZI_COLUMN_IDS),
    facturiPromise,
    furnizoriPromise
  ]);

  const validSolicitari = processSolicitari(rawSolicitari);
  const validComenzi = processComenzi(rawComenzi);

  const {
    financials,
    financialsByCurrency,
    mixedCurrencies,
    profit_from_formula_count,
    profit_from_fallback_count,
    profit_missing_count
  } = reportUtils.computeFinancials(validComenzi);

  return {
    metadata: {
      period: { start: startDateStr, end: endDateStr },
      sources: allowedSolicitari,
      sourcesComenzi: allowedComenzi,
      timezone: TZ,
      excluded_missing_date: counters.excluded_missing_date,
      excluded_invalid_date: counters.excluded_invalid_date,
      excluded_source: counters.excluded_source,
      generated_at: new Date().toISOString()
    },
    solicitari: {
      n_total: validSolicitari.length,
      breakdowns: {
        status: calcDistribution(validSolicitari, i => getColValue(i.column_values, 'deal_stage')),
        sursa_client: calcDistribution(validSolicitari, i => getColValue(i.column_values, 'color_mkpv6sj4')),
        moneda: calcDistribution(validSolicitari, i => getColValue(i.column_values, 'color_mksh2abx')),
        tara_incarcare: calcDistribution(validSolicitari, i => getColValue(i.column_values, 'dropdown_mkx6jyjf')),
        tara_descarcare: calcDistribution(validSolicitari, i => getColValue(i.column_values, 'dropdown_mkx687jv')),
        mod_transport: calcDistribution(validSolicitari, i => getColValue(i.column_values, 'color_mkx12a19')),
        tip_marfa: calcDistribution(validSolicitari, i => getColValue(i.column_values, 'color_mksemxby')),
        tara_client: calcDistribution(validSolicitari, i => getColValue(i.column_values, 'dropdown_mkxk7c69'))
      }
    },
    comenzi: {
      n_total: validComenzi.length,
      financials: {
        ...financials,
        mixedCurrencies
      },
      financialsByCurrency,
      profit_from_formula_count,
      profit_from_fallback_count,
      profit_missing_count,
      breakdowns: {
        dep: calcDistribution(validComenzi, i => getColValue(i.column_values, 'color_mktcr7h6')),
        moneda_cursa: calcDistribution(validComenzi, i => getColValue(i.column_values, 'color_mkse3amh')),
        sursa_client: calcDistribution(validComenzi, i => getColValue(i.column_values, 'color_mktcvtpz')),
        implicare: calcDistribution(validComenzi, i => getColValue(i.column_values, 'color_mktaev1d')),
        principal: calcDistribution(validComenzi, i => getColValue(i.column_values, 'deal_owner')),
        mod_transport_principal: calcDistribution(validComenzi, i => getColValue(i.column_values, 'color_mkx1kx5j')),
        tip_marfa: calcDistribution(validComenzi, i => getColValue(i.column_values, 'color_mkse1tmc')),
        ocupare: calcDistribution(validComenzi, i => getColValue(i.column_values, 'color_mkrb3hhk')),
        tip_mijloc_transport: calcDistribution(validComenzi, i => getColValue(i.column_values, 'dropdown_mkx1naw3')),
        tara_incarcare: calcDistribution(validComenzi, i => getColValue(i.column_values, 'dropdown_mktsr9n2')),
        tara_descarcare: calcDistribution(validComenzi, i => getColValue(i.column_values, 'dropdown_mktswwk3')),
        tara_client: calcDistribution(validComenzi, i => getFallbackValue(i.column_values, 'dropdown_mkyq2ne1', 'lookup_mkxttcky'))
      }
    },
    ...(includeFacturi ? { facturi_scadente: facturiScadente, plati_furnizori: platiFurnizori } : {})
  };
}

// ====================================================
// EXCEL EXPORT
// ====================================================
async function generateExcelBuffer(reportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Monday Reporting MVP';

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
  };

  const fills = {
    section: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } },
    header: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } },
    metricHeader: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }
  };

  const styleRowBorders = (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle' };
    });
  };

  const addBreakdownTables = (sheet, breakdowns, startRow = 1) => {
    let currentRow = startRow;
    for (const [title, data] of Object.entries(breakdowns)) {
      const sectionRow = sheet.getRow(currentRow);
      sheet.mergeCells(`A${currentRow}:C${currentRow}`);
      const sectionCell = sheet.getCell(`A${currentRow}`);
      sectionCell.value = title.toUpperCase();
      sectionCell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sectionCell.fill = fills.section;
      sectionCell.alignment = { vertical: 'middle', horizontal: 'left' };
      styleRowBorders(sectionRow);
      currentRow++;
      
      const headerRow = sheet.getRow(currentRow);
      headerRow.values = ['Valoare', 'Nr', '%'];
      headerRow.font = { bold: true };
      headerRow.fill = fills.header;
      headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
      styleRowBorders(headerRow);
      currentRow++;

      data.forEach(row => {
        const dataRow = sheet.getRow(currentRow);
        dataRow.values = [row.valoare, row.nr, `${row.procent}%`];
        styleRowBorders(dataRow);
        dataRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
        dataRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
        currentRow++;
      });
      currentRow += 2; // Spacing
    }
    return currentRow;
  };

  // --- SHEET 1: SOLICITARI ---
  const sheetSol = workbook.addWorksheet('Solicitari');
  sheetSol.columns = [{ width: 42 }, { width: 14 }, { width: 14 }];
  sheetSol.addRow(['Total Solicitari', reportData.solicitari.n_total, '']);
  sheetSol.getRow(1).font = { bold: true, size: 12 };
  sheetSol.getRow(1).fill = fills.metricHeader;
  styleRowBorders(sheetSol.getRow(1));
  sheetSol.getCell('B1').alignment = { vertical: 'middle', horizontal: 'right' };
  addBreakdownTables(sheetSol, reportData.solicitari.breakdowns, 3);

  // --- SHEET 2: COMENZI ---
  const sheetCom = workbook.addWorksheet('Comenzi');
  sheetCom.columns = [{ width: 42 }, { width: 20 }, { width: 18 }];
  const fin = reportData.comenzi.financials;
  const currencyNote = '€';
  sheetCom.addRow(['METRICI FINANCIARE', 'VALOARE', '']);
  sheetCom.getRow(1).font = { bold: true };
  sheetCom.getRow(1).fill = fills.metricHeader;
  styleRowBorders(sheetCom.getRow(1));

  const metricRows = [
    ['Total Comenzi', reportData.comenzi.n_total, 'count'],
    [`Venit Total (${currencyNote})`, fin.total_pret_client, 'currency'],
    [`Venit Mediu/Cursa (${currencyNote})`, fin.avg_pret_client, 'currency'],
    [`Profit Total (${currencyNote})`, fin.total_profit_all, 'currency'],
    [`Profit Mediu/Cursa (${currencyNote})`, fin.avg_profit, 'currency'],
    ['Profitabilitate Medie (%)', fin.profitabilitate_ponderata, 'percent'],
    ['Curs conversie RON→EUR', fin.exchange_rate_ron_eur ?? 5.1, 'rate']
  ];

  metricRows.forEach(([label, value, type]) => {
    const row = sheetCom.addRow([label, value, '']);
    styleRowBorders(row);
    row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    if (value !== null && value !== undefined && typeof value === 'number') {
      if (type === 'currency') row.getCell(2).numFmt = '#,##0.00';
      if (type === 'percent') row.getCell(2).numFmt = '0.00';
      if (type === 'rate') row.getCell(2).numFmt = '0.0000';
    }
  });

  let nextRow = sheetCom.lastRow.number + 2;
  if (reportData.comenzi.financialsByCurrency && Object.keys(reportData.comenzi.financialsByCurrency).length > 0) {
    sheetCom.addRow([]);
    const sectionRow = sheetCom.addRow(['PER MONEDĂ', '', '']);
    sectionRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sectionRow.fill = fills.section;
    sheetCom.mergeCells(`A${sectionRow.number}:C${sectionRow.number}`);
    styleRowBorders(sectionRow);
    for (const [curr, data] of Object.entries(reportData.comenzi.financialsByCurrency)) {
      const rowRevenue = sheetCom.addRow([`${curr} – Venit`, data.total_venue, '']);
      const rowProfit = sheetCom.addRow([`${curr} – Profit`, data.total_profit, '']);
      const rowProfitability = sheetCom.addRow([`${curr} – Profitabilitate %`, data.profitability, '']);
      [rowRevenue, rowProfit, rowProfitability].forEach((row) => {
        styleRowBorders(row);
        row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      });
      rowRevenue.getCell(2).numFmt = '#,##0.00';
      rowProfit.getCell(2).numFmt = '#,##0.00';
      rowProfitability.getCell(2).numFmt = '0.00';
    }
    nextRow = sheetCom.lastRow.number + 2;
  }
  addBreakdownTables(sheetCom, reportData.comenzi.breakdowns, nextRow);

  if (reportData.facturi_scadente) {
    const facturi = reportData.facturi_scadente;

    // --- SHEET 3: FACTURI CLIENTI (SUMMARY) ---
    const sheetFacturi = workbook.addWorksheet('Facturi Clienti - Rezumat');
    sheetFacturi.columns = [{ width: 56 }, { width: 18 }, { width: 18 }, { width: 44 }];
    const summaryHeader = sheetFacturi.addRow(['FACTURI CLIENTI - REZUMAT', '', '', '']);
    sheetFacturi.mergeCells(`A${summaryHeader.number}:D${summaryHeader.number}`);
    summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryHeader.fill = fills.section;
    styleRowBorders(summaryHeader);

    const metadataRows = [
      ['Data referinta scadenta', facturi.metadata.reference_date, '', ''],
      ['Perioada cash flow', `${facturi.metadata.cashflow_period.start} - ${facturi.metadata.cashflow_period.end}`, '', ''],
      ['Total restante neincasate (nr itemi)', facturi.overdue.totals.item_count, '', ''],
      ['Total restante neincasate (EUR)', facturi.overdue.totals.total_pret_client_eur, '', formatCurrencyTotals(facturi.overdue.totals.total_by_currency)],
      ['Total scadente viitoare neincasate (nr itemi)', facturi.upcoming.totals.item_count, '', ''],
      ['Total scadente viitoare neincasate (EUR)', facturi.upcoming.totals.total_pret_client_eur, '', formatCurrencyTotals(facturi.upcoming.totals.total_by_currency)],
      ['Total incasat in perioada (nr itemi)', facturi.cashflow.collected_in_period.item_count, '', ''],
      ['Total incasat in perioada (EUR)', facturi.cashflow.collected_in_period.total_pret_client_eur, '', formatCurrencyTotals(facturi.cashflow.collected_in_period.total_by_currency)]
    ];
    metadataRows.forEach((rowData) => {
      const row = sheetFacturi.addRow(rowData);
      styleRowBorders(row);
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      if (typeof rowData[1] === 'number') row.getCell(2).numFmt = '#,##0.00';
    });

    const addFacturiSummarySection = (title, summaryRows) => {
      sheetFacturi.addRow([]);
      const sectionRow = sheetFacturi.addRow([title, '', '', '']);
      sheetFacturi.mergeCells(`A${sectionRow.number}:D${sectionRow.number}`);
      sectionRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sectionRow.fill = fills.section;
      styleRowBorders(sectionRow);

      const header = sheetFacturi.addRow(['Categorie', 'Nr itemi', 'Total EUR', 'Total pe monede']);
      header.font = { bold: true };
      header.fill = fills.header;
      styleRowBorders(header);

      summaryRows.forEach((rowData) => {
        const row = sheetFacturi.addRow([
          rowData.valoare,
          rowData.nr,
          rowData.total_pret_client_eur,
          formatCurrencyTotals(rowData.total_by_currency)
        ]);
        styleRowBorders(row);
        row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
        row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
        row.getCell(3).numFmt = '#,##0.00';
      });
    };

    addFacturiSummarySection('Restante neincasate dupa scadenta', facturi.overdue.summary);
    addFacturiSummarySection('Scadente viitoare neincasate', facturi.upcoming.summary);
    addFacturiSummarySection('Delay incasare (dupa data scadenta)', facturi.cashflow.delay_summary);

    sheetFacturi.addRow([]);
    const countersTitle = sheetFacturi.addRow(['CALITATE DATE', '', '', '']);
    sheetFacturi.mergeCells(`A${countersTitle.number}:D${countersTitle.number}`);
    countersTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    countersTitle.fill = fills.section;
    styleRowBorders(countersTitle);
    [
      ['Neincasate fara data scadenta', facturi.counters.unpaid_missing_due_date],
      ['Neincasate restante fara factura emisa (Ctr >30 zile)', facturi.counters.unpaid_overdue_without_invoice],
      ['Ignorate: pret client <= 0', facturi.counters.skipped_zero_client_price],
      ['Incasate fara data incasarii', facturi.counters.paid_missing_collection_date],
      ['Incasari in perioada fara data scadenta (pt delay)', facturi.counters.cashflow_missing_due_date_for_delay]
    ].forEach(([label, value]) => {
      const row = sheetFacturi.addRow([label, value, '', '']);
      styleRowBorders(row);
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    });

    // --- SHEET 4: FACTURI CLIENTI (DETAILS) ---
    const sheetFacturiDetalii = workbook.addWorksheet('Facturi Clienti - Detalii');
    const detailHeaders = [
      'Categorie',
      'Nume companie',
      'Data Ctr.',
      'Nr. cursa',
      'Nume principal',
      'Nume secundar',
      'Sursa client',
      'Email contabilitate client',
      'Pret client',
      'Moneda',
      'Client pe',
      'Observatii interne',
      'Termen plata client',
      'Conditii plata client',
      'Data descarcare',
      'Trimite originale clientului?',
      'Motiv plata termen',
      'Nr. factura',
      'Status generare factura',
      'Pret furnizor',
      'Furnizor pe',
      'Plata la (furnizor)',
      'POD',
      'Plata furnizor',
      'Data scadenta',
      'Data emiterii facturii',
      'Zile depasire / pana la scadenta',
      'Data incasarii',
      'Status plata client'
    ];
    sheetFacturiDetalii.columns = [
      { width: 30 }, { width: 28 }, { width: 13 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 },
      { width: 28 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 32 }, { width: 14 }, { width: 18 },
      { width: 14 }, { width: 20 }, { width: 18 }, { width: 14 }, { width: 20 }, { width: 14 }, { width: 13 },
      { width: 18 }, { width: 18 }, { width: 13 }, { width: 16 }, { width: 22 }, { width: 13 }, { width: 15 }
    ];
    const detailsHeader = sheetFacturiDetalii.addRow(detailHeaders);
    detailsHeader.font = { bold: true };
    detailsHeader.fill = fills.header;
    styleRowBorders(detailsHeader);

    const addDetailRowsFromBucket = (bucketMap) => {
      Object.values(bucketMap).forEach(bucket => {
        bucket.items.forEach(rowData => {
          const row = sheetFacturiDetalii.addRow([
            bucket.label,
            normalizeMissing(rowData.nume_companie),
            normalizeMissing(rowData.data_ctr),
            normalizeMissing(rowData.nr_cursa),
            normalizeMissing(rowData.nume_principal),
            normalizeMissing(rowData.nume_secundar),
            normalizeMissing(rowData.sursa_client),
            normalizeMissing(rowData.email_contabilitate_client),
            rowData.pret_client,
            normalizeMissing(rowData.moneda),
            normalizeMissing(rowData.client_pe),
            normalizeMissing(rowData.observatii_interne),
            rowData.termen_plata_client,
            normalizeMissing(rowData.conditii_plata_client),
            normalizeMissing(rowData.data_descarcare),
            normalizeMissing(rowData.trimite_originale_clientului),
            normalizeMissing(rowData.motiv_plata_termen),
            normalizeMissing(rowData.nr_factura),
            normalizeMissing(rowData.status_generare_factura),
            rowData.pret_furnizor,
            normalizeMissing(rowData.furnizor_pe),
            rowData.plata_la_furnizor,
            normalizeMissing(rowData.pod),
            normalizeMissing(rowData.plata_furnizor),
            normalizeMissing(rowData.data_scadenta),
            normalizeMissing(rowData.data_emitere_factura),
            normalizeMissing(rowData.zile_scadenta_info),
            normalizeMissing(rowData.data_incasarii),
            normalizeMissing(rowData.status_plata_client_raw)
          ]);
          styleRowBorders(row);
          row.getCell(9).numFmt = '#,##0.00';
          row.getCell(13).numFmt = '#,##0';
          row.getCell(20).numFmt = '#,##0.00';
          row.getCell(22).numFmt = '#,##0';
        });
      });
    };

    addDetailRowsFromBucket(facturi.overdue.buckets);
    addDetailRowsFromBucket(facturi.upcoming.buckets);

    // --- SHEET 5: CASH FLOW FACTURI CLIENTI ---
    const sheetCashFlow = workbook.addWorksheet('Facturi Clienti - CashFlow');
    sheetCashFlow.columns = [{ width: 42 }, { width: 16 }, { width: 20 }, { width: 44 }];
    const cashHeader = sheetCashFlow.addRow(['CASH FLOW FACTURI', '', '', '']);
    sheetCashFlow.mergeCells(`A${cashHeader.number}:D${cashHeader.number}`);
    cashHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cashHeader.fill = fills.section;
    styleRowBorders(cashHeader);

    [
      ['Perioada analizata', `${facturi.metadata.cashflow_period.start} - ${facturi.metadata.cashflow_period.end}`, '', ''],
      ['Itemi incasati in perioada', facturi.cashflow.collected_in_period.item_count, '', ''],
      ['Total incasat in perioada (EUR)', facturi.cashflow.collected_in_period.total_pret_client_eur, '', formatCurrencyTotals(facturi.cashflow.collected_in_period.total_by_currency)]
    ].forEach(rowData => {
      const row = sheetCashFlow.addRow(rowData);
      styleRowBorders(row);
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      if (typeof rowData[1] === 'number') row.getCell(2).numFmt = '#,##0.00';
    });

    sheetCashFlow.addRow([]);
    const delayTitle = sheetCashFlow.addRow(['Distribuire incasari vs scadenta', '', '', '']);
    sheetCashFlow.mergeCells(`A${delayTitle.number}:D${delayTitle.number}`);
    delayTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    delayTitle.fill = fills.section;
    styleRowBorders(delayTitle);
    const delayHeader = sheetCashFlow.addRow(['Interval', 'Nr itemi', 'Total EUR', 'Total pe monede']);
    delayHeader.font = { bold: true };
    delayHeader.fill = fills.header;
    styleRowBorders(delayHeader);
    facturi.cashflow.delay_summary.forEach((rowData) => {
      const row = sheetCashFlow.addRow([
        rowData.valoare,
        rowData.nr,
        rowData.total_pret_client_eur,
        formatCurrencyTotals(rowData.total_by_currency)
      ]);
      styleRowBorders(row);
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(3).numFmt = '#,##0.00';
    });

    sheetCashFlow.addRow([]);
    const cashDetailsTitle = sheetCashFlow.addRow(['Detalii incasari in perioada', '', '', '']);
    sheetCashFlow.mergeCells(`A${cashDetailsTitle.number}:D${cashDetailsTitle.number}`);
    cashDetailsTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cashDetailsTitle.fill = fills.section;
    styleRowBorders(cashDetailsTitle);
    const cashDetailsHeader = sheetCashFlow.addRow(['Companie', 'Pret client', 'Moneda', 'Detalii']);
    cashDetailsHeader.font = { bold: true };
    cashDetailsHeader.fill = fills.header;
    styleRowBorders(cashDetailsHeader);
    facturi.cashflow.collected_in_period.items.forEach((rowData) => {
      const details = [
        `Scadenta: ${normalizeMissing(rowData.data_scadenta) || '—'}`,
        `Incasare: ${normalizeMissing(rowData.data_incasarii) || '—'}`,
        `Info scadenta: ${getCashflowScadentaInfo(rowData)}`,
        `Principal: ${normalizeMissing(rowData.nume_principal) || '—'}`
      ].join(' | ');
      const row = sheetCashFlow.addRow([
        normalizeMissing(rowData.nume_companie),
        rowData.pret_client,
        normalizeMissing(rowData.moneda),
        details
      ]);
      styleRowBorders(row);
      row.getCell(2).numFmt = '#,##0.00';
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    });
  }

  if (reportData.plati_furnizori) {
    const furnizori = reportData.plati_furnizori;

    const sheetFurnizori = workbook.addWorksheet('Plati Furnizori - Rezumat');
    sheetFurnizori.columns = [{ width: 56 }, { width: 18 }, { width: 18 }, { width: 44 }];
    const summaryHeader = sheetFurnizori.addRow(['PLATI FURNIZORI - REZUMAT', '', '', '']);
    sheetFurnizori.mergeCells(`A${summaryHeader.number}:D${summaryHeader.number}`);
    summaryHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    summaryHeader.fill = fills.section;
    styleRowBorders(summaryHeader);

    const metadataRows = [
      ['Data referinta scadenta', furnizori.metadata.reference_date, '', ''],
      ['Perioada cash flow', `${furnizori.metadata.cashflow_period.start} - ${furnizori.metadata.cashflow_period.end}`, '', ''],
      ['Total restante neplatite (nr itemi)', furnizori.overdue.totals.item_count, '', ''],
      ['Total restante neplatite (EUR)', furnizori.overdue.totals.total_pret_client_eur, '', formatCurrencyTotals(furnizori.overdue.totals.total_by_currency)],
      ['Total scadente viitoare neplatite (nr itemi)', furnizori.upcoming.totals.item_count, '', ''],
      ['Total scadente viitoare neplatite (EUR)', furnizori.upcoming.totals.total_pret_client_eur, '', formatCurrencyTotals(furnizori.upcoming.totals.total_by_currency)],
      ['Total platit in perioada (nr itemi)', furnizori.cashflow.collected_in_period.item_count, '', ''],
      ['Total platit in perioada (EUR)', furnizori.cashflow.collected_in_period.total_pret_client_eur, '', formatCurrencyTotals(furnizori.cashflow.collected_in_period.total_by_currency)]
    ];
    metadataRows.forEach((rowData) => {
      const row = sheetFurnizori.addRow(rowData);
      styleRowBorders(row);
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      if (typeof rowData[1] === 'number') row.getCell(2).numFmt = '#,##0.00';
    });

    const addFurnizoriSummarySection = (title, summaryRows) => {
      sheetFurnizori.addRow([]);
      const sectionRow = sheetFurnizori.addRow([title, '', '', '']);
      sheetFurnizori.mergeCells(`A${sectionRow.number}:D${sectionRow.number}`);
      sectionRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      sectionRow.fill = fills.section;
      styleRowBorders(sectionRow);

      const header = sheetFurnizori.addRow(['Categorie', 'Nr itemi', 'Total EUR', 'Total pe monede']);
      header.font = { bold: true };
      header.fill = fills.header;
      styleRowBorders(header);

      summaryRows.forEach((rowData) => {
        const row = sheetFurnizori.addRow([
          rowData.valoare,
          rowData.nr,
          rowData.total_pret_client_eur,
          formatCurrencyTotals(rowData.total_by_currency)
        ]);
        styleRowBorders(row);
        row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
        row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
        row.getCell(3).numFmt = '#,##0.00';
      });
    };

    addFurnizoriSummarySection('Restante neplatite dupa scadenta', furnizori.overdue.summary);
    addFurnizoriSummarySection('Scadente viitoare neplatite', furnizori.upcoming.summary);
    addFurnizoriSummarySection('Delay plata furnizori (dupa data scadenta)', furnizori.cashflow.delay_summary);

    sheetFurnizori.addRow([]);
    const countersTitle = sheetFurnizori.addRow(['CALITATE DATE', '', '', '']);
    sheetFurnizori.mergeCells(`A${countersTitle.number}:D${countersTitle.number}`);
    countersTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    countersTitle.fill = fills.section;
    styleRowBorders(countersTitle);
    [
      ['Neplatite fara data scadenta', furnizori.counters.unpaid_missing_due_date],
      ['Neplatite restante fara factura furnizor (Ctr >30 zile)', furnizori.counters.unpaid_overdue_without_invoice],
      ['Ignorate: pret furnizor <= 0', furnizori.counters.skipped_zero_client_price],
      ['Platite fara data platii', furnizori.counters.paid_missing_collection_date],
      ['Plati in perioada fara data scadenta (pt delay)', furnizori.counters.cashflow_missing_due_date_for_delay]
    ].forEach(([label, value]) => {
      const row = sheetFurnizori.addRow([label, value, '', '']);
      styleRowBorders(row);
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    });

    const sheetFurnizoriDetalii = workbook.addWorksheet('Plati Furnizori - Detalii');
    const detailHeaders = [
      'Categorie',
      'Nume furnizor',
      'Data Ctr.',
      'Nr. cursa',
      'Nume principal',
      'Nume secundar',
      'Sursa client',
      'Email contabilitate',
      'Pret furnizor',
      'Moneda',
      'Furnizor pe',
      'Observatii interne',
      'Plata la (furnizor)',
      'Conditii plata furnizor',
      'Data descarcare',
      'Trimite originale clientului?',
      'Motiv plata termen',
      'Factura furnizor',
      'POD',
      'Plata furnizor',
      'Data scadenta furnizor',
      'Data plata furnizor',
      'Zile depasire / pana la scadenta',
      'Status plata furnizor'
    ];
    sheetFurnizoriDetalii.columns = [
      { width: 30 }, { width: 28 }, { width: 13 }, { width: 12 }, { width: 18 }, { width: 18 }, { width: 18 },
      { width: 28 }, { width: 14 }, { width: 10 }, { width: 12 }, { width: 32 }, { width: 16 }, { width: 20 },
      { width: 18 }, { width: 14 }, { width: 20 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 },
      { width: 14 }, { width: 22 }, { width: 16 }
    ];
    const detailsHeader = sheetFurnizoriDetalii.addRow(detailHeaders);
    detailsHeader.font = { bold: true };
    detailsHeader.fill = fills.header;
    styleRowBorders(detailsHeader);

    const addSupplierRowsFromBucket = (bucketMap) => {
      Object.values(bucketMap).forEach(bucket => {
        bucket.items.forEach((rowData) => {
          const row = sheetFurnizoriDetalii.addRow([
            bucket.label,
            normalizeMissing(rowData.nume_companie),
            normalizeMissing(rowData.data_ctr),
            normalizeMissing(rowData.nr_cursa),
            normalizeMissing(rowData.nume_principal),
            normalizeMissing(rowData.nume_secundar),
            normalizeMissing(rowData.sursa_client),
            normalizeMissing(rowData.email_contabilitate_client),
            rowData.pret_client,
            normalizeMissing(rowData.moneda),
            normalizeMissing(rowData.furnizor_pe),
            normalizeMissing(rowData.observatii_interne),
            rowData.plata_la_furnizor,
            normalizeMissing(rowData.conditii_plata_client),
            normalizeMissing(rowData.data_descarcare),
            normalizeMissing(rowData.trimite_originale_clientului),
            normalizeMissing(rowData.motiv_plata_termen),
            normalizeMissing(rowData.factura_furnizor),
            normalizeMissing(rowData.pod),
            normalizeMissing(rowData.plata_furnizor),
            normalizeMissing(rowData.data_scadenta),
            normalizeMissing(rowData.data_incasarii),
            normalizeMissing(rowData.zile_scadenta_info),
            normalizeMissing(rowData.status_plata_client_raw)
          ]);
          styleRowBorders(row);
          row.getCell(9).numFmt = '#,##0.00';
          row.getCell(13).numFmt = '#,##0';
        });
      });
    };

    addSupplierRowsFromBucket(furnizori.overdue.buckets);
    addSupplierRowsFromBucket(furnizori.upcoming.buckets);

    const sheetCashFlowFurn = workbook.addWorksheet('Plati Furnizori - CashFlow');
    sheetCashFlowFurn.columns = [{ width: 42 }, { width: 16 }, { width: 20 }, { width: 44 }];
    const cashHeader = sheetCashFlowFurn.addRow(['CASH FLOW FURNIZORI', '', '', '']);
    sheetCashFlowFurn.mergeCells(`A${cashHeader.number}:D${cashHeader.number}`);
    cashHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cashHeader.fill = fills.section;
    styleRowBorders(cashHeader);

    [
      ['Perioada analizata', `${furnizori.metadata.cashflow_period.start} - ${furnizori.metadata.cashflow_period.end}`, '', ''],
      ['Itemi platiti in perioada', furnizori.cashflow.collected_in_period.item_count, '', ''],
      ['Total platit in perioada (EUR)', furnizori.cashflow.collected_in_period.total_pret_client_eur, '', formatCurrencyTotals(furnizori.cashflow.collected_in_period.total_by_currency)]
    ].forEach(rowData => {
      const row = sheetCashFlowFurn.addRow(rowData);
      styleRowBorders(row);
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      if (typeof rowData[1] === 'number') row.getCell(2).numFmt = '#,##0.00';
    });

    sheetCashFlowFurn.addRow([]);
    const delayTitle = sheetCashFlowFurn.addRow(['Distribuire plati vs scadenta furnizor', '', '', '']);
    sheetCashFlowFurn.mergeCells(`A${delayTitle.number}:D${delayTitle.number}`);
    delayTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    delayTitle.fill = fills.section;
    styleRowBorders(delayTitle);
    const delayHeader = sheetCashFlowFurn.addRow(['Interval', 'Nr itemi', 'Total EUR', 'Total pe monede']);
    delayHeader.font = { bold: true };
    delayHeader.fill = fills.header;
    styleRowBorders(delayHeader);
    furnizori.cashflow.delay_summary.forEach((rowData) => {
      const row = sheetCashFlowFurn.addRow([
        rowData.valoare,
        rowData.nr,
        rowData.total_pret_client_eur,
        formatCurrencyTotals(rowData.total_by_currency)
      ]);
      styleRowBorders(row);
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(3).numFmt = '#,##0.00';
    });

    sheetCashFlowFurn.addRow([]);
    const cashDetailsTitle = sheetCashFlowFurn.addRow(['Detalii plati in perioada', '', '', '']);
    sheetCashFlowFurn.mergeCells(`A${cashDetailsTitle.number}:D${cashDetailsTitle.number}`);
    cashDetailsTitle.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cashDetailsTitle.fill = fills.section;
    styleRowBorders(cashDetailsTitle);
    const cashDetailsHeader = sheetCashFlowFurn.addRow(['Furnizor', 'Pret furnizor', 'Moneda', 'Detalii']);
    cashDetailsHeader.font = { bold: true };
    cashDetailsHeader.fill = fills.header;
    styleRowBorders(cashDetailsHeader);
    furnizori.cashflow.collected_in_period.items.forEach((rowData) => {
      const details = [
        `Scadenta furnizor: ${normalizeMissing(rowData.data_scadenta) || '—'}`,
        `Data plata: ${normalizeMissing(rowData.data_incasarii) || '—'}`,
        `Info scadenta: ${getCashflowScadentaInfo(rowData)}`,
        `Principal: ${normalizeMissing(rowData.nume_principal) || '—'}`
      ].join(' | ');
      const row = sheetCashFlowFurn.addRow([
        normalizeMissing(rowData.nume_companie),
        rowData.pret_client,
        normalizeMissing(rowData.moneda),
        details
      ]);
      styleRowBorders(row);
      row.getCell(2).numFmt = '#,##0.00';
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'right' };
    });
  }

  return await workbook.xlsx.writeBuffer();
}

// ====================================================
// EMAIL SERVICE
// ====================================================
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD }
});

async function sendReportEmail(reportData, excelBuffer, options = {}) {
  const {
    recipients = AUTO_REPORT_RECIPIENTS,
    subjectTemplate = AUTO_REPORT_SUBJECT_TEMPLATE,
    attachmentPrefix = 'Raport_googleAds_facturi',
    bodyLabel = 'GoogleAds + Facturi Scadente'
  } = options;
  const { start, end } = reportData.metadata.period;
  const subject = subjectTemplate.replace('{start}', start).replace('{end}', end);
  const text = [
    'Salut,',
    '',
    `Atasat este raportul ${bodyLabel} pentru perioada ${start} - ${end}.`,
    '',
    'Mulțumesc.'
  ].join('\n');

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: recipients.join(', '),
    subject,
    text,
    attachments: [{ filename: `${attachmentPrefix}_${start}_${end}.xlsx`, content: excelBuffer }]
  });
}

// ====================================================
// SCHEDULER (hardcoded Monday 08:00)
// ====================================================
let scheduledJob = null;

function getPreviousFullWeekRange(reference = DateTime.now().setZone(TZ)) {
  const startOfCurrentWeek = reference.startOf('week');
  return {
    start: startOfCurrentWeek.minus({ weeks: 1 }).toFormat('yyyy-MM-dd'),
    end: startOfCurrentWeek.minus({ days: 1 }).toFormat('yyyy-MM-dd')
  };
}

async function runAutomatedWeeklyReport() {
  const { start, end } = getPreviousFullWeekRange();
  const report = await buildReport(start, end, DEFAULT_REPORT_SOURCES, {
    sourcesSolicitari: AUTO_REPORT_SOURCES_SOLICITARI,
    sourcesComenzi: AUTO_REPORT_SOURCES_COMENZI,
    includeFacturi: true,
    includeFacturiDetails: true
  });
  const buffer = await generateExcelBuffer(report);
  await sendReportEmail(report, buffer);

  // Secondary recipients get the same period report without invoice sheets/data.
  if (AUTO_REPORT_RECIPIENTS_NO_FACTURI.length > 0) {
    const reportNoFacturi = { ...report };
    delete reportNoFacturi.facturi_scadente;
    delete reportNoFacturi.plati_furnizori;
    const bufferNoFacturi = await generateExcelBuffer(reportNoFacturi);
    await sendReportEmail(reportNoFacturi, bufferNoFacturi, {
      recipients: AUTO_REPORT_RECIPIENTS_NO_FACTURI,
      subjectTemplate: AUTO_REPORT_SUBJECT_TEMPLATE_NO_FACTURI,
      attachmentPrefix: 'Raport_googleAds',
      bodyLabel: 'GoogleAds'
    });
  }
  return { start, end };
}

function scheduleWeeklyJob() {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
  }
  scheduledJob = cron.schedule(AUTO_REPORT_CRON_EXPRESSION, async () => {
    console.log('[Cron] Running scheduled job...');
    try {
      const { start, end } = await runAutomatedWeeklyReport();
      console.log(`[Cron] Successfully sent report for ${start} - ${end}`);
    } catch (err) {
      console.error('[Cron] Error executing job:', err);
    }
  }, { timezone: TZ });
  console.log(`[Cron] Scheduled: ${AUTO_REPORT_CRON_EXPRESSION} (${TZ})`);
}

// ====================================================
// EXPRESS APP & ROUTES
// ====================================================
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/report', async (req, res) => {
  try {
    const { startDate, endDate, sources, sourcesSolicitari, sourcesComenzi, includeFacturi } = req.body;
    const resolvedSourcesSolicitari = sourcesSolicitari ?? sources;
    const resolvedSourcesComenzi = sourcesComenzi ?? resolvedSourcesSolicitari;
    const report = await buildReport(startDate, endDate, sources || [], {
      sourcesSolicitari: resolvedSourcesSolicitari,
      sourcesComenzi: resolvedSourcesComenzi,
      includeFacturi: includeFacturi === true,
      includeFacturiDetails: false
    });
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/report/facturi', async (req, res) => {
  try {
    const { startDate, endDate, includeDetails, includeFurnizori } = req.body;
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate și endDate sunt obligatorii.' });
    }
    const facturiScadente = await buildFacturiScadenteData(startDate, endDate, {
      includeDetails: includeDetails === true
    });
    if (includeFurnizori === true) {
      const platiFurnizori = await buildPlatiFurnizoriData(startDate, endDate, {
        includeDetails: includeDetails === true
      });
      return res.json({ facturi_scadente: facturiScadente, plati_furnizori: platiFurnizori });
    }
    res.json({ facturi_scadente: facturiScadente });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/excel', async (req, res) => {
  try {
    const { startDate, endDate, sources, sourcesSolicitari, sourcesComenzi } = req.body;
    const resolvedSourcesSolicitari = sourcesSolicitari ?? sources;
    const resolvedSourcesComenzi = sourcesComenzi ?? resolvedSourcesSolicitari;
    const report = await buildReport(startDate, endDate, sources || [], {
      sourcesSolicitari: resolvedSourcesSolicitari,
      sourcesComenzi: resolvedSourcesComenzi,
      includeFacturi: true,
      includeFacturiDetails: true
    });
    const buffer = await generateExcelBuffer(report);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Raport_googleAds_facturi_${startDate}_${endDate}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-test', async (req, res) => {
  try {
    const { start, end } = await runAutomatedWeeklyReport();
    res.json({ success: true, message: `Email trimis cu succes pentru perioada ${start} - ${end}.` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("OK - Monday Reports API is running");
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server started on http://localhost:${PORT}`);
    console.log(`Timezone: ${TZ}`);
    scheduleWeeklyJob();
  });
}

module.exports = {
  app,
  TZ,
  DEFAULT_REPORT_SOURCES,
  AUTO_REPORT_CRON_EXPRESSION,
  buildReport,
  buildFacturiScadenteData,
  buildPlatiFurnizoriData,
  generateExcelBuffer,
  sendReportEmail,
  getPreviousFullWeekRange,
  runAutomatedWeeklyReport
};
