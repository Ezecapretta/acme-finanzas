'use client';
// ─── 3-tab layout: Balance Sheet | Income Statement | Ledger ───
import { useState, useEffect, useMemo } from 'react';
import { fetchApi } from '@/services/api';
import { Card } from '@/components/ui/Card';

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
    <div className="mx-auto w-full max-w-6xl animate-in fade-in duration-500 pb-12">

      {/* Header */}
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Reportes Contables</h1>
        <p className="mt-1 text-[13.5px] text-muted">Estados financieros y libro mayor histórico.</p>
      </header>

      {/* Tabs */}
      <div className="mb-8 flex w-fit flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1.5">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-ink text-white shadow-sm'
                : 'text-muted hover:bg-track hover:text-ink'
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
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-ink">Estado de Situación Financiera</h2>
              <p className="mt-0.5 text-sm text-faint">Activos, Pasivos y Patrimonio Neto al día de hoy.</p>
            </div>
            <button onClick={loadBalanceSheet} disabled={bsLoading}
              className="rounded-lg border border-accent/30 bg-accent-bg px-4 py-2 text-xs font-semibold text-accent transition hover:opacity-80 disabled:opacity-50">
              {bsLoading ? '…' : '↺ Actualizar'}
            </button>
          </div>
          {bsLoading ? (
            <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>
          ) : !bsData ? (
            <Card className="p-10 text-center text-faint">No hay datos disponibles.</Card>
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
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                {/* ACTIVO */}
                <div className="space-y-4">
                  <Card className="overflow-hidden">
                    <div className="border-b border-line bg-accent-bg px-6 py-4">
                      <h3 className="text-base font-bold uppercase tracking-wider text-accent">Activo</h3>
                      <p className="mt-0.5 text-xs text-faint">Todo lo que la empresa tiene y controla</p>
                    </div>
                    <div className="px-6 py-4">
                      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-faint">Activo Corriente</p>
                      <div className="mb-4">
                        <div className="flex items-center justify-between border-b border-line py-2">
                          <span className="text-sm font-medium text-ink">Caja / Bancos</span>
                          <div className="text-right">
                            <p className="font-mono text-sm font-bold text-accent">{fmtARS(cashARS)}</p>
                            {cashUSD !== 0 && <p className="font-mono text-xs text-ink">{fmtUSD(cashUSD)}</p>}
                          </div>
                        </div>
                        {agency.length > 0 && (
                          <div className="mt-1 space-y-1 pl-4">
                            {agency.map((b: any) => (
                              <div key={b.id} className="flex justify-between text-xs text-faint">
                                <span>{b.name}</span>
                                <span className="font-mono">{fmtARS(b.balances?.ARS || 0)}{(b.balances?.USD || 0) !== 0 && <span className="ml-2 text-ink">{fmtUSD(b.balances.USD)}</span>}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="mb-4">
                        <div className="flex items-center justify-between border-b border-line py-2">
                          <span className="text-sm font-medium text-ink">Cuentas por Cobrar</span>
                          <span className="font-mono text-sm font-bold text-positive">{fmtARS(totalAR)}</span>
                        </div>
                        {ar.length > 0 ? (
                          <div className="mt-1 space-y-1 pl-4">
                            {ar.map((p: any) => (
                              <div key={p.clientId} className="flex justify-between text-xs text-faint">
                                <span>{p.clientName}</span>
                                <div className="text-right">
                                  {p.netARS > 0 && <span className="font-mono text-positive">{fmtARS(p.netARS)}</span>}
                                  {p.netUSD > 0 && <span className="ml-2 font-mono text-ink">{fmtUSD(p.netUSD)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : <p className="mt-1 pl-4 text-xs italic text-faint">Sin cuentas por cobrar abiertas</p>}
                      </div>
                      <div>
                        <div className="flex items-center justify-between border-b border-line py-2">
                          <span className="text-sm font-medium text-ink">Cheques en Cartera</span>
                          <div className="text-right">
                            <p className="font-mono text-sm font-bold text-accent">{fmtARS(checksARS)}</p>
                            {checksUSD > 0 && <p className="font-mono text-xs text-accent">{fmtUSD(checksUSD)}</p>}
                          </div>
                        </div>
                        <p className="mt-1 pl-4 text-xs text-faint">{checks.filter((c: any) => c.currency === 'ARS').length} cheque(s) ARS · {checks.filter((c: any) => c.currency === 'USD').length} cheque(s) USD</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-line bg-accent-bg px-6 py-4">
                      <span className="text-sm font-bold uppercase tracking-wide text-ink">Total Activo</span>
                      <div className="text-right">
                        <p className="font-mono text-xl font-bold text-accent">{fmtARS(activo)}</p>
                        {activoUSD !== 0 && <p className="font-mono text-sm font-bold text-ink">{fmtUSD(activoUSD)}</p>}
                      </div>
                    </div>
                  </Card>
                </div>
                {/* PASIVO Y PATRIMONIO */}
                <div className="space-y-4">
                  <Card className="overflow-hidden">
                    <div className="border-b border-line bg-warn-bg px-6 py-4">
                      <h3 className="text-base font-bold uppercase tracking-wider text-warn">Pasivo</h3>
                      <p className="mt-0.5 text-xs text-faint">Deudas y obligaciones de la empresa</p>
                    </div>
                    <div className="px-6 py-4">
                      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-faint">Pasivo Corriente</p>
                      <div>
                        <div className="flex items-center justify-between border-b border-line py-2">
                          <span className="text-sm font-medium text-ink">Cuentas por Pagar</span>
                          <span className="font-mono text-sm font-bold text-warn">{fmtARS(totalAP)}</span>
                        </div>
                        {ap.length > 0 ? (
                          <div className="mt-1 space-y-1 pl-4">
                            {ap.map((p: any) => (
                              <div key={p.clientId} className="flex justify-between text-xs text-faint">
                                <span>{p.clientName}</span>
                                <div className="text-right">
                                  {p.netARS > 0 && <span className="font-mono text-warn">{fmtARS(p.netARS)}</span>}
                                  {p.netUSD > 0 && <span className="ml-2 font-mono text-warn">{fmtUSD(p.netUSD)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : <p className="mt-1 pl-4 text-xs italic text-faint">Sin cuentas por pagar abiertas</p>}
                      </div>
                      {commExp > 0 && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between border-b border-line py-2">
                            <span className="text-sm font-medium text-ink">Comisiones por Pagar</span>
                            <span className="font-mono text-sm font-bold text-negative">{fmtARS(commExp)}</span>
                          </div>
                          <p className="mt-1 pl-4 text-xs italic text-faint">Gastos de comisión devengados pendientes de pago</p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-line bg-warn-bg px-6 py-4">
                      <span className="text-sm font-bold uppercase tracking-wide text-ink">Total Pasivo</span>
                      <div className="text-right">
                        <p className="font-mono text-xl font-bold text-warn">{fmtARS(pasivo)}</p>
                        {pasivoUSD !== 0 && <p className="font-mono text-sm font-bold text-warn">{fmtUSD(pasivoUSD)}</p>}
                      </div>
                    </div>
                  </Card>
                  <Card className="overflow-hidden">
                    <div className={`border-b border-line px-6 py-4 ${patrimonio >= 0 ? 'bg-positive-bg' : 'bg-negative-bg'}`}>
                      <h3 className={`text-base font-bold uppercase tracking-wider ${patrimonio >= 0 ? 'text-positive' : 'text-negative'}`}>Patrimonio Neto</h3>
                      <p className="mt-0.5 text-xs text-faint">Capital + utilidades acumuladas del ejercicio</p>
                    </div>
                    <div className="px-6 py-4">
                      {(aportes.ARS > 0 || aportes.USD > 0) && (
                        <div className="flex items-center justify-between border-b border-line py-2">
                          <span className="text-sm font-medium text-ink">Aportes de Socios</span>
                          <div className="text-right">
                            <p className={`font-mono text-sm font-bold ${patrimonio >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtARS(aportes.ARS)}</p>
                            {aportes.USD > 0 && <p className={`font-mono text-xs font-bold ${patrimonioUSD >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtUSD(aportes.USD)}</p>}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between py-2">
                        <span className="text-sm font-medium text-ink">Patrimonio Neto</span>
                        <div className="text-right">
                          <p className={`font-mono text-sm font-bold ${patrimonio >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtARS(patrimonio)}</p>
                          {patrimonioUSD !== 0 && <p className={`font-mono text-xs font-bold ${patrimonioUSD >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtUSD(patrimonioUSD)}</p>}
                        </div>
                      </div>
                      <p className="mt-1 text-xs italic text-faint">Activo − Pasivo = Patrimonio Neto</p>
                    </div>
                    <div className={`flex items-center justify-between border-t border-line px-6 py-4 ${patrimonio >= 0 ? 'bg-positive-bg' : 'bg-negative-bg'}`}>
                      <span className="text-sm font-bold uppercase tracking-wide text-ink">Total Patrimonio</span>
                      <div className="text-right">
                        <p className={`font-mono text-xl font-bold ${patrimonio >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtARS(patrimonio)}</p>
                        {patrimonioUSD !== 0 && <p className={`font-mono text-sm font-bold ${patrimonioUSD >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtUSD(patrimonioUSD)}</p>}
                      </div>
                    </div>
                  </Card>
                </div>

                {/* VERIFICACIÓN — full width */}
                <div className="lg:col-span-2">
                  <Card className="px-6 py-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wider text-faint">Verificación: Activo = Pasivo + Patrimonio</p>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-mono font-bold text-accent">{fmtARS(activo)}</span>
                      <span className="mx-2 text-faint">=</span>
                      <span className="font-mono font-bold text-warn">{fmtARS(pasivo)}</span>
                      <span className="mx-2 text-faint">+</span>
                      <span className={`font-mono font-bold ${patrimonio >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtARS(patrimonio)}</span>
                      <span className={`ml-3 rounded px-2 py-0.5 text-xs font-bold ${Math.abs(activo - pasivo - patrimonio) < 1 ? 'bg-positive-bg text-positive' : 'bg-negative-bg text-negative'}`}>
                        {Math.abs(activo - pasivo - patrimonio) < 1 ? '✓ Cuadra' : '⚠ Descuadre'}
                      </span>
                    </div>
                    {activoUSD !== 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-mono font-bold text-ink">{fmtUSD(activoUSD)}</span>
                        <span className="mx-2 text-faint">=</span>
                        <span className="font-mono font-bold text-warn">{fmtUSD(pasivoUSD)}</span>
                        <span className="mx-2 text-faint">+</span>
                        <span className={`font-mono font-bold ${patrimonioUSD >= 0 ? 'text-positive' : 'text-negative'}`}>{fmtUSD(patrimonioUSD)}</span>
                        <span className={`ml-3 rounded px-2 py-0.5 text-xs font-bold ${Math.abs(activoUSD - pasivoUSD - patrimonioUSD) < 0.01 ? 'bg-positive-bg text-positive' : 'bg-negative-bg text-negative'}`}>
                          {Math.abs(activoUSD - pasivoUSD - patrimonioUSD) < 0.01 ? '✓ Cuadra' : '⚠ Descuadre'}
                        </span>
                      </div>
                    )}
                  </Card>
                </div>

                {/* POSICIÓN NETA FX — full width below the two columns */}
                <div className="lg:col-span-2">
                  <Card className="overflow-hidden">
                    <div className="flex items-center justify-between border-b border-line bg-accent-bg px-6 py-4">
                      <div>
                        <h3 className="text-base font-bold uppercase tracking-wider text-accent">Posición Neta FX</h3>
                        <p className="mt-0.5 text-xs text-faint">Acumulado histórico de compras y ventas de divisas · {fxPos.totalOps} operaciones</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${fxPos.netUSD >= 0 ? 'bg-accent-bg text-accent' : 'bg-negative-bg text-negative'}`}>
                        {fxPos.netUSD >= 0 ? 'Posición Vendedora' : 'Posición Compradora'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 px-6 py-4 sm:grid-cols-4">
                      <div className="rounded-xl border border-line bg-canvas p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Compras USD</p>
                        <p className="font-mono text-lg font-bold text-ink">{fmtUSD(fxPos.comprasUSD)}</p>
                        <p className="mt-1 font-mono text-xs text-faint">{fmtARS(fxPos.comprasARS)} pagados</p>
                      </div>
                      <div className="rounded-xl border border-line bg-canvas p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Ventas USD</p>
                        <p className="font-mono text-lg font-bold text-ink">{fmtUSD(fxPos.ventasUSD)}</p>
                        <p className="mt-1 font-mono text-xs text-faint">{fmtARS(fxPos.ventasARS)} cobrados</p>
                      </div>
                      <div className="rounded-xl border border-line bg-canvas p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Diferencial USD</p>
                        <p className={`font-mono text-lg font-bold ${fxPos.netUSD >= 0 ? 'text-accent' : 'text-negative'}`}>{fmtUSD(Math.abs(fxPos.netUSD))}</p>
                        <p className="mt-1 text-xs text-faint">{fxPos.netUSD >= 0 ? 'Vendidos neto' : 'Comprados neto'}</p>
                      </div>
                      <div className="rounded-xl border border-line bg-canvas p-4">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Diferencial ARS</p>
                        <p className={`font-mono text-lg font-bold ${(fxPos.ventasARS - fxPos.comprasARS) >= 0 ? 'text-accent' : 'text-negative'}`}>{fmtARS(Math.abs(fxPos.ventasARS - fxPos.comprasARS))}</p>
                        <p className="mt-1 text-xs text-faint">{(fxPos.ventasARS - fxPos.comprasARS) >= 0 ? 'ARS cobrados neto' : 'ARS pagados neto'}</p>
                      </div>
                    </div>
                    {/* TC implícito + mark-to-market */}
                    {(() => {
                      const netUSDheld     = fxPos.comprasUSD - fxPos.ventasUSD;   // positivo = tenés USD
                      const netARSreceived = fxPos.ventasARS  - fxPos.comprasARS;  // positivo = recibiste ARS
                      const tcImplicito = Math.abs(netUSDheld) > 0.001
                        ? Math.abs(netARSreceived) / Math.abs(netUSDheld)
                        : null;
                      const isVendedora = netUSDheld < 0;

                      const tc = parseFloat(fxTc);
                      const resultado = !isNaN(tc) && tc > 0 ? netARSreceived + netUSDheld * tc : null;

                      return (
                        <div className="border-t border-line">
                          {tcImplicito !== null && (
                            <div className="flex flex-col items-start gap-4 border-b border-line px-6 py-4 sm:flex-row sm:items-center">
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold uppercase tracking-wider text-faint">TC de la posición</span>
                                <span className="font-mono text-xl font-bold text-accent">
                                  {tcImplicito.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <p className="text-xs italic text-faint">
                                {isVendedora
                                  ? `Comprá por debajo de este TC → ganás · Comprá por encima → perdés`
                                  : `Vendé por encima de este TC → ganás · Vendé por debajo → perdés`}
                              </p>
                            </div>
                          )}
                          <div className="flex flex-col items-start gap-4 px-6 py-4 sm:flex-row sm:items-center">
                            <div className="flex items-center gap-3">
                              <label className="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-faint">TC de referencia</label>
                              <div className="flex items-center rounded-lg border border-line bg-surface px-3 py-1.5">
                                <span className="mr-1 text-xs text-faint">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  placeholder="ej. 1400"
                                  value={fxTc}
                                  onChange={e => setFxTc(e.target.value)}
                                  className="w-28 bg-transparent font-mono text-sm text-ink focus:outline-none"
                                />
                              </div>
                            </div>
                            {resultado !== null ? (
                              <div className={`flex items-center gap-3 rounded-xl border px-4 py-2 ${
                                resultado >= 0 ? 'border-positive/20 bg-positive-bg' : 'border-negative/20 bg-negative-bg'
                              }`}>
                                <span className="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-faint">
                                  Resultado a TC {tc.toLocaleString('es-AR')}
                                </span>
                                <span className={`font-mono text-xl font-bold ${resultado >= 0 ? 'text-positive' : 'text-negative'}`}>
                                  {resultado >= 0 ? '+' : ''}{fmtARS(resultado)}
                                </span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  resultado >= 0 ? 'bg-positive-bg text-positive' : 'bg-negative-bg text-negative'
                                }`}>
                                  {resultado >= 0 ? 'Ganancia' : 'Pérdida'}
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs italic text-faint">Ingresá un TC para calcular la ganancia o pérdida sobre el diferencial</p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </Card>
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
          <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-ink">Estado de Resultados</h2>
              <p className="mt-0.5 text-sm text-faint">Ingresos, gastos y utilidad neta del período.</p>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2">
              <div>
                <label className="mb-0.5 block text-[10px] font-bold uppercase text-faint">Desde</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-transparent text-sm text-ink focus:outline-none" />
              </div>
              <div className="h-7 w-px bg-line" />
              <div>
                <label className="mb-0.5 block text-[10px] font-bold uppercase text-faint">Hasta</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-transparent text-sm text-ink focus:outline-none" />
              </div>
            </div>
          </div>
          {plLoading ? (
            <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" /></div>
          ) : (
            <div className="mx-auto max-w-2xl">
              <Card className="overflow-hidden">
                <div className="border-b border-line bg-positive-bg px-6 py-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-positive">Ingresos</p>
                  {incomeLines.length === 0 ? (
                    <p className="py-2 text-sm italic text-faint">Sin ingresos en el período</p>
                  ) : (
                    <div className="space-y-2">
                      {incomeLines.map((l: any) => (
                        <div key={l.id} className="flex justify-between border-b border-line py-1 text-sm last:border-0">
                          <span className="truncate pr-4 text-muted">{l.description}</span>
                          <span className="shrink-0 font-mono font-semibold text-positive">+ {fmtARS(Number(l.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-b border-line bg-positive-bg px-6 py-3">
                  <span className="text-sm font-bold uppercase tracking-wide text-positive">= Total Ingresos</span>
                  <span className="font-mono text-lg font-bold text-positive">{fmtARS(totalIncome)}</span>
                </div>
                <div className="border-b border-line bg-negative-bg px-6 py-4">
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-negative">Gastos</p>
                  {expenseLines.length === 0 ? (
                    <p className="py-2 text-sm italic text-faint">Sin gastos en el período</p>
                  ) : (
                    <div className="space-y-2">
                      {expenseLines.map((l: any) => (
                        <div key={l.id} className="flex justify-between border-b border-line py-1 text-sm last:border-0">
                          <span className="truncate pr-4 text-muted">{l.description}</span>
                          <span className="shrink-0 font-mono font-semibold text-negative">− {fmtARS(Number(l.amount))}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between border-b border-line bg-negative-bg px-6 py-3">
                  <span className="text-sm font-bold uppercase tracking-wide text-negative">= Total Gastos</span>
                  <span className="font-mono text-lg font-bold text-negative">− {fmtARS(totalExpense)}</span>
                </div>
                <div className={`flex items-center justify-between px-6 py-5 ${netResult >= 0 ? 'bg-positive-bg' : 'bg-negative-bg'}`}>
                  <div>
                    <p className={`mb-0.5 text-xs font-bold uppercase tracking-widest ${netResult >= 0 ? 'text-positive' : 'text-negative'}`}>= Utilidad Neta</p>
                    <p className="text-xs text-faint">Resultado del ejercicio · {startDate} → {endDate}</p>
                  </div>
                  <span className={`font-mono text-3xl font-black ${netResult >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {netResult >= 0 ? '+' : '−'} {fmtARS(Math.abs(netResult))}
                  </span>
                </div>
              </Card>
              <p className="mt-3 text-center text-xs italic text-faint">Se excluyen aportes de capital, fondeos de clientes y retiros de socios (no son P&L operativo).</p>
            </div>
          )}
        </div>
      )}


    </div>
  );
}
