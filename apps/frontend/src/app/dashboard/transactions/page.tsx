'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass, labelClass } from '@/components/ui/forms';

const CATEGORIES = [
  { id: 'OPERATING_EXPENSE', name: 'Gasto Operativo' },
  { id: 'SALARY', name: 'Sueldo/Honorario' },
  { id: 'COMMISSION', name: 'Comisión' },
  { id: 'INTEREST_INCOME', name: 'Intereses / Beneficio' },
  { id: 'CAPITAL_CONTRIBUTION', name: 'Aporte de Capital' },
  { id: 'PARTNER_WITHDRAWAL', name: 'Retiro de Socios' },
  { id: 'CLIENT_FUNDING', name: 'Fondeo de Cliente' },
  { id: 'OTHER', name: 'Otro/Sin Categoría' },
];

export default function LedgerPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination meta
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);

  // Balance Contable
  const [balanceSheet, setBalanceSheet] = useState<any>(null);
  const [balanceTc, setBalanceTc] = useState<string>('');
  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterUser, setFilterUser] = useState('');

  // Dropdown data options
  const [boxes, setBoxes] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  // Revert state
  const [revertTarget, setRevertTarget] = useState<any | null>(null);
  const [reverting, setReverting] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    type: 'INCOME', // INCOME, OUTCOME
    category: 'OTHER',
    amount: '',
    currency: 'ARS',
    description: '',
    boxId: '',
    clientId: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const queryParams = new URLSearchParams();
      queryParams.append('paginate', 'true');
      queryParams.append('page', page.toString());
      queryParams.append('limit', '50');

      if (filterType) queryParams.append('type', filterType);
      if (filterCategory) queryParams.append('category', filterCategory);
      if (filterStart) queryParams.append('startDate', filterStart);
      if (filterEnd) queryParams.append('endDate', filterEnd);
      if (filterUser) queryParams.append('user_id', filterUser);

      const [txsResponse, boxesData, clientsData, usersData] = await Promise.all([
        fetchApi(`/transactions?${queryParams.toString()}`),
        fetchApi('/boxes'),
        fetchApi('/clients'),
        fetchApi('/auth/users')
      ]);

      // Balance sheet (fire-and-forget, no bloquea la tabla)
      fetchApi('/reports/balance-sheet').then(setBalanceSheet).catch(console.error);
      const actBoxes = typeof boxesData === 'object' && boxesData !== null && Array.isArray(boxesData.boxes)
           ? boxesData.boxes
           : (Array.isArray(boxesData) ? boxesData : []);

      if (txsResponse && txsResponse.data) {
        setTransactions(txsResponse.data);
        setTotalPages(txsResponse.meta?.totalPages || 1);
        setTotalRecords(txsResponse.meta?.total || 0);
      } else {
        // Fallback for retrocompatibility just in case
        setTransactions(Array.isArray(txsResponse) ? txsResponse : []);
        setTotalPages(1);
        setTotalRecords(Array.isArray(txsResponse) ? txsResponse.length : 0);
      }

      setBoxes(actBoxes);
      setClients(Array.isArray(clientsData) ? clientsData : []);
      setUsers(Array.isArray(usersData) ? usersData : []);

      // Auto-select first box for convenience if empty
      if (actBoxes.length > 0 && !form.boxId) {
          setForm(prev => ({...prev, boxId: actBoxes[0].id, currency: actBoxes[0].currency }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1); // Reset page on filter change
  }, [filterType, filterCategory, filterStart, filterEnd, filterUser]);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterCategory, filterStart, filterEnd, filterUser, page]);

  const handleRevert = async () => {
    if (!revertTarget) return;
    setReverting(true);
    try {
      const userId = getUserId();
      if (!userId) { toast.error('Sesión inválida.'); return; }
      await fetchApi(`/transactions/${revertTarget.id}/revert`, {
        method: 'POST',
        body: JSON.stringify({ userId }),
      });
      toast.success('Transacción revertida correctamente.');
      setRevertTarget(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Error al revertir la transacción.');
    } finally {
      setReverting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const endpoint = form.type === 'INCOME' ? '/transactions/income' : '/transactions/outcome';
      const userId = getUserId();
      if (!userId) { toast.error("Sesión inválida."); return; }

      await fetchApi(endpoint, {
        method: 'POST',
        body: JSON.stringify({
           amount: form.amount,
           description: form.description,
           category: form.category,
           boxId: form.boxId,
           clientId: form.clientId || null,
           currency: form.currency,
           userId: userId
        })
      });
      setShowModal(false);
      setForm({...form, amount: '', description: '', clientId: ''});
      loadData();
    } catch (err) {
      console.error(err);
      alert('Error registrando transacción');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-500 pb-12">
      <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Libro Mayor</h1>
          <p className="mt-1 text-[13.5px] text-muted">Registro histórico y analítico de operaciones financieras.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="shrink-0 rounded-[9px] bg-ink px-[16px] py-[9px] text-[13px] font-medium text-white transition-opacity hover:opacity-85"
        >
          + Asiento Contable
        </button>
      </header>

      {/* BALANCE CONTABLE */}
      {balanceSheet && (
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* ── ACTIVO ── */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-positive-bg px-5 py-3">
              <span className="text-xs font-bold uppercase tracking-widest text-positive">Activo — Lo que tenemos</span>
              <span className="font-mono text-sm font-bold text-positive">$ {balanceSheet.totals.totalActivo_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="divide-y divide-line">
              <div className="px-5 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Disponible EFT (Cajas Propias)</p>
                {balanceSheet.agencyBoxes.map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between py-1">
                    <span className="text-sm text-muted">{b.name}</span>
                    <div className="text-right">
                      {b.balances.ARS !== 0 && <p className="font-mono text-sm text-ink">$ {b.balances.ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                      {b.balances.USD !== 0 && <p className="font-mono text-xs text-positive">U$S {b.balances.USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                      {b.balances.ARS === 0 && b.balances.USD === 0 && <p className="font-mono text-sm text-faint">$ -</p>}
                    </div>
                  </div>
                ))}
                <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
                  <span className="text-xs font-bold uppercase text-faint">Subtotal EFT</span>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold text-accent">$ {balanceSheet.totals.totalEFT_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    {balanceSheet.totals.totalEFT_USD !== 0 && <p className="font-mono text-xs text-positive">U$S {balanceSheet.totals.totalEFT_USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                  </div>
                </div>
              </div>
              <div className="px-5 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Cheques en Cartera ({balanceSheet.checksInPortfolio.count})</p>
                {balanceSheet.checksInPortfolio.ARS !== 0 && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-muted">Cheques ARS</span>
                    <span className="font-mono text-sm text-ink">$ {balanceSheet.checksInPortfolio.ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {balanceSheet.checksInPortfolio.USD !== 0 && (
                  <div className="flex items-center justify-between py-1">
                    <span className="text-sm text-muted">Cheques USD</span>
                    <span className="font-mono text-sm text-positive">U$S {balanceSheet.checksInPortfolio.USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {balanceSheet.checksInPortfolio.count === 0 && <p className="text-sm italic text-faint">Sin cheques en cartera</p>}
              </div>
              {balanceSheet.arPositions?.length > 0 && (
                <div className="px-5 py-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Cuentas por Cobrar — Compradores ({balanceSheet.arPositions.length})</p>
                  {balanceSheet.arPositions.map((p: any) => (
                    <div key={p.clientId} className="flex items-center justify-between py-1">
                      <span className="text-sm text-muted">{p.clientName}</span>
                      <div className="text-right">
                        {p.netARS > 0 && <p className="font-mono text-sm text-ink">$ {p.netARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                        {p.netUSD > 0 && <p className="font-mono text-xs text-positive">U$S {p.netUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                      </div>
                    </div>
                  ))}
                  <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
                    <span className="text-xs font-bold uppercase text-faint">Subtotal CxC</span>
                    <p className="font-mono text-sm font-bold text-positive">$ {balanceSheet.totals.totalAR_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between bg-positive-bg px-5 py-3">
                <span className="text-sm font-bold uppercase tracking-wide text-positive">Total Activo</span>
                <div className="text-right">
                  <p className="font-mono text-lg font-bold text-positive">$ {balanceSheet.totals.totalActivo_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  {balanceSheet.totals.totalActivo_USD !== 0 && <p className="font-mono text-xs text-positive">U$S {balanceSheet.totals.totalActivo_USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                </div>
              </div>
            </div>
          </Card>

          {/* ── PASIVO ── */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line bg-negative-bg px-5 py-3">
              <span className="text-xs font-bold uppercase tracking-widest text-negative">Pasivo — Lo que debemos</span>
              <span className="font-mono text-sm font-bold text-negative">$ {balanceSheet.totals.totalPasivo_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="divide-y divide-line">
              {balanceSheet.apPositions?.length > 0 && (
                <div className="px-5 py-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-faint">Cuentas por Pagar — Vendedores ({balanceSheet.apPositions.length})</p>
                  {balanceSheet.apPositions.map((p: any) => (
                    <div key={p.clientId} className="flex items-center justify-between py-1">
                      <span className="text-sm text-muted">{p.clientName}</span>
                      <div className="text-right">
                        {p.netARS > 0 && <p className="font-mono text-sm text-negative">$ {p.netARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                        {p.netUSD > 0 && <p className="font-mono text-xs text-negative">U$S {p.netUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                      </div>
                    </div>
                  ))}
                  <div className="mt-1 flex items-center justify-between border-t border-line pt-2">
                    <span className="text-xs font-bold uppercase text-faint">Subtotal CxP</span>
                    <p className="font-mono text-sm font-bold text-negative">$ {balanceSheet.totals.totalAP_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between bg-negative-bg px-5 py-3">
                <span className="text-sm font-bold uppercase tracking-wide text-negative">Total Pasivo</span>
                <div className="text-right">
                  <p className="font-mono text-lg font-bold text-negative">$ {balanceSheet.totals.totalPasivo_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  {balanceSheet.totals.totalPasivo_USD !== 0 && <p className="font-mono text-xs text-negative">U$S {balanceSheet.totals.totalPasivo_USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                </div>
              </div>
            </div>
          </Card>

          {/* ── PATRIMONIO NETO ── */}
          <Card className="overflow-hidden lg:col-span-2">
            <div className="border-b border-line bg-accent-bg px-5 py-3">
              <span className="text-xs font-bold uppercase tracking-widest text-accent">Patrimonio Neto — Activo − Pasivo</span>
            </div>
            <div className="grid grid-cols-1 gap-5 px-5 py-4 md:grid-cols-4">
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-faint">Patrimonio ARS</p>
                <p className={`font-mono text-2xl font-bold ${balanceSheet.totals.patrimonioNeto_ARS >= 0 ? 'text-accent' : 'text-negative'}`}>
                  $ {balanceSheet.totals.patrimonioNeto_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-faint">Patrimonio USD</p>
                <p className={`font-mono text-2xl font-bold ${balanceSheet.totals.patrimonioNeto_USD >= 0 ? 'text-positive' : 'text-negative'}`}>
                  U$S {balanceSheet.totals.patrimonioNeto_USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-faint">ARS → USD total (TC $)</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-faint">$</span>
                  <input
                    type="number"
                    value={balanceTc}
                    onChange={e => setBalanceTc(e.target.value)}
                    placeholder="Ingresá el T.C."
                    className={`${inputClass} font-mono`}
                  />
                </div>
                {balanceTc && Number(balanceTc) > 0 && (() => {
                  const totalARS = balanceSheet.totals.patrimonioNeto_ARS + (balanceSheet.totals.patrimonioNeto_USD * Number(balanceTc));
                  return (
                    <p className={`mt-2 font-mono text-lg font-bold ${totalARS >= 0 ? 'text-warn' : 'text-negative'}`}>
                      = $ {totalARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  );
                })()}
              </div>
              <div>
                <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-faint">USD → ARS total (TC $)</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-faint">$</span>
                  <input
                    type="number"
                    value={balanceTc}
                    onChange={e => setBalanceTc(e.target.value)}
                    placeholder="Ingresá el T.C."
                    className={`${inputClass} font-mono`}
                  />
                </div>
                {balanceTc && Number(balanceTc) > 0 && (() => {
                  const totalUSD = balanceSheet.totals.patrimonioNeto_USD + (balanceSheet.totals.patrimonioNeto_ARS / Number(balanceTc));
                  return (
                    <p className={`mt-2 font-mono text-lg font-bold ${totalUSD >= 0 ? 'text-positive' : 'text-negative'}`}>
                      = U$S {totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  );
                })()}
              </div>
            </div>
          </Card>

        </div>
      )}

      {/* FILTERS WIDGET */}
      <Card className="mb-6 grid grid-cols-1 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-5">
          <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted">Tipo de Movimiento</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectClass}>
                  <option value="">Todas (Histórico)</option>
                  <option value="INCOME">Ingresos</option>
                  <option value="OUTCOME">Egresos</option>
                  <option value="TRANSFER">Transferencias</option>
              </select>
          </div>
          <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted">Centro / Categoría</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={selectClass}>
                  <option value="">Todas las Categorías</option>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
          </div>
          <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted">Desde</label>
              <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className={inputClass} />
          </div>
          <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted">Hasta</label>
              <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className={inputClass} />
          </div>
          <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-muted">Operador / Autor</label>
              <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className={selectClass}>
                  <option value="">Cualquier Autor</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
          </div>
      </Card>

      {/* DATA GRID */}
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-track">
            <tr className="border-b border-line">
              <th className="p-4 font-medium text-muted">Concepto</th>
              <th className="p-4 font-medium text-muted">Clase / Cat</th>
              <th className="p-4 font-medium text-muted">Importe / Caja</th>
              <th className="p-4 font-medium text-muted">Fecha</th>
              <th className="w-28 p-4 font-medium text-muted"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="p-4 text-center text-faint">Cargando historial...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={5} className="p-4 text-center text-faint">No se encontraron operaciones bajo esos filtros.</td></tr>
            ) : (
              transactions.map(tx => {
                const mainMov = tx.movements[0];
                const catName = CATEGORIES.find(c => c.id === tx.category)?.name || tx.category || 'N/A';
                const isIncome = tx.type === 'INCOME';
                const isCheckDeposit = tx.type === 'CHECK_TRADE' && tx.category === 'CHECK_DEPOSIT';
                const isCheckTrade   = tx.type === 'CHECK_TRADE' && tx.category !== 'CHECK_DEPOSIT';

                const amountColor = isIncome || isCheckDeposit
                  ? 'text-positive'
                  : isCheckTrade
                    ? 'text-accent'
                    : tx.type === 'TRANSFER' ? 'text-ink' : 'text-negative';
                const amountSign = isIncome || isCheckDeposit
                  ? '+'
                  : isCheckTrade || tx.type === 'TRANSFER' ? '' : '-';

                return (
                 <tr key={tx.id} className="border-b border-line transition-colors hover:bg-row-hover">
                   <td className="p-4">
                       <p className={`text-[15px] font-medium ${tx.is_reversed ? 'text-faint line-through' : 'text-ink'}`}>{tx.description}</p>
                       <div className="mt-2 flex flex-wrap items-center gap-2">
                         {tx.is_reversed && <span className="rounded border border-negative/30 bg-negative-bg px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-negative">Revertida</span>}
                         {tx.reversal_of && <span className="rounded border border-line bg-track px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-muted">Reversión</span>}
                         {mainMov?.client && <span className="rounded border border-line bg-track px-2 py-0.5 text-xs font-medium text-ink-soft">Ref: {mainMov.client.name}</span>}
                         {tx.user && <span className="rounded border border-accent/30 bg-accent-bg px-2 py-0.5 text-xs font-medium text-accent">Op: {tx.user.name}</span>}
                       </div>
                   </td>
                   <td className="p-4">
                       <span className={`mb-1 mr-2 inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                         isCheckDeposit ? 'bg-accent-bg text-accent' :
                         isCheckTrade   ? 'bg-warn-bg text-warn' :
                         isIncome       ? 'bg-positive-bg text-positive' :
                         tx.type === 'OUTCOME' ? 'bg-negative-bg text-negative' :
                                          'bg-track text-muted'
                       }`}>
                         {isCheckDeposit ? 'CHEQUE' : isCheckTrade ? 'C/V CHQ' : isIncome ? 'ING' : tx.type === 'OUTCOME' ? 'EGR' : 'TRF'}
                       </span>
                       <p className="truncate text-sm text-muted">{catName}</p>
                   </td>
                   <td className="p-4">
                       <p className={`text-[15px] font-bold ${amountColor}`}>
                           {amountSign}{mainMov?.currency === 'USD' ? 'U$S' : '$'} {Number(mainMov?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                       </p>
                       <p className="mt-1 text-xs uppercase tracking-wider text-faint">{mainMov?.box?.name || (isCheckDeposit || isCheckTrade ? 'Cartera Cheques' : '')}</p>
                   </td>
                   <td className="p-4 text-sm text-muted">
                       <p>{new Date(tx.operation_date).toLocaleDateString()}</p>
                       <p className="mt-1 text-xs text-faint">ID: {tx.id.split('-')[0]}..</p>
                   </td>
                   <td className="p-4 text-right">
                     {!tx.is_reversed && !tx.reversal_of && (
                       <button
                         onClick={() => setRevertTarget(tx)}
                         className="rounded-lg border border-negative/30 px-3 py-1.5 text-xs font-medium text-negative transition-colors hover:bg-negative-bg"
                       >
                         Revertir
                       </button>
                     )}
                   </td>
                 </tr>
                )
              })
            )}
          </tbody>
        </table>
      </Card>

      {/* PAGINATION CONTROLS */}
      {!loading && totalPages > 1 && (
        <div className="mt-4 flex flex-col items-center justify-between gap-4 rounded-[14px] border border-line bg-surface px-4 py-3 sm:flex-row">
          <span className="text-sm text-muted">Mostrando resultados de un total de <strong className="text-ink">{totalRecords}</strong> registros.</span>
          <div className="flex items-center space-x-2">
             <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${page <= 1 ? 'cursor-not-allowed bg-track text-faint' : 'bg-track text-ink hover:bg-line-hover'}`}>Anterior</button>
             <span className="px-2 text-sm text-muted">Página <strong className="text-ink">{page}</strong> de {totalPages}</span>
             <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${page >= totalPages ? 'cursor-not-allowed bg-track text-faint' : 'bg-track text-ink hover:bg-line-hover'}`}>Siguiente</button>
          </div>
        </div>
      )}

      {/* REVERT CONFIRMATION MODAL */}
      {revertTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-lg rounded-[14px] border border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line p-6">
              <h2 className="text-xl font-semibold tracking-tight text-ink">Revertir Transacción</h2>
              <button onClick={() => setRevertTarget(null)} className="text-xl font-bold text-faint transition-colors hover:text-ink">×</button>
            </div>
            <div className="space-y-4 p-6">
              <p className="text-sm leading-relaxed text-muted">
                Esta acción creará asientos de contrapartida que <strong className="text-ink">anulan todos los efectos contables</strong> de la operación original. La transacción original quedará marcada como <span className="font-semibold text-negative">REVERTIDA</span> en el historial.
              </p>
              <div className="rounded-xl border border-line bg-canvas px-4 py-3">
                <p className="mb-1 text-xs uppercase tracking-wider text-faint">Operación a revertir</p>
                <p className="font-medium text-ink">{revertTarget.description}</p>
                <p className="mt-1 text-xs text-faint">{new Date(revertTarget.operation_date).toLocaleDateString()} · ID: {revertTarget.id.split('-')[0]}..</p>
              </div>
              <p className="text-xs text-warn">⚠ Esta acción no puede deshacerse.</p>
            </div>
            <div className="flex justify-end gap-3 border-t border-line p-6">
              <button
                onClick={() => setRevertTarget(null)}
                disabled={reverting}
                className="px-5 py-2.5 font-medium text-muted transition-colors hover:text-ink"
              >
                Cancelar
              </button>
              <button
                onClick={handleRevert}
                disabled={reverting}
                className="rounded-lg bg-negative px-6 py-2.5 font-bold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50"
              >
                {reverting ? 'Revirtiendo...' : 'Confirmar Reversión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-300">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[14px] border border-line bg-surface shadow-2xl">
             <div className="flex items-center justify-between border-b border-line p-6">
                <h2 className="text-2xl font-semibold tracking-tight text-ink">Nuevo Asiento Contable</h2>
                <button onClick={() => setShowModal(false)} className="pb-1 text-xl font-bold text-faint transition-colors hover:text-ink">x</button>
             </div>

             <form onSubmit={handleSubmit} className="space-y-5 p-6">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Clase de Movimiento</label>
                        <select required value={form.type} onChange={e => setForm({...form, type: e.target.value})} className={selectClass}>
                            <option value="INCOME">INGRESO (+)</option>
                            <option value="OUTCOME">EGRESO (-)</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Categoría Analítica</label>
                        <select required value={form.category} onChange={e => setForm({...form, category: e.target.value})} className={selectClass}>
                            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className={labelClass}>Concepto / Referencia</label>
                    <input required placeholder="Ej: Pago de Alquiler Mes Marzo" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className={inputClass} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className={labelClass}>Caja Impuesta</label>
                        <select required value={form.boxId} onChange={e => {
                            const b = boxes.find(x => x.id === e.target.value);
                            setForm({...form, boxId: e.target.value, currency: b ? b.currency : 'ARS'})
                        }} className={selectClass}>
                            {boxes.map(b => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Monto Físico</label>
                        <div className="relative">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-faint">{form.currency === 'ARS' ? '$' : 'U$S'}</span>
                           <NumericFormat
                                required
                                value={form.amount}
                                onValueChange={(values) => setForm({...form, amount: values.value})}
                                thousandSeparator=","
                                decimalSeparator="."
                                allowNegative={false}
                                decimalScale={2}
                                className={`${inputClass} pl-10`}
                           />
                        </div>
                    </div>
                </div>

                <div>
                    <label className={labelClass}>Cliente / Entidad Asociada (Opcional)</label>
                    <select value={form.clientId} onChange={e => setForm({...form, clientId: e.target.value})} className={selectClass}>
                        <option value="">-- No adjudicar a ningún cliente --</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.tax_id || 'S/N'})</option>)}
                    </select>
                    <p className="mt-2 text-xs text-faint">vinculará este movimiento a la ficha histórica del cliente.</p>
                </div>

                <div className="mt-6 flex justify-end border-t border-line pt-4">
                    <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 font-medium text-muted transition-colors hover:text-ink">Cancelar</button>
                    <button type="submit" className="ml-2 rounded-lg bg-ink px-8 py-2.5 font-bold text-white shadow-sm transition-all hover:opacity-85">Confirmar Asiento</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
