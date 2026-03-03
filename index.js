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
const REPORT_BASE_URL = 'http://localhost:3000';

const BOARD_SOLICITARI = 1905911565;
const BOARD_COMENZI = 2030349838;

// ====================================================
// IN-MEMORY SETTINGS STORE
// ====================================================
let settingsStore = {
  enabled: true,
  dayOfWeek: 1,
  hour: 8,
  minute: 0,
  recipients: ['management@crystal-logistics-services.com'],
  sources: ['website', 'Telefon / WhatsApp Fix', 'newsletter'],
  sourcesComenzi: ['website', 'Telefon / WhatsApp Fix', 'newsletter'],
  subjectTemplate: 'Raport Solicitări & Comenzi – {start} – {end}'
};

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

const delay = ms => new Promise(res => setTimeout(res, ms));

// ====================================================
// MONDAY API CLIENT
// ====================================================
async function fetchBoardItems(boardId, options = {}) {
  const {
    cursor = null,
    retries = 5,
    queryParams = null
  } = options;

  const itemsPageArgs = cursor
    ? `limit: 250, cursor: "${cursor}"`
    : (queryParams ? `limit: 250, query_params: ${queryParams}` : 'limit: 250');

  const query = `
    query {
      boards(ids: [${boardId}]) {
        items_page(${itemsPageArgs}) {
          cursor
          items {
            id
            name
            column_values {
              id
              type
              text
              value
              ... on FormulaValue { display_value }
              ... on NumbersValue { number symbol }
              ... on DateValue { date }
              ... on StatusValue { label }
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

async function getAllItems(boardId, queryParams = null) {
  let items = [];
  let cursor = null;
  do {
    const page = await fetchBoardItems(boardId, { cursor, queryParams });
    if (page && page.items) items.push(...page.items);
    cursor = page ? page.cursor : null;
  } while (cursor);
  return items;
}

// ====================================================
// REPORT GENERATOR
// ====================================================
async function buildReport(startDateStr, endDateStr, sources, options = {}) {
  const {
    sourcesSolicitari = sources,
    sourcesComenzi = undefined
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

  console.log('Fetching Solicitari...');
  const solicitariQueryParams = buildDateQueryParams('deal_creation_date', startDateStr, endDateStr);
  const rawSolicitari = await getAllItems(BOARD_SOLICITARI, solicitariQueryParams);
  const validSolicitari = processSolicitari(rawSolicitari);

  console.log('Fetching Comenzi...');
  const comenziQueryParams = buildDateQueryParams('deal_creation_date', startDateStr, endDateStr);
  const rawComenzi = await getAllItems(BOARD_COMENZI, comenziQueryParams);
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
    }
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

async function sendReportEmail(reportData, excelBuffer, recipients, subjectTemplate) {
  const { start, end } = reportData.metadata.period;
  const subject = subjectTemplate.replace('{start}', start).replace('{end}', end);

  const fin = reportData.comenzi.financials;
  const profitLabel = 'Profit Total (€)';
  const profitVal = fin.total_profit_all != null ? Number(fin.total_profit_all).toLocaleString() : '—';
  const profPondVal = fin.profitabilitate_ponderata != null ? `${fin.profitabilitate_ponderata}%` : '—';
  const html = `
    <h2>Raport Solicitări & Comenzi</h2>
    <p>Perioada: <b>${start}</b> — <b>${end}</b></p>
    <ul>
      <li>Total Solicitări: <b>${reportData.solicitari.n_total}</b></li>
      <li>Total Comenzi/Curse: <b>${reportData.comenzi.n_total}</b></li>
      <li>${profitLabel}: <b>${profitVal}${fin.mixedCurrencies ? '' : ' €'}</b></li>
      <li>Profitabilitate: <b>${profPondVal}</b></li>
    </ul>
    <p><a href="${REPORT_BASE_URL}">Accesează Dashboard-ul Live</a></p>
    <p>Găsești raportul detaliat atașat în format Excel.</p>
  `;

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: recipients.join(', '),
    subject,
    html,
    attachments: [{ filename: `Raport_googleAds_${start}_${end}.xlsx`, content: excelBuffer }]
  });
}

// ====================================================
// SCHEDULER (dynamic from settingsStore)
// ====================================================
let scheduledJob = null;

function scheduleWeeklyJob(store) {
  if (scheduledJob) {
    scheduledJob.stop();
    scheduledJob = null;
  }
  if (!store.enabled) {
    console.log('[Cron] Scheduler disabled in settings.');
    return;
  }
  const minute = Math.max(0, Math.min(59, store.minute ?? 0));
  const hour = Math.max(0, Math.min(23, store.hour ?? 8));
  const dayOfWeek = Math.max(0, Math.min(7, store.dayOfWeek ?? 1));
  // node-cron: minute hour dayOfMonth month dayOfWeek (0-7, 0 and 7 = Sunday)
  const cronExpr = `${minute} ${hour} * * ${dayOfWeek}`;
  scheduledJob = cron.schedule(cronExpr, async () => {
    console.log('[Cron] Running scheduled job...');
    try {
      const end = DateTime.now().setZone(TZ).minus({ days: 1 }).toFormat('yyyy-MM-dd');
      const start = DateTime.now().setZone(TZ).minus({ days: 7 }).toFormat('yyyy-MM-dd');
      const report = await buildReport(start, end, store.sources || [], {
        sourcesSolicitari: store.sources,
        sourcesComenzi: store.sourcesComenzi ?? store.sources
      });
      const buffer = await generateExcelBuffer(report);
      await sendReportEmail(report, buffer, store.recipients || [], store.subjectTemplate || 'Raport');
      console.log(`[Cron] Successfully sent report for ${start} - ${end}`);
    } catch (err) {
      console.error('[Cron] Error executing job:', err);
    }
  }, { timezone: TZ });
  console.log(`[Cron] Scheduled: ${cronExpr} (${TZ})`);
}

// ====================================================
// EXPRESS APP & ROUTES
// ====================================================
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/report', async (req, res) => {
  try {
    const { startDate, endDate, sources, sourcesSolicitari, sourcesComenzi } = req.body;
    const resolvedSourcesSolicitari = sourcesSolicitari ?? sources;
    const resolvedSourcesComenzi = sourcesComenzi ?? resolvedSourcesSolicitari;
    const report = await buildReport(startDate, endDate, sources || [], {
      sourcesSolicitari: resolvedSourcesSolicitari,
      sourcesComenzi: resolvedSourcesComenzi
    });
    res.json(report);
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
      sourcesComenzi: resolvedSourcesComenzi
    });
    const buffer = await generateExcelBuffer(report);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Raport_googleAds_${startDate}_${endDate}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', (req, res) => res.json(settingsStore));

app.post('/api/settings', (req, res) => {
  settingsStore = { ...settingsStore, ...req.body };
  scheduleWeeklyJob(settingsStore);
  res.json({ success: true, settings: settingsStore });
});

app.post('/api/send-test', async (req, res) => {
  try {
    const end = DateTime.now().setZone(TZ).minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const start = DateTime.now().setZone(TZ).minus({ days: 7 }).toFormat('yyyy-MM-dd');
    const report = await buildReport(start, end, settingsStore.sources || [], {
      sourcesSolicitari: settingsStore.sources,
      sourcesComenzi: settingsStore.sourcesComenzi ?? settingsStore.sources
    });
    const buffer = await generateExcelBuffer(report);
    await sendReportEmail(report, buffer, settingsStore.recipients, settingsStore.subjectTemplate);
    
    res.json({ success: true, message: "Email trimis cu succes." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/", (req, res) => {
  res.send("OK - Monday Reports API is running");
});

app.listen(PORT, () => {
  console.log(`Server started on http://localhost:${PORT}`);
  console.log(`Timezone: ${TZ}`);
  scheduleWeeklyJob(settingsStore);
});