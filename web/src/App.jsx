import React, { useState, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  Calendar, Download, Mail, TrendingUp, 
  ShoppingCart, Filter, AlertCircle, ChevronRight,
  FileText, CheckCircle2, Globe, Truck, User, Loader2
} from 'lucide-react';

// ====================================================
// CONFIGURARE ȘI UTILS (Back-end Logic)
// ====================================================

const SOURCES_ALLOWED = ['website', 'Telefon / WhatsApp Fix', 'newsletter'];
const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

const toLocalIsoDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDefaultLastWeekRange = () => {
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() - 1); // yesterday
  const start = new Date(now);
  start.setDate(now.getDate() - 7); // one week ago
  return {
    startDate: toLocalIsoDate(start),
    endDate: toLocalIsoDate(end)
  };
};

/** Format numeric or null: null/undefined => "—", else number with optional currency. No || 0 masking. */
function formatCurrencyOrDash(value, currencyLabel = '€') {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  return currencyLabel ? `${n.toLocaleString()} ${currencyLabel}` : n.toLocaleString();
}

/** Format percent or null: null/undefined => "—", else "X.X%". */
function formatPercentOrDash(value) {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value))) return '—';
  const n = Number(value);
  if (isNaN(n)) return '—';
  return `${n.toFixed(1)}%`;
}

function formatCurrencyMap(totals) {
  if (!totals || typeof totals !== 'object') return '—';
  const entries = Object.entries(totals);
  if (!entries.length) return '—';
  return entries.map(([currency, amount]) => `${currency}: ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`).join(' | ');
}

// ====================================================
// COMPONENTE UI
// ====================================================

const StatCard = ({ label, value, subValue, color = "indigo", icon: Icon }) => {
  const themes = {
    indigo: "text-indigo-600 bg-indigo-50 border-indigo-100",
    emerald: "text-emerald-600 bg-emerald-50 border-emerald-100",
    amber: "text-amber-600 bg-amber-50 border-amber-100",
    rose: "text-rose-600 bg-rose-50 border-rose-100"
  };
  return (
    <div className={`p-5 rounded-2xl border ${themes[color]} shadow-sm transition-all hover:shadow-md`}>
      <div className="flex justify-between items-start mb-2">
        <p className="text-xs font-black uppercase opacity-70 tracking-tighter">{label}</p>
        {Icon && <Icon className="w-4 h-4 opacity-40" />}
      </div>
      <p className="text-3xl font-black tracking-tight">{value}</p>
      {subValue && <p className="text-[10px] mt-1 font-bold opacity-60 uppercase">{subValue}</p>}
    </div>
  );
};

const normalizeBreakdownCellValue = (value) => {
  if (value === null || value === undefined) return 'Nespecificat';
  if (typeof value === 'object') {
    return value.label || value.name || value.title || value.text || 'Nespecificat';
  }
  const str = String(value).trim();
  if (!str) return 'Nespecificat';
  const lowered = str.toLowerCase();
  if (str === '[object Object]' || lowered === '(necompletat)' || lowered === 'necompletat') {
    return 'Nespecificat';
  }
  return str;
};

