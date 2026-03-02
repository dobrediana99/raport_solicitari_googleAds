const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cron = require('node-cron');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');
const { DateTime } = require('luxon');

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
  sources: ['website', 'telefon fix', 'newsletter'],
  subjectTemplate: 'Raport Solicitări & Comenzi – {start} – {end}'
};

// ====================================================
// UTILS & PARSERS
// ====================================================
const parseNumberLoose = (val) => {
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
};

const safeJsonParse = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getColumnById = (colValues, colId) => colValues.find(c => c.id === colId);

const parseDateTextToIsoDate = (text) => {
  const normalized = String(text || '').trim();
  if (!normalized) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}/.test(normalized)) return normalized.slice(0, 10);
  return null;
};

const extractDate = (colValues, colId) => {
  const col = getColumnById(colValues, colId);
  if (!col) return null;

  // Prefer typed date payload from monday.
  const parsed = safeJsonParse(col.value);
  if (parsed && typeof parsed === 'object' && parsed.date) return parsed.date;
  if (col.date) return col.date;
  return parseDateTextToIsoDate(col.text);
};

const getColValue = (colValues, colId) => {
  const col = getColumnById(colValues, colId);
  if (!col) return "(necompletat)";

  // 1) preferă text dacă există
  const t = (col.text ?? "").trim();
  if (t) return t;

  // 1.1) typed monday fields
  if (col.label !== undefined && col.label !== null && String(col.label).trim()) return String(col.label).trim();
  if (col.display_value !== undefined && col.display_value !== null && String(col.display_value).trim()) return String(col.display_value).trim();
  if (col.number !== undefined && col.number !== null && String(col.number).trim()) return String(col.number).trim();
  if (col.date !== undefined && col.date !== null && String(col.date).trim()) return String(col.date).trim();

  // 2) fallback pe value (formula/number/etc.)
  const v = col.value;
  if (v === null || v === undefined || v === "") return "(necompletat)";

  // uneori value e JSON string
  try {
    const parsed = typeof v === "string" ? JSON.parse(v) : v;
    // dacă găsești o cheie utilă, returneaz-o; altfel stringify
    if (parsed && typeof parsed === "object") {
      if (parsed.value !== undefined) return String(parsed.value);
      if (parsed.text !== undefined) return String(parsed.text);
    }
    return String(parsed);
  } catch {
    return String(v).trim();
  }
};

const getNumericColumnValue = (colValues, colId) => {
  const col = getColumnById(colValues, colId);
  if (!col) return null;

  const numericFromTypedFields = [
    col.display_value,
    col.number,
    col.text
  ];

  for (const candidate of numericFromTypedFields) {
    const parsed = parseNumberLoose(candidate);
    if (parsed !== null) return parsed;
  }

  const parsedValue = safeJsonParse(col.value);
  if (typeof parsedValue === 'number' || typeof parsedValue === 'string') {
    return parseNumberLoose(parsedValue);
  }

  if (parsedValue && typeof parsedValue === 'object') {
    for (const key of ['number', 'value', 'text', 'display_value']) {
      const parsed = parseNumberLoose(parsedValue[key]);
      if (parsed !== null) return parsed;
    }
  }

  return parseNumberLoose(col.value);
};

const getFallbackValue = (colValues, primaryId, fallbackId) => {
  let val = getColValue(colValues, primaryId);
  if (val === "(necompletat)") val = getColValue(colValues, fallbackId);
  return val;
};

const delay = ms => new Promise(res => setTimeout(res, ms));

