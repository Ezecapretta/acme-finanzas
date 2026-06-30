'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import toast from 'react-hot-toast';

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
    <div className="w-full animate-in fade-in zoom-in-95 duration-500 max-w-7xl mx-auto pb-12">
      <header className="mb-6 flex flex-col md:flex-row md:justify-between md:items-center glass-panel rounded-2xl p-6">
        <div className="mb-4 md:mb-0">
          <h1 className="text-3xl font-bold text-[#f8fafc] tracking-tight mb-2">Libro Mayor</h1>
          <p className="text-[#94a3b8]">Registro histórico y analítico de operaciones financieras.</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-[#4d596b] hover:bg-[#677383] text-[#d1dded] px-4 py-2 rounded-lg font-medium transition-colors border border-[#7e8b9d] shadow shrink-0"
        >
          + Asiento Contable
        </button>
      </header>

      {/* BALANCE CONTABLE */}
      {balanceSheet && (
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── ACTIVO ── */}
          <div className="glass-panel rounded-2xl border border-teal-500/30 overflow-hidden">
            <div className="bg-teal-500/10 px-5 py-3 border-b border-teal-500/20 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-teal-400">Activo — Lo que tenemos</span>
              <span className="font-mono font-bold text-teal-300 text-sm">$ {balanceSheet.totals.totalActivo_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="divide-y divide-[#334155]/30">
              <div className="px-5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] mb-2">Disponible EFT (Cajas Propias)</p>
                {balanceSheet.agencyBoxes.map((b: any) => (
                  <div key={b.id} className="flex justify-between items-center py-1">
                    <span className="text-sm text-[#94a3b8]">{b.name}</span>
                    <div className="text-right">
                      {b.balances.ARS !== 0 && <p className="font-mono text-sm text-[#d1dded]">$ {b.balances.ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                      {b.balances.USD !== 0 && <p className="font-mono text-xs text-emerald-400">U$S {b.balances.USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                      {b.balances.ARS === 0 && b.balances.USD === 0 && <p className="font-mono text-sm text-[#475569]">$ -</p>}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-2 mt-1 border-t border-[#334155]/30">
                  <span className="text-xs font-bold text-[#64748b] uppercase">Subtotal EFT</span>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold text-[#0ea5e9]">$ {balanceSheet.totals.totalEFT_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                    {balanceSheet.totals.totalEFT_USD !== 0 && <p className="font-mono text-xs text-emerald-400">U$S {balanceSheet.totals.totalEFT_USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                  </div>
                </div>
              </div>
              <div className="px-5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] mb-2">Cheques en Cartera ({balanceSheet.checksInPortfolio.count})</p>
                {balanceSheet.checksInPortfolio.ARS !== 0 && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-[#94a3b8]">Cheques ARS</span>
                    <span className="font-mono text-sm text-[#d1dded]">$ {balanceSheet.checksInPortfolio.ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {balanceSheet.checksInPortfolio.USD !== 0 && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-sm text-[#94a3b8]">Cheques USD</span>
                    <span className="font-mono text-sm text-emerald-400">U$S {balanceSheet.checksInPortfolio.USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {balanceSheet.checksInPortfolio.count === 0 && <p className="text-sm text-[#475569] italic">Sin cheques en cartera</p>}
              </div>
              {balanceSheet.arPositions?.length > 0 && (
                <div className="px-5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] mb-2">Cuentas por Cobrar — Compradores ({balanceSheet.arPositions.length})</p>
                  {balanceSheet.arPositions.map((p: any) => (
                    <div key={p.clientId} className="flex justify-between items-center py-1">
                      <span className="text-sm text-[#94a3b8]">{p.clientName}</span>
                      <div className="text-right">
                        {p.netARS > 0 && <p className="font-mono text-sm text-[#d1dded]">$ {p.netARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                        {p.netUSD > 0 && <p className="font-mono text-xs text-emerald-400">U$S {p.netUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 mt-1 border-t border-[#334155]/30">
                    <span className="text-xs font-bold text-[#64748b] uppercase">Subtotal CxC</span>
                    <p className="font-mono text-sm font-bold text-teal-400">$ {balanceSheet.totals.totalAR_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              )}
              <div className="px-5 py-3 bg-teal-500/5 flex justify-between items-center">
                <span className="font-bold text-teal-300 text-sm uppercase tracking-wide">Total Activo</span>
                <div className="text-right">
                  <p className="font-mono font-bold text-teal-300 text-lg">$ {balanceSheet.totals.totalActivo_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  {balanceSheet.totals.totalActivo_USD !== 0 && <p className="font-mono text-xs text-emerald-400">U$S {balanceSheet.totals.totalActivo_USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* ── PASIVO ── */}
          <div className="glass-panel rounded-2xl border border-red-500/30 overflow-hidden">
            <div className="bg-red-500/10 px-5 py-3 border-b border-red-500/20 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-red-400">Pasivo — Lo que debemos</span>
              <span className="font-mono font-bold text-red-300 text-sm">$ {balanceSheet.totals.totalPasivo_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="divide-y divide-[#334155]/30">
              {balanceSheet.apPositions?.length > 0 && (
                <div className="px-5 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#64748b] mb-2">Cuentas por Pagar — Vendedores ({balanceSheet.apPositions.length})</p>
                  {balanceSheet.apPositions.map((p: any) => (
                    <div key={p.clientId} className="flex justify-between items-center py-1">
                      <span className="text-sm text-[#94a3b8]">{p.clientName}</span>
                      <div className="text-right">
                        {p.netARS > 0 && <p className="font-mono text-sm text-red-400">$ {p.netARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                        {p.netUSD > 0 && <p className="font-mono text-xs text-red-300">U$S {p.netUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 mt-1 border-t border-[#334155]/30">
                    <span className="text-xs font-bold text-[#64748b] uppercase">Subtotal CxP</span>
                    <p className="font-mono text-sm font-bold text-red-400">$ {balanceSheet.totals.totalAP_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>
              )}
              <div className="px-5 py-3 bg-red-500/5 flex justify-between items-center">
                <span className="font-bold text-red-300 text-sm uppercase tracking-wide">Total Pasivo</span>
                <div className="text-right">
                  <p className="font-mono font-bold text-red-300 text-lg">$ {balanceSheet.totals.totalPasivo_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                  {balanceSheet.totals.totalPasivo_USD !== 0 && <p className="font-mono text-xs text-red-300">U$S {balanceSheet.totals.totalPasivo_USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
                </div>
              </div>
            </div>
          </div>

          {/* ── PATRIMONIO NETO ── */}
          <div className="lg:col-span-2 glass-panel rounded-2xl border border-[#0ea5e9]/30 overflow-hidden">
            <div className="bg-[#0ea5e9]/10 px-5 py-3 border-b border-[#0ea5e9]/20">
              <span className="text-xs font-bold uppercase tracking-widest text-[#0ea5e9]">Patrimonio Neto — Activo − Pasivo</span>
            </div>
            <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-4 gap-5">
              <div>
                <p className="text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Patrimonio ARS</p>
                <p className={`font-mono font-bold text-2xl ${balanceSheet.totals.patrimonioNeto_ARS >= 0 ? 'text-[#0ea5e9]' : 'text-red-400'}`}>
                  $ {balanceSheet.totals.patrimonioNeto_ARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Patrimonio USD</p>
                <p className={`font-mono font-bold text-2xl ${balanceSheet.totals.patrimonioNeto_USD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  U$S {balanceSheet.totals.patrimonioNeto_USD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">ARS → USD total (TC $)</p>
                <div className="flex items-center gap-2">
                  <span className="text-[#64748b] text-sm">$</span>
                  <input
                    type="number"
                    value={balanceTc}
                    onChange={e => setBalanceTc(e.target.value)}
                    placeholder="Ingresá el T.C."
                    className="flex-1 bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] font-mono"
                  />
                </div>
                {balanceTc && Number(balanceTc) > 0 && (() => {
                  const totalARS = balanceSheet.totals.patrimonioNeto_ARS + (balanceSheet.totals.patrimonioNeto_USD * Number(balanceTc));
                  return (
                    <p className={`font-mono font-bold text-lg mt-2 ${totalARS >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      = $ {totalARS.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  );
                })()}
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">USD → ARS total (TC $)</p>
                <div className="flex items-center gap-2">
                  <span className="text-[#64748b] text-sm">$</span>
                  <input
                    type="number"
                    value={balanceTc}
                    onChange={e => setBalanceTc(e.target.value)}
                    placeholder="Ingresá el T.C."
                    className="flex-1 bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] font-mono"
                  />
                </div>
                {balanceTc && Number(balanceTc) > 0 && (() => {
                  const totalUSD = balanceSheet.totals.patrimonioNeto_USD + (balanceSheet.totals.patrimonioNeto_ARS / Number(balanceTc));
                  return (
                    <p className={`font-mono font-bold text-lg mt-2 ${totalUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      = U$S {totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  );
                })()}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* FILTERS WIDGET */}
      <div className="glass-panel rounded-2xl p-5 mb-6 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
              <label className="block text-xs text-[#aab6c7] uppercase font-bold tracking-wider mb-1">Tipo de Movimiento</label>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none">
                  <option value="">Todas (Histórico)</option>
                  <option value="INCOME">Ingresos</option>
                  <option value="OUTCOME">Egresos</option>
                  <option value="TRANSFER">Transferencias</option>
              </select>
          </div>
          <div>
              <label className="block text-xs text-[#aab6c7] uppercase font-bold tracking-wider mb-1">Centro / Categoría</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none">
                  <option value="">Todas las Categorías</option>
                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
          </div>
          <div>
              <label className="block text-xs text-[#aab6c7] uppercase font-bold tracking-wider mb-1">Desde</label>
              <input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none color-scheme-dark" />
          </div>
          <div>
              <label className="block text-xs text-[#aab6c7] uppercase font-bold tracking-wider mb-1">Hasta</label>
              <input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none color-scheme-dark" />
          </div>
          <div>
              <label className="block text-xs text-[#aab6c7] uppercase font-bold tracking-wider mb-1">Operador / Autor</label>
              <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none">
                  <option value="">Cualquier Autor</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
          </div>
      </div>

      {/* DATA GRID */}
      <div className="glass-panel rounded-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[var(--panel-bg)] backdrop-blur-md z-10">
            <tr className="border-b border-[#334155]/50">
              <th className="p-4 text-[#aab6c7] font-medium">Concepto</th>
              <th className="p-4 text-[#aab6c7] font-medium">Clase / Cat</th>
              <th className="p-4 text-[#aab6c7] font-medium">Importe / Caja</th>
              <th className="p-4 text-[#aab6c7] font-medium">Fecha</th>
              <th className="p-4 text-[#aab6c7] font-medium w-28"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-4 text-center text-[#7e8b9d]">Cargando historial...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={4} className="p-4 text-center text-[#7e8b9d]">No se encontraron operaciones bajo esos filtros.</td></tr>
            ) : (
              transactions.map(tx => {
                const mainMov = tx.movements[0]; 
                const catName = CATEGORIES.find(c => c.id === tx.category)?.name || tx.category || 'N/A';
                const isIncome = tx.type === 'INCOME';
                const isCheckDeposit = tx.type === 'CHECK_TRADE' && tx.category === 'CHECK_DEPOSIT';
                const isCheckTrade   = tx.type === 'CHECK_TRADE' && tx.category !== 'CHECK_DEPOSIT';

                const amountColor = isIncome || isCheckDeposit
                  ? 'text-emerald-400'
                  : isCheckTrade
                    ? 'text-purple-400'
                    : tx.type === 'TRANSFER' ? 'text-blue-400' : 'text-red-400';
                const amountSign = isIncome || isCheckDeposit
                  ? '+'
                  : isCheckTrade || tx.type === 'TRANSFER' ? '' : '-';

                return (
                 <tr key={tx.id} className="border-b border-[#2c394a]/50 hover:bg-[#2c394a]/30 transition-colors">
                   <td className="p-4">
                       <p className={`font-medium text-lg ${tx.is_reversed ? 'line-through text-[#677383]' : 'text-[#d1dded]'}`}>{tx.description}</p>
                       <div className="flex flex-wrap gap-2 items-center mt-2">
                         {tx.is_reversed && <span className="bg-red-500/15 text-red-400 text-xs px-2 py-0.5 rounded font-bold border border-red-500/30 uppercase tracking-wider">Revertida</span>}
                         {tx.reversal_of && <span className="bg-[#2c394a] text-[#7e8b9d] text-xs px-2 py-0.5 rounded font-bold border border-[#4d596b] uppercase tracking-wider">Reversión</span>}
                         {mainMov?.client && <span className="bg-[#2c394a] text-[#d1dded] text-xs px-2 py-0.5 rounded font-medium border border-[#4d596b]">Ref: {mainMov.client.name}</span>}
                         {tx.user && <span className="bg-purple-500/10 text-purple-400 text-xs px-2 py-0.5 rounded font-medium border border-purple-500/30">Op: {tx.user.name}</span>}
                       </div>
                   </td>
                   <td className="p-4">
                       <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mb-1 mr-2 ${
                         isCheckDeposit ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30' :
                         isCheckTrade   ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                         isIncome       ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                         tx.type === 'OUTCOME' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                                          'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                       }`}>
                         {isCheckDeposit ? 'CHEQUE' : isCheckTrade ? 'C/V CHQ' : isIncome ? 'ING' : tx.type === 'OUTCOME' ? 'EGR' : 'TRF'}
                       </span>
                       <p className="text-[#7e8b9d] text-sm truncate">{catName}</p>
                   </td>
                   <td className="p-4">
                       <p className={`font-bold text-lg ${amountColor}`}>
                           {amountSign}{mainMov?.currency === 'USD' ? 'U$S' : '$'} {Number(mainMov?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                       </p>
                       <p className="text-[#7e8b9d] text-xs uppercase tracking-wider mt-1">{mainMov?.box?.name || (isCheckDeposit || isCheckTrade ? 'Cartera Cheques' : '')}</p>
                   </td>
                   <td className="p-4 text-[#929fb1] text-sm group">
                       <p>{new Date(tx.operation_date).toLocaleDateString()}</p>
                       <p className="text-[#677383] text-xs mt-1">ID: {tx.id.split('-')[0]}..</p>
                   </td>
                   <td className="p-4 text-right">
                     {!tx.is_reversed && !tx.reversal_of && (
                       <button
                         onClick={() => setRevertTarget(tx)}
                         className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors font-medium"
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
      </div>

      {/* PAGINATION CONTROLS */}
      {!loading && totalPages > 1 && (
        <div className="mt-4 flex flex-col sm:flex-row justify-between items-center bg-[#081329] border border-[#2c394a] rounded-xl px-4 py-3 gap-4">
          <span className="text-[#64748b] text-sm">Mostrando resultados de un total de <strong className="text-[#aab6c7]">{totalRecords}</strong> registros.</span>
          <div className="flex space-x-2 items-center">
             <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${page <= 1 ? 'bg-[#141f32] text-[#4d596b] cursor-not-allowed' : 'bg-[#2c394a] text-[#d1dded] hover:bg-[#4d596b]'}`}>Anterior</button>
             <span className="text-[#94a3b8] text-sm px-2">Página <strong className="text-white">{page}</strong> de {totalPages}</span>
             <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${page >= totalPages ? 'bg-[#141f32] text-[#4d596b] cursor-not-allowed' : 'bg-[#2c394a] text-[#d1dded] hover:bg-[#4d596b]'}`}>Siguiente</button>
          </div>
        </div>
      )}

      {/* REVERT CONFIRMATION MODAL */}
      {revertTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050B14]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="glass-panel shadow-[0_0_50px_rgba(0,0,0,0.6)] border-t border-t-white/10 rounded-3xl w-full max-w-lg">
            <div className="p-6 border-b border-[#334155]/50 flex justify-between items-center">
              <h2 className="text-xl font-bold text-[#f8fafc] tracking-tight">Revertir Transacción</h2>
              <button onClick={() => setRevertTarget(null)} className="text-[#64748b] hover:text-white font-bold text-xl transition-colors">×</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-[#94a3b8] text-sm leading-relaxed">
                Esta acción creará asientos de contrapartida que <strong className="text-[#d1dded]">anulan todos los efectos contables</strong> de la operación original. La transacción original quedará marcada como <span className="text-red-400 font-semibold">REVERTIDA</span> en el historial.
              </p>
              <div className="bg-[#081329] border border-[#2c394a] rounded-xl px-4 py-3">
                <p className="text-xs text-[#64748b] uppercase tracking-wider mb-1">Operación a revertir</p>
                <p className="text-[#d1dded] font-medium">{revertTarget.description}</p>
                <p className="text-[#7e8b9d] text-xs mt-1">{new Date(revertTarget.operation_date).toLocaleDateString()} · ID: {revertTarget.id.split('-')[0]}..</p>
              </div>
              <p className="text-yellow-400/80 text-xs">⚠ Esta acción no puede deshacerse.</p>
            </div>
            <div className="p-6 border-t border-[#334155]/50 flex justify-end gap-3">
              <button
                onClick={() => setRevertTarget(null)}
                disabled={reverting}
                className="px-5 py-2.5 text-[#aab6c7] hover:text-white font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRevert}
                disabled={reverting}
                className="bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-all shadow-lg"
              >
                {reverting ? 'Revirtiendo...' : 'Confirmar Reversión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050B14]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="glass-panel shadow-[0_0_50px_rgba(0,0,0,0.6)] border-t border-t-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
             <div className="p-6 border-b border-[#334155]/50 flex justify-between items-center bg-[var(--panel-bg)]">
                <h2 className="text-2xl font-bold text-[#f8fafc] tracking-tight">Nuevo Asiento Contable</h2>
                <button onClick={() => setShowModal(false)} className="text-[#64748b] hover:text-white pb-1 font-bold text-xl transition-colors">x</button>
             </div>
             
             <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-[#aab6c7] font-semibold mb-2">Clase de Movimiento</label>
                        <select required value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2.5 text-[#d1dded] focus:outline-none focus:border-[#d1dded] transition-colors">
                            <option value="INCOME">INGRESO (+)</option>
                            <option value="OUTCOME">EGRESO (-)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-[#aab6c7] font-semibold mb-2">Categoría Analítica</label>
                        <select required value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2.5 text-[#d1dded] focus:outline-none focus:border-[#d1dded] transition-colors">
                            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-[#aab6c7] font-semibold mb-2">Concepto / Referencia</label>
                    <input required placeholder="Ej: Pago de Alquiler Mes Marzo" value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2.5 text-[#d1dded] focus:outline-none focus:border-[#d1dded] transition-colors" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm text-[#aab6c7] font-semibold mb-2">Caja Impuesta</label>
                        <select required value={form.boxId} onChange={e => {
                            const b = boxes.find(x => x.id === e.target.value);
                            setForm({...form, boxId: e.target.value, currency: b ? b.currency : 'ARS'})
                        }} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2.5 text-[#d1dded] focus:outline-none focus:border-[#d1dded] transition-colors">
                            {boxes.map(b => <option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm text-[#aab6c7] font-semibold mb-2">Monto Físico</label>
                        <div className="relative">
                           <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7e8b9d] font-bold">{form.currency === 'ARS' ? '$' : 'U$S'}</span>
                           <NumericFormat 
                                required
                                value={form.amount}
                                onValueChange={(values) => setForm({...form, amount: values.value})}
                                thousandSeparator=","
                                decimalSeparator="."
                                allowNegative={false}
                                decimalScale={2}
                                className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2.5 pl-10 text-[#d1dded] focus:outline-none focus:border-[#d1dded] transition-colors"
                           />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-[#aab6c7] font-semibold mb-2">Cliente / Entidad Asociada (Opcional)</label>
                    <select value={form.clientId} onChange={e => setForm({...form, clientId: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2.5 text-[#d1dded] focus:outline-none focus:border-[#d1dded] transition-colors">
                        <option value="">-- No adjudicar a ningún cliente --</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.tax_id || 'S/N'})</option>)}
                    </select>
                    <p className="text-xs text-[#677383] mt-2">vinculará este movimiento a la ficha histórica del cliente.</p>
                </div>

                <div className="flex justify-end pt-4 mt-6 border-t border-[#2c394a]">
                    <button type="button" onClick={() => setShowModal(false)} className="px-6 py-2.5 text-[#aab6c7] hover:text-white font-medium transition-colors">Cancelar</button>
                    <button type="submit" className="bg-[#4d596b] hover:bg-[#d1dded] hover:text-black text-white px-8 py-2.5 rounded-lg font-bold transition-all ml-2 shadow-lg">Confirmar Asiento</button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
}