const TableBreakdown = ({ title, data }) => (
  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</h4>
    </div>
    <div className="overflow-x-auto max-h-[300px] relative">
      <table className="w-full text-sm text-left border-separate border-spacing-0">
        <thead className="text-[10px] text-slate-400 uppercase">
          <tr>
            <th className="px-4 py-2 font-bold bg-slate-50">Valoare</th>
            <th className="px-4 py-2 font-bold text-right bg-slate-50">Nr</th>
            <th className="px-4 py-2 font-bold text-right bg-slate-50">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data?.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-2 font-medium text-slate-700 truncate max-w-[140px]">{normalizeBreakdownCellValue(row.valoare)}</td>
              <td className="px-4 py-2 text-right font-bold">{row.nr}</td>
              <td className="px-4 py-2 text-right">
                <span className="text-xs text-slate-400 font-mono">{row.procent}%</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ====================================================
// MAIN APPLICATION
// ====================================================

export default function App() {
  const defaultRange = getDefaultLastWeekRange();
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  // State pentru filtre
  const [filters, setFilters] = useState({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
    sources: [...SOURCES_ALLOWED],
    sourcesComenzi: [...SOURCES_ALLOWED]
  });

  const generateReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        sources: filters.sources,
        sourcesSolicitari: filters.sources,
        sourcesComenzi: filters.sourcesComenzi ?? []
      };
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error("Eroare la comunicarea cu serverul API.");
      const data = await response.json();
      setReport(data);
    } catch (err) {
      setError(err.message);
      // Fallback la mock data doar pentru vizualizare în preview environment
      console.log("Fallback logic triggered.");
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = async () => {
  setExporting(true);
  try {
    const payload = {
      startDate: filters.startDate,
      endDate: filters.endDate,
      sources: filters.sources,
      sourcesSolicitari: filters.sources,
      sourcesComenzi: filters.sourcesComenzi ?? []
    };
    const response = await fetch("/api/export/excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Raport_googleAds_facturi_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert("Eroare la export Excel: " + err.message);
  } finally {
    setExporting(false);
  }
};

  useEffect(() => {
    generateReport();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-xl shadow-indigo-200 shadow-lg">
              <TrendingUp className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter text-slate-800">MONDAY ANALYTICS</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Crystal Logistics Services</p>
            </div>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold bg-white shadow-sm text-indigo-600">
              <BarChart className="w-4 h-4" /> Dashboard
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-8">
        
        {/* FILTERS BAR */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm mb-8">
          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Interval Raport
              </label>
              <div className="flex items-center gap-2">
                <input 
                  type="date" 
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  value={filters.startDate}
                  onChange={e => setFilters({...filters, startDate: e.target.value})}
                />
                <span className="text-slate-300 font-bold">→</span>
                <input 
                  type="date" 
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                  value={filters.endDate}
                  onChange={e => setFilters({...filters, endDate: e.target.value})}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button 
                onClick={generateReport}
                disabled={loading}
                className="bg-slate-900 hover:bg-black text-black px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                Actualizează Datele
              </button>
              <button 
                onClick={exportExcel}
                disabled={exporting || !report}
                className="bg-white border border-slate-200 hover:bg-slate-50 text-black px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Excel
              </button>
            </div>
          </div>
        </div>

        {/* CONTENT */}
        {report && (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* SOLICITARI SECTION */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-1.5 bg-indigo-600 rounded-full"></div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight">Solicitări Lead-uri</h2>
                </div>
                <div className="flex items-center gap-4 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white px-4 py-2 rounded-full border border-slate-200">
                  <div className="flex items-center gap-1 text-rose-500"><AlertCircle className="w-3 h-3" /> Excluse (Lipsă dată): {report.metadata.excluded_missing_date ?? 0}</div>
                  <div className="flex items-center gap-1 text-amber-500"><AlertCircle className="w-3 h-3" /> Excluse (Dată invalidă): {report.metadata.excluded_invalid_date ?? 0}</div>
                  <div className="flex items-center gap-1 text-amber-600"><AlertCircle className="w-3 h-3" /> Excluse (Sursă): {report.metadata.excluded_source ?? 0}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <StatCard label="Total Solicitări" value={report.solicitari.n_total} icon={FileText} color="indigo" />
                <StatCard label="Top Status" value={report.solicitari.breakdowns.status[0]?.valoare || "-"} subValue={`${report.solicitari.breakdowns.status[0]?.procent}% din total`} color="indigo" />
                <StatCard label="Top Sursă" value={report.solicitari.breakdowns.sursa_client[0]?.valoare || "-"} color="indigo" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-black text-slate-400 uppercase mb-6 tracking-widest">Distribuție Status</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.solicitari.breakdowns.status} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="valoare" type="category" width={110} tick={{fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                        <Bar dataKey="nr" fill="#4F46E5" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <TableBreakdown title="Țară Client (Solicitări)" data={report.solicitari.breakdowns.tara_client} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
                <TableBreakdown title="Mod Transport" data={report.solicitari.breakdowns.mod_transport} />
                <TableBreakdown title="Monedă" data={report.solicitari.breakdowns.moneda} />
                <TableBreakdown title="Țară Încărcare" data={report.solicitari.breakdowns.tara_incarcare} />
                <TableBreakdown title="Țară Descărcare" data={report.solicitari.breakdowns.tara_descarcare} />
              </div>
            </section>

            {/* COMENZI SECTION */}
            <section className="pt-8 border-t border-slate-200">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-8 w-1.5 bg-emerald-600 rounded-full"></div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Comenzi & Curse Finalizate</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <StatCard label="Total Comenzi" value={report.comenzi.n_total} icon={ShoppingCart} color="emerald" />
                <StatCard 
                  label="Venit Total" 
                  value={formatCurrencyOrDash(report.comenzi.financials.total_pret_client, '€')} 
                  subValue={report.comenzi.financials.valid_price_count != null ? `Avg: ${formatCurrencyOrDash(report.comenzi.financials.avg_pret_client, '€')} / cursă (n=${report.comenzi.financials.valid_price_count})` : '—'}
                  color="emerald" 
                />
                <StatCard 
                  label="Profit Total" 
                  value={formatCurrencyOrDash(report.comenzi.financials.total_profit_all, '€')} 
                  subValue={report.comenzi.financials.valid_profit_count != null ? `Avg: ${formatCurrencyOrDash(report.comenzi.financials.avg_profit, '€')} / cursă (n=${report.comenzi.financials.valid_profit_count})` : '—'}
                  color="emerald" 
                />
                <StatCard 
                  label="Profitabilitate Medie" 
                  value={formatPercentOrDash(report.comenzi.financials.profitabilitate_ponderata)} 
                  subValue={report.comenzi.financials.profitabilitate_ponderata == null && report.comenzi.financials.valid_profitability_count === 0 ? 'Insuficiente date pentru calcul' : 'Media coloanei % (formula_mkxwd14p)'}
                  color="amber" 
                />
              </div>
              {report.comenzi.financials?.mixedCurrencies && report.comenzi.financialsByCurrency && Object.keys(report.comenzi.financialsByCurrency).length > 0 && (
                <div className="mb-8 p-4 bg-slate-100 rounded-xl border border-slate-200">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">KPI per monedă</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(report.comenzi.financialsByCurrency).map(([currency, data]) => (
                      <div key={currency} className="bg-white p-4 rounded-lg border border-slate-200">
                        <p className="text-xs font-black text-slate-500 uppercase mb-2">{currency}</p>
                        <p className="text-sm">Venit: {formatCurrencyOrDash(data.total_venue, currency)}</p>
                        <p className="text-sm">Profit: {formatCurrencyOrDash(data.total_profit, currency)}</p>
                        <p className="text-sm">Profitabilitate: {formatPercentOrDash(data.profitability)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-black text-slate-400 uppercase mb-6 tracking-widest">Top Operatori (Principal)</h3>
                  <div className="space-y-4">
                    {report.comenzi.breakdowns.principal.slice(0, 5).map((p, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 group hover:bg-white hover:shadow-md transition-all">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center font-black text-white text-xs border-4 border-white shadow-sm">
                            {p.valoare.charAt(0)}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-slate-800">{p.valoare}</p>
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">{p.nr} Curse Finalizate</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Impact</p>
                          <p className="text-sm font-black text-emerald-600">{p.procent}%</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-xs font-black text-slate-400 uppercase mb-6 tracking-widest">Ocupare Mijloc Transport</h3>
                  <div className="h-64 flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={report.comenzi.breakdowns.ocupare}
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="nr"
                          nameKey="valoare"
                        >
                          {report.comenzi.breakdowns.ocupare.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" align="center" iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <TableBreakdown title="Țară Client (Comenzi)" data={report.comenzi.breakdowns.tara_client} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
                <TableBreakdown title="Mod Transport P." data={report.comenzi.breakdowns.mod_transport_principal} />
                <TableBreakdown title="Implicare" data={report.comenzi.breakdowns.implicare} />
                <TableBreakdown title="Țară Încărcare" data={report.comenzi.breakdowns.tara_incarcare} />
                <TableBreakdown title="Țară Descărcare" data={report.comenzi.breakdowns.tara_descarcare} />
              </div>
            </section>

            {report.facturi_scadente && (
              <section className="pt-8 border-t border-slate-200">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-1.5 bg-rose-600 rounded-full"></div>
                    <h2 className="text-2xl font-black text-slate-800 tracking-tight">Facturi Scadente</h2>
                  </div>
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-white px-4 py-2 rounded-full border border-slate-200">
                    Data referință: {report.facturi_scadente.metadata?.reference_date || '—'}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                  <StatCard
                    label="Restante Neîncasate"
                    value={report.facturi_scadente.overdue?.totals?.item_count ?? 0}
                    subValue={`Total: ${formatCurrencyOrDash(report.facturi_scadente.overdue?.totals?.total_pret_client_eur, '€')}`}
                    icon={AlertCircle}
                    color="rose"
                  />
                  <StatCard
                    label="Scadente Viitoare"
                    value={report.facturi_scadente.upcoming?.totals?.item_count ?? 0}
                    subValue={`Total: ${formatCurrencyOrDash(report.facturi_scadente.upcoming?.totals?.total_pret_client_eur, '€')}`}
                    icon={Calendar}
                    color="amber"
                  />
                  <StatCard
                    label="Încasat în Perioadă"
                    value={formatCurrencyOrDash(report.facturi_scadente.cashflow?.collected_in_period?.total_pret_client_eur, '€')}
                    subValue={`${report.facturi_scadente.cashflow?.collected_in_period?.item_count ?? 0} itemi`}
                    icon={CheckCircle2}
                    color="emerald"
                  />
                  <StatCard
                    label="Întârziere > 90 zile"
                    value={report.facturi_scadente.cashflow?.delay_buckets?.over_90?.item_count ?? 0}
                    subValue="din cele încasate în perioadă"
                    icon={AlertCircle}
                    color="rose"
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <TableBreakdown title="Restanțe după Scadență" data={report.facturi_scadente.overdue?.summary || []} />
                  <TableBreakdown title="Scadențe Viitoare" data={report.facturi_scadente.upcoming?.summary || []} />
                  <TableBreakdown title="Delay Încasare" data={report.facturi_scadente.cashflow?.delay_summary || []} />
                </div>

                <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Top Restanțe {`>`} 90 zile (neîncasate)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[10px] text-slate-400 uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left">Companie</th>
                          <th className="px-4 py-3 text-left">Nr. Cursă</th>
                          <th className="px-4 py-3 text-left">Data Scadență</th>
                          <th className="px-4 py-3 text-right">Zile Depășire</th>
                          <th className="px-4 py-3 text-right">Preț Client</th>
                          <th className="px-4 py-3 text-left">Monedă</th>
                          <th className="px-4 py-3 text-left">Principal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(report.facturi_scadente.overdue?.buckets?.over_90?.items || []).slice(0, 10).map((row, idx) => (
                          <tr key={`${row.item_id || 'row'}-${idx}`} className="hover:bg-slate-50">
                            <td className="px-4 py-3 font-medium text-slate-700">{row.nume_companie || '—'}</td>
                            <td className="px-4 py-3">{row.nr_cursa || '—'}</td>
                            <td className="px-4 py-3">{row.data_scadenta || '—'}</td>
                            <td className="px-4 py-3 text-right font-bold">{row.zile_depasire_scadenta ?? '—'}</td>
                            <td className="px-4 py-3 text-right">{formatCurrencyOrDash(row.pret_client, '')}</td>
                            <td className="px-4 py-3">{row.moneda || '—'}</td>
                            <td className="px-4 py-3">{row.nume_principal || '—'}</td>
                          </tr>
                        ))}
                        {(report.facturi_scadente.overdue?.buckets?.over_90?.items || []).length === 0 && (
                          <tr>
                            <td className="px-4 py-4 text-slate-400" colSpan={7}>Nu există facturi în bucket-ul {`>`} 90 zile.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-slate-100 rounded-xl border border-slate-200 text-xs text-slate-600">
                  <p className="font-bold mb-1">Totaluri pe monedă</p>
                  <p>Restanțe: {formatCurrencyMap(report.facturi_scadente.overdue?.totals?.total_by_currency)}</p>
                  <p>Scadențe viitoare: {formatCurrencyMap(report.facturi_scadente.upcoming?.totals?.total_by_currency)}</p>
                  <p>Încasat în perioadă: {formatCurrencyMap(report.facturi_scadente.cashflow?.collected_in_period?.total_by_currency)}</p>
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-200 mt-12 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2 text-slate-400">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span className="text-[10px] font-black uppercase tracking-widest">Status: Monday API v2 Connected (SSL)</span>
        </div>
        <div className="flex gap-8">
          <div className="text-center">
            <p className="text-xs font-black text-slate-300 uppercase tracking-tighter">Dezvoltat de</p>
            <p className="text-xs font-bold text-slate-500">Diana D. • Crystal Logistics</p>
          </div>
          <div className="text-center">
            <p className="text-xs font-black text-slate-300 uppercase tracking-tighter">Locație Server</p>
            <p className="text-xs font-bold text-slate-500">Bucharest (UTC+2)</p>
          </div>
        </div>
      </footer>
    </div>
  );
}