'use client';
// ─── REWRITTEN — 3-tab layout: Balance Sheet | Income Statement | Ledger ───
import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/services/api';

type Tab = 'balance-sheet' | 'income-statement';

const NON_PL_CATEGORIES = new Set(['CAPITAL_CONTRIBUTION', 'PARTNER_WITHDRAWAL', 'CLIENT_FUNDING']);

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('balance-sheet');

  // ── Dates ─────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = (() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
  })();
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate,   setEndDate]   = useState(today);

  // ── Balance Sheet ──────────────────────────────────────────────────────
  const [bsData, setBsData] = useState<any>(null);
  const [bsLoading, setBsLoading] = useState(false);
  const [fxTc, setFxTc] = useState<string>('');

  const loadBalanceSheet = () => {
    setBsLoading(true);
    fetchApi('/reports/balance-sheet')
      .then(setBsData)
      .catch(console.error)
      .finally(() => setBsLoading(false));
  };

  // ── Income Statement (P&L) ─────────────────────────────────────────────
  const [pl, setPl]           = useState<any>(null);
  const [plLoading, setPlLoading] = useState(false);

  const loadPL = () => {
    if (!startDate || !endDate) return;
    setPlLoading(true);
    fetchApi(`/reports/daily-pl?startDate=${startDate}&endDate=${endDate}`)
      .then(setPl)
      .catch(console.error)
      .finally(() => setPlLoading(false));
  };

  // ── Initial loads ──────────────────────────────────────────────────────
  useEffect(() => { loadBalanceSheet(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadPL(); }, [startDate, endDate]);

  // ── Filtered P&L lines (exclude non-P&L categories) ───────────────────
  const incomeLines = useMemo(() => {
    if (!pl?.incomeLines) return [];
    return pl.incomeLines.filter((l: any) => !NON_PL_CATEGORIES.has(l.category));
  }, [pl]);

  const expenseLines = useMemo(() => {
    if (!pl?.expenseLines) return [];
    return pl.expenseLines.filter((l: any) => !NON_PL_CATEGORIES.has(l.category));
  }, [pl]);

  const totalIncome  = useMemo(() => incomeLines.reduce((s: number, l: any) => s + Number(l.amount), 0), [incomeLines]);
  const totalExpense = useMemo(() => expenseLines.reduce((s: number, l: any) => s + Number(l.amount), 0), [expenseLines]);
  const netResult    = totalIncome - totalExpense;

  // ── Formatters ─────────────────────────────────────────────────────────
  const fmtARS = (n: number) =>
    `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtUSD = (n: number) =>
    `U$S ${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Tab definitions ────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'balance-sheet',    label: 'Estado de Situación',   icon: '⚖' },
    { id: 'income-statement', label: 'Estado de Resultados',  icon: '📊' },
  ];

  return (
    <div className="w-full animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto pb-12">

      {/* Header */}
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-[#f8fafc] mb-1 tracking-tight">Reportes Contables</h1>
        <p className="text-[#94a3b8]">Estados financieros y libro mayor histórico.</p>
      </header>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-8 glass-panel p-1.5 rounded-2xl border border-[#334155]/50 w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-[#0ea5e9] text-white shadow-lg shadow-[#0ea5e9]/20'
                : 'text-[#64748b] hover:text-[#d1dded] hover:bg-white/5'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TAB 1 — ESTADO DE SITUACIÓN FINANCIERA
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'balance-sheet' && (
        <div className="animate-in fade-in duration-300">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-[#f8fafc]">Estado de Situación Financiera</h2>
              <p className="text-sm text-[#64748b] mt-0.5">Activos, Pasivos y Patrimonio Neto al día de hoy.</p>
            </div>
            <button onClick={loadBalanceSheet} disabled={bsLoading}
              className="px-4 py-2 text-xs bg-[#0ea5e9]/10 border border-[#0ea5e9]/30 rounded-lg text-[#0ea5e9] hover:bg-[#0ea5e9]/20 transition font-semibold disabled:opacity-50">
              {bsLoading ? '…' : '↺ Actualizar'}
            </button>
          </div>
          {bsLoading ? (
            <div className="flex items-center justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-[#0ea5e9] border-t-transparent animate-spin" /></div>
          ) : !bsData ? (
            <div className="glass-panel rounded-2xl p-10 text-center text-[#64748b] border border-[#334155]/50">No hay datos disponibles.</div>
          ) : (() => {
            const totals = bsData.totals || {};
            const agency = Array.isArray(bsData.agencyBoxes) ? bsData.agencyBoxes : [];
            const checks = Array.isArray(bsData.checksInPortfolio) ? bsData.checksInPortfolio : [];
            const ar = Array.isArray(bsData.arPositions) ? bsData.arPositions : [];
            const ap = Array.isArray(bsData.apPositions) ? bsData.apPositions : [];
            const cashARS    = totals.totalEFT_ARS  || 0;
            const cashUSD    = totals.totalEFT_USD  || 0;
            const checksARS  = totals.checksARS     || 0;
            const checksUSD  = totals.checksUSD     || 0;
            const totalAR    = totals.totalAR_ARS   || 0;
            const totalAP    = totals.totalAP_ARS   || 0;
            const commExp    = totals.totalCommExpense_ARS || 0;
            const activo     = totals.totalActivo_ARS  || (cashARS + checksARS + totalAR);
            const activoUSD  = totals.totalActivo_USD  || 0;
            const pasivo     = totals.totalPasivo_ARS  || (totalAP + commExp);
            const pasivoUSD  = totals.totalPasivo_USD  || 0;
            const patrimonio = totals.patrimonioNeto_ARS || (activo - pasivo);
            const patrimonioUSD = totals.patrimonioNeto_USD || (activoUSD - pasivoUSD);
            const fxPos      = bsData.fxPosition || { comprasUSD: 0, ventasUSD: 0, comprasARS: 0, ventasARS: 0, netUSD: 0, totalOps: 0 };
            const aportes    = bsData.capitalContributions || { ARS: 0, USD: 0 };
            return (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ACTIVO */}
                <div className="space-y-4">
                  <div className="glass-panel rounded-2xl border border-[#0ea5e9]/30 bg-[#0ea5e9]/5 overflow-hidden">
                    <div className="px-6 py-4 border-b border-[#0ea5e9]/20">
                      <h3 className="text-base font-bold text-[#0ea5e9] uppercase tracking-wider">Activo</h3>
                      <p className="text-xs text-[#64748b] mt-0.5">Todo lo que la empresa tiene y controla</p>
                    </div>
                    <div className="px-6 py-4">
                      <p className="text-xs font-bold text-[#64748b] uppercase tracking-wider mb-3">Activo Corriente</p>
                      <div className="mb-4">
                        <div className="flex justify-between items-center py-2 border-b border-[#334155]/20">
                          <span className="text-sm text-[#d1dded] font-medium">Caja / Bancos</span>
                          <div className="text-right">
                            <p className="text-sm font-bold font-mono text-[#0ea5e9]">{fmtARS(cashARS)}</p>
                            {cashUSD !== 0 && <p className="text-xs font-mono text-sky-400">{fmtUSD(cashUSD)}</p>}
                          </div>
                        </div>
                        {agency.length > 0 && (
                          <div className="pl-4 mt-1 space-y-1">
                            {agency.map((b: any) => (
                              <div key={b.id} className="flex justify-between text-xs text-[#64748b]">
                                <span>{b.name}</span>
                                <span className="font-mono">{fmtARS(b.balances?.ARS || 0)}{(b.balances?.USD || 0) !== 0 && <span className="text-sky-400 ml-2">{fmtUSD(b.balances.USD)}</span>}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mb-4">
                        <div className="flex justify-between items-center py-2 border-b border-[#334155]/20">
                          <span className="text-sm text-[#d1dded] font-medium">Cuentas por Cobrar</span>
                          <span className="text-sm font-bold font-mono text-emerald-400">{fmtARS(totalAR)}</span>
                        </div>
                        {ar.length > 0 ? (
                          <div className="pl-4 mt-1 space-y-1">
                            {ar.map((p: any) => (
                              <div key={p.clientId} className="flex justify-between text-xs text-[#64748b]">
                                <span>{p.clientName}</span>
                                <div className="text-right">
                                  {p.netARS > 0 && <span className="font-mono text-emerald-500">{fmtARS(p.netARS)}</span>}
                                  {p.netUSD > 0 && <span className="font-mono text-sky-400 ml-2">{fmtUSD(p.netUSD)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : <p className="pl-4 mt-1 text-xs text-[#475569] italic">Sin cuentas por cobrar abiertas</p>}
                      </div>
                      <div>
                        <div className="flex justify-between items-center py-2 border-b border-[#334155]/20">
                          <span className="text-sm text-[#d1dded] font-medium">Cheques en Cartera</span>
                          <div className="text-right">
                            <p className="text-sm font-bold font-mono text-violet-400">{fmtARS(checksARS)}</p>
                            {checksUSD > 0 && <p className="text-xs font-mono text-violet-300">{fmtUSD(checksUSD)}</p>}
                          </div>
                        </div>
                        <p className="pl-4 mt-1 text-xs text-[#475569]">{checks.filter((c: any) => c.currency === 'ARS').length} cheque(s) ARS · {checks.filter((c: any) => c.currency === 'USD').length} cheque(s) USD</p>
                      </div>
                    </div>
                    <div className="px-6 py-4 bg-[#0ea5e9]/10 border-t border-[#0ea5e9]/20 flex justify-between items-center">
                      <span className="font-bold text-[#f8fafc] uppercase tracking-wide text-sm">Total Activo</span>
                      <div className="text-right">
                        <p className="text-xl font-bold font-mono text-[#0ea5e9]">{fmtARS(activo)}</p>
                        {activoUSD !== 0 && <p className="text-sm font-bold font-mono text-sky-400">{fmtUSD(activoUSD)}</p>}
                      </div>
                    </div>
                  </div>
                </div>
                {/* PASIVO Y PATRIMONIO */}
                <div className="space-y-4">
                  <div className="glass-panel rounded-2xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                    <div className="px-6 py-4 border-b border-amber-500/20">
                      <h3 className="text-base font-bold text-amber-400 uppercase tracking-wider">Pasivo</h3>
                      <p className="text-xs text-[#64748b] mt-0.5">Deudas y obligaciones de la empresa</p>
                    </div>
                    <div className="px-6 py-4">
                      <p className="text-xs font-bold text-[#64748b] uppercase tracking-wider mb-3">Pasivo Corriente</p>
                      <div>
                        <div className="flex justify-between items-center py-2 border-b border-[#334155]/20">
                          <span className="text-sm text-[#d1dded] font-medium">Cuentas por Pagar</span>
                          <span className="text-sm font-bold font-mono text-amber-400">{fmtARS(totalAP)}</span>
                        </div>
                        {ap.length > 0 ? (
                          <div className="pl-4 mt-1 space-y-1">
                            {ap.map((p: any) => (
                              <div key={p.clientId} className="flex justify-between text-xs text-[#64748b]">
                                <span>{p.clientName}</span>
                                <div className="text-right">
                                  {p.netARS > 0 && <span className="font-mono text-amber-500">{fmtARS(p.netARS)}</span>}
                                  {p.netUSD > 0 && <span className="font-mono text-amber-300 ml-2">{fmtUSD(p.netUSD)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : <p className="pl-4 mt-1 text-xs text-[#475569] italic">Sin cuentas por pagar abiertas</p>}
                      </div>
                      {commExp > 0 && (
                        <div className="mt-4">
                          <div className="flex justify-between items-center py-2 border-b border-[#334155]/20">
                            <span className="text-sm text-[#d1dded] font-medium">Comisiones por Pagar</span>
                            <span className="text-sm font-bold font-mono text-red-400">{fmtARS(commExp)}</span>
                          </div>
                          <p className="pl-4 mt-1 text-xs text-[#475569] italic">Gastos de comisión devengados pendientes de pago</p>
                        </div>
                      )}
                    </div>
                    <div className="px-6 py-4 bg-amber-500/10 border-t border-amber-500/20 flex justify-between items-center">
                      <span className="font-bold text-[#f8fafc] uppercase tracking-wide text-sm">Total Pasivo</span>
                      <div className="text-right">
                        <p className="text-xl font-bold font-mono text-amber-400">{fmtARS(pasivo)}</p>
                        {pasivoUSD !== 0 && <p className="text-sm font-bold font-mono text-amber-300">{fmtUSD(pasivoUSD)}</p>}
                      </div>
                    </div>
                  </div>
                  <div className={`glass-panel rounded-2xl border overflow-hidden ${patrimonio >= 0 ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <div className={`px-6 py-4 border-b ${patrimonio >= 0 ? 'border-emerald-500/20' : 'border-red-500/20'}`}>
                      <h3 className={`text-base font-bold uppercase tracking-wider ${patrimonio >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>Patrimonio Neto</h3>
                      <p className="text-xs text-[#64748b] mt-0.5">Capital + utilidades acumuladas del ejercicio</p>
                    </div>
                    <div className="px-6 py-4">
                      {(aportes.ARS > 0 || aportes.USD > 0) && (
                        <div className="flex justify-between items-center py-2 border-b border-[#334155]/20">
                          <span className="text-sm text-[#d1dded] font-medium">Aportes de Socios</span>
                          <div className="text-right">
                            <p className={`text-sm font-bold font-mono ${patrimonio >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtARS(aportes.ARS)}</p>
                            {aportes.USD > 0 && <p className={`text-xs font-bold font-mono ${patrimonioUSD >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{fmtUSD(aportes.USD)}</p>}
                          </div>
                        </div>
                      )}
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-[#d1dded] font-medium">Patrimonio Neto</span>
                        <div className="text-right">
                          <p className={`text-sm font-bold font-mono ${patrimonio >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtARS(patrimonio)}</p>
                          {patrimonioUSD !== 0 && <p className={`text-xs font-bold font-mono ${patrimonioUSD >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{fmtUSD(patrimonioUSD)}</p>}
                        </div>
                      </div>
                      <p className="text-xs text-[#475569] mt-1 italic">Activo − Pasivo = Patrimonio Neto</p>
                    </div>
                    <div className={`px-6 py-4 border-t flex justify-between items-center ${patrimonio >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                      <span className="font-bold text-[#f8fafc] uppercase tracking-wide text-sm">Total Patrimonio</span>
                      <div className="text-right">
                        <p className={`text-xl font-bold font-mono ${patrimonio >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{fmtARS(patrimonio)}</p>
                        {patrimonioUSD !== 0 && <p className={`text-sm font-bold font-mono ${patrimonioUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtUSD(patrimonioUSD)}</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* VERIFICACIÓN — full width */}
                <div className="lg:col-span-2">
                  <div className="glass-panel rounded-2xl border border-[#334155]/50 px-6 py-4">
                    <p className="text-xs font-bold text-[#64748b] uppercase tracking-wider mb-2">Verificación: Activo = Pasivo + Patrimonio</p>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-[#0ea5e9] font-bold">{fmtARS(activo)}</span>
                      <span className="text-[#475569] mx-2">=</span>
                      <span className="font-mono text-amber-400 font-bold">{fmtARS(pasivo)}</span>
                      <span className="text-[#475569] mx-2">+</span>
                      <span className={`font-mono font-bold ${patrimonio >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtARS(patrimonio)}</span>
                      <span className={`ml-3 text-xs font-bold px-2 py-0.5 rounded ${Math.abs(activo - pasivo - patrimonio) < 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {Math.abs(activo - pasivo - patrimonio) < 1 ? '✓ Cuadra' : '⚠ Descuadre'}
                      </span>
                    </div>
                    {activoUSD !== 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono text-sky-400 font-bold">{fmtUSD(activoUSD)}</span>
                        <span className="text-[#475569] mx-2">=</span>
                        <span className="font-mono text-amber-300 font-bold">{fmtUSD(pasivoUSD)}</span>
                        <span className="text-[#475569] mx-2">+</span>
                        <span className={`font-mono font-bold ${patrimonioUSD >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{fmtUSD(patrimonioUSD)}</span>
                        <span className={`ml-3 text-xs font-bold px-2 py-0.5 rounded ${Math.abs(activoUSD - pasivoUSD - patrimonioUSD) < 0.01 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {Math.abs(activoUSD - pasivoUSD - patrimonioUSD) < 0.01 ? '✓ Cuadra' : '⚠ Descuadre'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* POSICIÓN NETA FX — full width below the two columns */}
                <div className="lg:col-span-2">
                  <div className="glass-panel rounded-2xl border border-violet-500/30 bg-violet-500/5 overflow-hidden">
                    <div className="px-6 py-4 border-b border-violet-500/20 flex justify-between items-center">
                      <div>
                        <h3 className="text-base font-bold text-violet-400 uppercase tracking-wider">Posición Neta FX</h3>
                        <p className="text-xs text-[#64748b] mt-0.5">Acumulado histórico de compras y ventas de divisas · {fxPos.totalOps} operaciones</p>
                      </div>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full ${fxPos.netUSD >= 0 ? 'bg-violet-500/20 text-violet-300' : 'bg-rose-500/20 text-rose-300'}`}>
                        {fxPos.netUSD >= 0 ? 'Posición Vendedora' : 'Posición Compradora'}
                      </span>
                    </div>
                    <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-[#0f172a]/40 rounded-xl p-4 border border-[#334155]/30">
                        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Compras USD</p>
                        <p className="text-lg font-bold font-mono text-sky-400">{fmtUSD(fxPos.comprasUSD)}</p>
                        <p className="text-xs font-mono text-[#475569] mt-1">{fmtARS(fxPos.comprasARS)} pagados</p>
                      </div>
                      <div className="bg-[#0f172a]/40 rounded-xl p-4 border border-[#334155]/30">
                        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Ventas USD</p>
                        <p className="text-lg font-bold font-mono text-emerald-400">{fmtUSD(fxPos.ventasUSD)}</p>
                        <p className="text-xs font-mono text-[#475569] mt-1">{fmtARS(fxPos.ventasARS)} cobrados</p>
                      </div>
                      <div className="bg-[#0f172a]/40 rounded-xl p-4 border border-[#334155]/30">
                        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Diferencial USD</p>
                        <p className={`text-lg font-bold font-mono ${fxPos.netUSD >= 0 ? 'text-violet-300' : 'text-rose-400'}`}>{fmtUSD(Math.abs(fxPos.netUSD))}</p>
                        <p className="text-xs text-[#475569] mt-1">{fxPos.netUSD >= 0 ? 'Vendidos neto' : 'Comprados neto'}</p>
                      </div>
                      <div className="bg-[#0f172a]/40 rounded-xl p-4 border border-[#334155]/30">
                        <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider mb-2">Diferencial ARS</p>
                        <p className={`text-lg font-bold font-mono ${(fxPos.ventasARS - fxPos.comprasARS) >= 0 ? 'text-violet-300' : 'text-rose-400'}`}>{fmtARS(Math.abs(fxPos.ventasARS - fxPos.comprasARS))}</p>
                        <p className="text-xs text-[#475569] mt-1">{(fxPos.ventasARS - fxPos.comprasARS) >= 0 ? 'ARS cobrados neto' : 'ARS pagados neto'}</p>
                      </div>
                    </div>
                    {/* TC implícito + mark-to-market */}
                    {(() => {
                      const netUSDheld     = fxPos.comprasUSD - fxPos.ventasUSD;   // positivo = tenés USD
                      const netARSreceived = fxPos.ventasARS  - fxPos.comprasARS;  // positivo = recibiste ARS
                      // TC implícito: ARS diferencial / USD diferencial (breakeven de la posición)
                      const tcImplicito = Math.abs(netUSDheld) > 0.001
                        ? Math.abs(netARSreceived) / Math.abs(netUSDheld)
                        : null;
                      const isVendedora = netUSDheld < 0; // vendiste más USD de los que compraste

                      const tc = parseFloat(fxTc);
                      // P&L = ARS netos recibidos + USD netos en mano valorados al TC de referencia
                      const resultado = !isNaN(tc) && tc > 0 ? netARSreceived + netUSDheld * tc : null;

                      return (
                        <div className="border-t border-violet-500/10">
                          {/* Fila 1: TC implícito de la posición */}
                          {tcImplicito !== null && (
                            <div className="px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4 border-b border-violet-500/10">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider">TC de la posición</span>
                                <span className="text-xl font-bold font-mono text-violet-300">
                                  {tcImplicito.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <p className="text-xs text-[#64748b] italic">
                                {isVendedora
                                  ? `Comprá por debajo de este TC → ganás · Comprá por encima → perdés`
                                  : `Vendé por encima de este TC → ganás · Vendé por debajo → perdés`}
                              </p>
                            </div>
                          )}
                          {/* Fila 2: TC de referencia → resultado */}
                          <div className="px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                            <div className="flex items-center gap-3">
                              <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider whitespace-nowrap">TC de referencia</label>
                              <div className="flex items-center bg-[#0f172a]/60 border border-[#334155]/50 rounded-lg px-3 py-1.5">
                                <span className="text-xs text-[#475569] mr-1">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="ej. 1400"
                                  value={fxTc}
                                  onChange={e => setFxTc(e.target.value)}
                                  className="bg-transparent text-sm font-mono text-[#d1dded] w-28 focus:outline-none"
                                />
                              </div>
                            </div>
                            {resultado !== null ? (
                              <div className={`flex items-center gap-3 px-4 py-2 rounded-xl border ${
                                resultado >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'
                              }`}>
                                <span className="text-xs font-bold text-[#64748b] uppercase tracking-wider whitespace-nowrap">
                                  Resultado a TC {tc.toLocaleString('es-AR')}
                                </span>
                                <span className={`text-xl font-bold font-mono ${resultado >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {resultado >= 0 ? '+' : ''}{fmtARS(resultado)}
                                </span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  resultado >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                                }`}>
                                  {resultado >= 0 ? 'Ganancia' : 'Pérdida'}
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs text-[#475569] italic">Ingresá un TC para calcular la ganancia o pérdida sobre el diferencial</p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TAB 2 — ESTADO DE RESULTADOS
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'income-statement' && (
        <div className="animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h2 className="text-xl font-bold text-[#f8fafc]">Estado de Resultados</h2>
              <p className="text-sm text-[#64748b] mt-0.5">Ingresos, gastos y utilidad neta del período.</p>
            </div>
            <div className="glass-panel px-4 py-2 rounded-xl flex items-center gap-3 border border-[#334155]/50">
              <div>
                <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-0.5">Desde</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-[#d1dded] text-sm focus:outline-none" />
              </div>
              <div className="w-px h-7 bg-[#334155]/50" />
              <div>
                <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-0.5">Hasta</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-[#d1dded] text-sm focus:outline-none" />
              </div>
            </div>
          </div>
          {plLoading ? (
            <div className="flex items-center justify-center py-20"><div className="w-8 h-8 rounded-full border-2 border-[#0ea5e9] border-t-transparent animate-spin" /></div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <div className="glass-panel rounded-2xl border border-[#334155]/50 overflow-hidden">
                <div className="px-6 py-4 border-b border-[#334155]/30 bg-emerald-500/5">
                  <p className="text-xs font-bold text-emerald-500/80 uppercase tracking-widest mb-3">Ingresos</p>
                  {incomeLines.length === 0 ? (
                    <p className="text-sm text-[#475569] italic py-2">Sin ingresos en el período</p>
                  ) : (
                    <div className="space-y-2">
                      {incomeLines.map((l: any) => (
                        <div key={l.id} className="flex justify-between text-sm py-1 border-b border-[#334155]/15 last:border-0">
                          <span className="text-[#94a3b8] truncate pr-4">{l.description}</span>
                          <span className="font-mono font-semibold text-emerald-400 shrink-0">+ {fmtARS(Number(l.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-6 py-3 flex justify-between items-center bg-emerald-500/10 border-b border-emerald-500/20">
                  <span className="text-sm font-bold text-emerald-300 uppercase tracking-wide">= Total Ingresos</span>
                  <span className="font-mono font-bold text-emerald-300 text-lg">{fmtARS(totalIncome)}</span>
                </div>
                <div className="px-6 py-4 border-b border-[#334155]/30 bg-red-500/5">
                  <p className="text-xs font-bold text-red-500/80 uppercase tracking-widest mb-3">Gastos</p>
                  {expenseLines.length === 0 ? (
                    <p className="text-sm text-[#475569] italic py-2">Sin gastos en el período</p>
                  ) : (
                    <div className="space-y-2">
                      {expenseLines.map((l: any) => (
                        <div key={l.id} className="flex justify-between text-sm py-1 border-b border-[#334155]/15 last:border-0">
                          <span className="text-[#94a3b8] truncate pr-4">{l.description}</span>
                          <span className="font-mono font-semibold text-red-400 shrink-0">− {fmtARS(Number(l.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-6 py-3 flex justify-between items-center bg-red-500/10 border-b border-red-500/20">
                  <span className="text-sm font-bold text-red-300 uppercase tracking-wide">= Total Gastos</span>
                  <span className="font-mono font-bold text-red-300 text-lg">− {fmtARS(totalExpense)}</span>
                </div>
                <div className={`px-6 py-5 flex justify-between items-center ${netResult >= 0 ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-widest mb-0.5 ${netResult >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>= Utilidad Neta</p>
                    <p className="text-xs text-[#64748b]">Resultado del ejercicio · {startDate} → {endDate}</p>
                  </div>
                  <span className={`font-mono font-black text-3xl ${netResult >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {netResult >= 0 ? '+' : '−'} {fmtARS(Math.abs(netResult))}
                  </span>
                </div>
              </div>
              <p className="text-xs text-[#475569] text-center mt-3 italic">Se excluyen aportes de capital, fondeos de clientes y retiros de socios (no son P&L operativo).</p>
            </div>
          )}
        </div>
      )}


    </div>
  );
}