// ====================================================
// MONDAY API CLIENT
// ====================================================
async function fetchBoardItems(boardId, cursor = null, retries = 5) {
  const query = `
    query ($boardId: ID!, $cursor: String) {
      boards(ids: [$boardId]) {
        items_page(limit: 250, cursor: $cursor) {
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
            }
          }
        }
      }
    }
  `;
  
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.post('https://api.monday.com/v2', 
        { query, variables: { boardId, cursor } },
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

async function getAllItems(boardId) {
  let items = [];
  let cursor = null;
  do {
    const page = await fetchBoardItems(boardId, cursor);
    if (page && page.items) items.push(...page.items);
    cursor = page ? page.cursor : null;
  } while (cursor);
  return items;
}

// ====================================================
// REPORT GENERATOR
// ====================================================
async function buildReport(startDateStr, endDateStr, sourcesSolicitari = [], sourcesComenzi = []) {
  const normalizeSources = (sources) => (
    Array.isArray(sources)
      ? sources.map(s => String(s).toLowerCase().trim()).filter(Boolean)
      : []
  );
  const allowedSolicitariSources = normalizeSources(sourcesSolicitari);
  const allowedComenziSources = normalizeSources(sourcesComenzi);

  const start = DateTime.fromISO(startDateStr, { zone: TZ }).startOf('day');
  const end = DateTime.fromISO(endDateStr, { zone: TZ }).endOf('day');

  let counters = { excluded_missing_date: 0, excluded_invalid_date: 0, excluded_source: 0 };
  
  const processItems = (items, dateColId, sourceColId, options = {}) => {
    const {
      allowedSources = [],
      applySourceFilter = true
    } = options;

    const shouldFilterBySource = applySourceFilter && allowedSources.length > 0;

    return items.filter(item => {
      const dateStr = extractDate(item.column_values, dateColId);
      if (!dateStr) { counters.excluded_missing_date++; return false; }
      
      const itemDate = DateTime.fromISO(dateStr, { zone: TZ });
      if (!itemDate.isValid) { counters.excluded_invalid_date++; return false; }
      if (itemDate < start || itemDate > end) return false;

      if (shouldFilterBySource) {
        const source = getColValue(item.column_values, sourceColId);
        if (source === "(necompletat)" || !allowedSources.includes(source.toLowerCase())) {
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
      const val = mapperFn(item);
      counts[val] = (counts[val] || 0) + 1;
    });
    const total = items.length;
    return Object.keys(counts).map(val => ({
      valoare: val,
      nr: counts[val],
      procent: total > 0 ? (counts[val] / total * 100).toFixed(1) : "0.0"
    })).sort((a, b) => b.nr - a.nr);
  };

  console.log(`Fetching Solicitari...`);
  const rawSolicitari = await getAllItems(BOARD_SOLICITARI);
  const validSolicitari = processItems(rawSolicitari, 'deal_creation_date', 'color_mkpv6sj4', {
    allowedSources: allowedSolicitariSources,
    applySourceFilter: true
  });

  console.log(`Fetching Comenzi...`);
  const rawComenzi = await getAllItems(BOARD_COMENZI);
  const validComenzi = processItems(rawComenzi, 'deal_creation_date', 'color_mktcvtpz', {
    allowedSources: allowedComenziSources,
    applySourceFilter: allowedComenziSources.length > 0
  });

  // Aggregations Comenzi
  let total_pret_client = 0, total_profit_all = 0;
  let valid_price_count = 0, valid_profit_count = 0;
  let sum_profit_ponderat = 0, sum_pret_ponderat = 0;
  let profit_from_formula_count = 0, profit_from_fallback_count = 0, profit_missing_count = 0;

  validComenzi.forEach(item => {
    const pret = getNumericColumnValue(item.column_values, 'deal_value');
    const pretFurnizor = getNumericColumnValue(item.column_values, 'numeric_mkpknkjp');
    const profitFormula = getNumericColumnValue(item.column_values, 'formula_mkre3gx1');
    let profit = profitFormula;

    if (profitFormula !== null) {
      profit_from_formula_count++;
    } else if (pret !== null && pretFurnizor !== null) {
      profit = pret - pretFurnizor;
      profit_from_fallback_count++;
    } else {
      profit_missing_count++;
    }

    if (pret !== null) { total_pret_client += pret; valid_price_count++; }
    if (profit !== null) { total_profit_all += profit; valid_profit_count++; }
    
    if (pret !== null && pret > 0 && profit !== null) {
      sum_pret_ponderat += pret;
      sum_profit_ponderat += profit;
    }
  });

  return {
    metadata: {
      period: { start: startDateStr, end: endDateStr },
      sources: allowedSolicitariSources,
      sources_solicitari: allowedSolicitariSources,
      sources_comenzi: allowedComenziSources,
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
        total_pret_client,
        avg_pret_client: valid_price_count > 0 ? parseFloat((total_pret_client / valid_price_count).toFixed(2)) : null,
        total_profit_all,
        avg_profit: valid_profit_count > 0 ? parseFloat((total_profit_all / valid_profit_count).toFixed(2)) : null,
        profitabilitate_ponderata: sum_pret_ponderat > 0 ? parseFloat((sum_profit_ponderat / sum_pret_ponderat * 100).toFixed(2)) : null,
        valid_price_count,
        valid_profit_count,
        profit_from_formula_count,
        profit_from_fallback_count,
        profit_missing_count
      },
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

  // --- SHEET 1: METADATA ---
  const sheetMeta = workbook.addWorksheet('Metadata');
  sheetMeta.columns = [{ header: 'Cheie', key: 'k', width: 25 }, { header: 'Valoare', key: 'v', width: 40 }];
  sheetMeta.addRow({ k: 'Perioada', v: `${reportData.metadata.period.start} - ${reportData.metadata.period.end}` });
  sheetMeta.addRow({ k: 'Surse filtrate', v: reportData.metadata.sources.join(', ') });
  sheetMeta.addRow({ k: 'Generat la', v: reportData.metadata.generated_at });
  sheetMeta.addRow({ k: 'Itemi excluși (Lipsă dată)', v: reportData.metadata.excluded_missing_date });
  sheetMeta.addRow({ k: 'Itemi excluși (Dată invalidă)', v: reportData.metadata.excluded_invalid_date ?? 0 });
  sheetMeta.addRow({ k: 'Itemi excluși (Sursă invalidă)', v: reportData.metadata.excluded_source });
  sheetMeta.getRow(1).font = { bold: true };

  const addBreakdownTables = (sheet, breakdowns, startRow = 1) => {
    let currentRow = startRow;
    for (const [title, data] of Object.entries(breakdowns)) {
      sheet.getCell(`A${currentRow}`).value = title.toUpperCase();
      sheet.getCell(`A${currentRow}`).font = { bold: true };
      currentRow++;
      
      sheet.getRow(currentRow).values = ['Valoare', 'Nr', '%'];
      sheet.getRow(currentRow).font = { bold: true };
      currentRow++;

      data.forEach(row => {
        sheet.getRow(currentRow).values = [row.valoare, row.nr, `${row.procent}%`];
        currentRow++;
      });
      currentRow += 2; // Spacing
    }
  };

  // --- SHEET 2: SOLICITARI ---
  const sheetSol = workbook.addWorksheet('Solicitari');
  sheetSol.columns = [{ width: 35 }, { width: 15 }, { width: 15 }];
  sheetSol.addRow(['Total Solicitari', reportData.solicitari.n_total]);
  sheetSol.getRow(1).font = { bold: true, size: 12 };
  addBreakdownTables(sheetSol, reportData.solicitari.breakdowns, 3);

  // --- SHEET 3: COMENZI ---
  const sheetCom = workbook.addWorksheet('Comenzi');
  sheetCom.columns = [{ width: 35 }, { width: 15 }, { width: 15 }];
  const fin = reportData.comenzi.financials;
  sheetCom.addRow(['METRICI FINANCIARE', 'VALOARE']);
  sheetCom.getRow(1).font = { bold: true };
  sheetCom.addRow(['Total Comenzi', reportData.comenzi.n_total]);
  sheetCom.addRow(['Venit Total (€)', fin.total_pret_client]);
  sheetCom.addRow(['Venit Mediu/Cursa (€)', fin.avg_pret_client]);
  sheetCom.addRow(['Profit Total (€)', fin.total_profit_all]);
  sheetCom.addRow(['Profit Mediu/Cursa (€)', fin.avg_profit]);
  sheetCom.addRow(['Profitabilitate Ponderata (%)', fin.profitabilitate_ponderata]);
  addBreakdownTables(sheetCom, reportData.comenzi.breakdowns, 9);

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

  const html = `
    <h2>Raport Solicitări & Comenzi</h2>
    <p>Perioada: <b>${start}</b> — <b>${end}</b></p>
    <ul>
      <li>Total Solicitări: <b>${reportData.solicitari.n_total}</b></li>
      <li>Total Comenzi/Curse: <b>${reportData.comenzi.n_total}</b></li>
      <li>Profit Total: <b>${reportData.comenzi.financials.total_profit_all.toLocaleString()} €</b></li>
      <li>Profitabilitate: <b>${reportData.comenzi.financials.profitabilitate_ponderata}%</b></li>
    </ul>
    <p><a href="${REPORT_BASE_URL}">Accesează Dashboard-ul Live</a></p>
    <p>Găsești raportul detaliat atașat în format Excel.</p>
  `;

  await transporter.sendMail({
    from: EMAIL_FROM,
    to: recipients.join(', '),
    subject,
    html,
    attachments: [{ filename: `Raport_${start}_${end}.xlsx`, content: excelBuffer }]
  });
}

// ====================================================
// SCHEDULER
// ====================================================
cron.schedule('0 8 * * 1', async () => {
  console.log(`[Cron] Running weekly job...`);
  if (!settingsStore.enabled) {
    console.log(`[Cron] Job is disabled in settings. Skipping.`);
    return;
  }
  try {
    const end = DateTime.now().setZone(TZ).minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const start = DateTime.now().setZone(TZ).minus({ days: 7 }).toFormat('yyyy-MM-dd');
    
    const report = await buildReport(start, end, settingsStore.sources, []);
    const buffer = await generateExcelBuffer(report);
    await sendReportEmail(report, buffer, settingsStore.recipients, settingsStore.subjectTemplate);
    console.log(`[Cron] Successfully sent report for ${start} - ${end}`);
  } catch (err) {
    console.error(`[Cron] Error executing job:`, err);
  }
}, { timezone: TZ });

// ====================================================
// EXPRESS APP & ROUTES
// ====================================================
const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/report', async (req, res) => {
  try {
    const { startDate, endDate, sources, sourcesSolicitari, sourcesComenzi } = req.body;
    const resolvedSourcesSolicitari = Array.isArray(sourcesSolicitari)
      ? sourcesSolicitari
      : (Array.isArray(sources) ? sources : []);
    const resolvedSourcesComenzi = Array.isArray(sourcesComenzi) ? sourcesComenzi : [];
    const report = await buildReport(startDate, endDate, resolvedSourcesSolicitari, resolvedSourcesComenzi);
    res.json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/export/excel', async (req, res) => {
  try {
    const { startDate, endDate, sources, sourcesSolicitari, sourcesComenzi } = req.body;
    const resolvedSourcesSolicitari = Array.isArray(sourcesSolicitari)
      ? sourcesSolicitari
      : (Array.isArray(sources) ? sources : []);
    const resolvedSourcesComenzi = Array.isArray(sourcesComenzi) ? sourcesComenzi : [];
    const report = await buildReport(startDate, endDate, resolvedSourcesSolicitari, resolvedSourcesComenzi);
    const buffer = await generateExcelBuffer(report);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="raport_${startDate}_${endDate}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', (req, res) => res.json(settingsStore));

app.post('/api/settings', (req, res) => {
  settingsStore = { ...settingsStore, ...req.body };
  res.json({ success: true, settings: settingsStore });
});

app.post('/api/send-test', async (req, res) => {
  try {
    const end = DateTime.now().setZone(TZ).minus({ days: 1 }).toFormat('yyyy-MM-dd');
    const start = DateTime.now().setZone(TZ).minus({ days: 7 }).toFormat('yyyy-MM-dd');
    
    const report = await buildReport(start, end, settingsStore.sources, []);
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
});