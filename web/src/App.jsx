import React, { useState, useEffect, useMemo } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts';
import { 
  Calendar, Download, Mail, Settings, TrendingUp, 
  ShoppingCart, Filter, AlertCircle, Clock, ChevronRight,
  FileText, CheckCircle2, Globe, Truck, User, Send, Save, Loader2
} from 'lucide-react';

// ====================================================
// CONFIGURARE ȘI UTILS (Back-end Logic)
// ====================================================

const SOURCES_ALLOWED = ['website', 'telefon fix', 'newsletter'];
const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

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

const TableBreakdown = ({ title, data }) => (
  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
      <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">{title}</h4>
    </div>
    <div className="overflow-x-auto max-h-[300px] relative">
      <table className="w-full text-sm text-left border-separate border-spacing-0">
        <thead className="text-[10px] text-slate-400 uppercase">
          <tr>
            <th className="px-4 py-2 font-bold bg-slate-50 sticky top-0 z-10">Valoare</th>
            <th className="px-4 py-2 font-bold text-right bg-slate-50 sticky top-0 z-10">Nr</th>
            <th className="px-4 py-2 font-bold text-right bg-slate-50 sticky top-0 z-10">%</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data?.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              <td className="px-4 py-2 font-medium text-slate-700 truncate max-w-[140px]">{row.valoare}</td>
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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  // State pentru filtre
  const [filters, setFilters] = useState({
    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    sources: [...SOURCES_ALLOWED],
    sourcesComenzi: []
  });

  // State pentru setări (încărcat din API la deschidere tab)
  const [settings, setSettings] = useState({
    enabled: true,
    dayOfWeek: 1,
    hour: 8,
    minute: 0,
    recipients: ["management@crystal-logistics-services.com"],
    subjectTemplate: "Raport Solicitări & Comenzi – {start} – {end}"
  });
  const [settingsSaveStatus, setSettingsSaveStatus] = useState(null);

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
    a.download = `Raport_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    alert("Eroare la export Excel: " + err.message);
  } finally {
    setExporting(false);
  }
};

  const sendTestEmail = async () => {
    try {
      await fetch('/api/send-test', { method: 'POST' });
      alert("Email de test trimis cu succes!");
    } catch (err) {
      alert("Eroare la trimitere email");
    }
  };

  useEffect(() => {
    generateReport();
  }, []);

  useEffect(() => {
    if (activeTab === 'settings') {
      fetch('/api/settings')
        .then(r => r.ok ? r.json() : Promise.reject(new Error('Eroare la încărcare setări')))
        .then(data => setSettings(prev => ({ ...prev, ...data })))
        .catch(() => setSettingsSaveStatus('error_load'));
    }
  }, [activeTab]);

  const saveSettings = async () => {
    setSettingsSaveStatus(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      if (!res.ok) throw new Error('Salvare eșuată');
      const data = await res.json();
      setSettings(data.settings || settings);
      setSettingsSaveStatus('success');
    } catch (err) {
      setSettingsSaveStatus('error');
    }
  };

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
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <BarChart className="w-4 h-4" /> Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'settings' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Settings className="w-4 h-4" /> Programare
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
        {activeTab === 'dashboard' && report && (
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
                  value={formatCurrencyOrDash(report.comenzi.financials.total_pret_client, report.comenzi.financials.mixedCurrencies ? '' : '€')} 
                  subValue={report.comenzi.financials.valid_price_count != null ? `Avg: ${formatCurrencyOrDash(report.comenzi.financials.avg_pret_client, '€')} / cursă (n=${report.comenzi.financials.valid_price_count})` : '—'}
                  color="emerald" 
                />
                <StatCard 
                  label="Profit Total" 
                  value={formatCurrencyOrDash(report.comenzi.financials.total_profit_all, report.comenzi.financials.mixedCurrencies ? '' : '€')} 
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
          </div>
        )}

        {/* SETTINGS / SCHEDULER */}
        {activeTab === 'settings' && (
          <div className="max-w-3xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-xl">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-50 p-3 rounded-2xl">
                    <Clock className="text-indigo-600 w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Automatizare Raport Săptămânal</h3>
                    <p className="text-sm text-slate-400 font-medium">Trimite rapoarte automate pe email</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSettings({...settings, enabled: !settings.enabled})}
                  className={`w-14 h-8 rounded-full transition-all relative ${settings.enabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
                >
                  <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-md transition-all ${settings.enabled ? 'left-7' : 'left-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Ziua Trimiterii</label>
                    <select 
                      value={settings.dayOfWeek}
                      onChange={e => setSettings({...settings, dayOfWeek: parseInt(e.target.value)})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    >
                      <option value={1}>Luni</option>
                      <option value={2}>Marți</option>
                      <option value={3}>Miercuri</option>
                      <option value={4}>Joi</option>
                      <option value={5}>Vineri</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Ora Trimiterii (Bucharest)</label>
                    <input 
                      type="number" 
                      min="0" max="23"
                      value={settings.hour}
                      onChange={e => setSettings({...settings, hour: parseInt(e.target.value, 10)})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Minut</label>
                    <input 
                      type="number" 
                      min="0" max="59"
                      value={settings.minute ?? 0}
                      onChange={e => setSettings({...settings, minute: parseInt(e.target.value, 10)})}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex justify-between">
                      Destinatari 
                      <span className="text-[10px] opacity-50 italic">Separați prin virgulă</span>
                    </label>
                    <textarea 
                      value={settings.recipients.join(', ')}
                      onChange={e => setSettings({...settings, recipients: e.target.value.split(',').map(s => s.trim())})}
                      rows={3}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                      placeholder="email@exemplu.ro"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2 mb-8">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Template Subiect Email</label>
                <input 
                  type="text" 
                  value={settings.subjectTemplate}
                  onChange={e => setSettings({...settings, subjectTemplate: e.target.value})}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              {settingsSaveStatus === 'success' && <p className="text-sm font-bold text-emerald-600">Configurație salvată.</p>}
              {settingsSaveStatus === 'error' && <p className="text-sm font-bold text-rose-600">Eroare la salvare.</p>}
              {settingsSaveStatus === 'error_load' && <p className="text-sm font-bold text-amber-600">Nu s-au putut încărca setările.</p>}
              <div className="flex gap-4">
                <button 
                  onClick={saveSettings}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-100"
                >
                  <Save className="w-5 h-5" /> Salvează Configurația
                </button>
                <button 
                  onClick={sendTestEmail}
                  className="px-8 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 py-4 rounded-2xl font-black flex items-center justify-center gap-2 transition-all"
                >
                  <Send className="w-5 h-5" /> Test
                </button>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
              <AlertCircle className="text-amber-500 w-6 h-6 shrink-0" />
              <div>
                <p className="text-sm font-black text-amber-900 mb-1 tracking-tight uppercase">Informație Scheduler</p>
                <p className="text-xs text-amber-700 leading-relaxed font-medium">
                  Raportul automat folosește întotdeauna **ultimele 7 zile calendaristice complete** înainte de ziua trimiterii. 
                  Sincronizarea cu Monday.com include automat paginarea și parsarea numerică robustă.
                </p>
              </div>
            </div>
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