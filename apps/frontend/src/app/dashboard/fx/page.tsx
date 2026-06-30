'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import toast from 'react-hot-toast';
import OverdraftConfirmModal, { OverdraftInfo } from '@/components/OverdraftConfirmModal';

export default function FXTradePage() {
  const [clients, setClients] = useState<any[]>([]);
  const [agencyBoxes, setAgencyBoxes] = useState<any[]>([]);

  const [form, setForm] = useState({
    sellerId: '',
    buyerId: '',
    agencyBoxId: '',
    usdAmount: '',
    exchangeRate: '',
    date: new Date().toISOString().split('T')[0],
    description: ''
  });

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [overdraftData, setOverdraftData] = useState<{ overdrafts: OverdraftInfo[]; payload: any } | null>(null);
  const [revertTarget, setRevertTarget] = useState<any | null>(null);
  const [reverting, setReverting]       = useState(false);

  // Ventanilla (mostrador) mode — operation without a registered client
  const [ventanilla, setVentanilla] = useState(false);
  const [ventanillaOp, setVentanillaOp] = useState<'BUY' | 'SELL'>('BUY');
  const [ventanillaName, setVentanillaName] = useState('');

  const loadTransactions = () => {
    fetchApi('/transactions?type=FX_TRADE').then(setTransactions).catch(console.error);
  };

  useEffect(() => {
    loadTransactions();
    Promise.all([fetchApi('/clients'), fetchApi('/boxes')])
      .then(([clientData, boxData]) => {
        const parsedClients = Array.isArray(clientData) ? clientData : (clientData.clients || []);
        setClients(parsedClients);
        const aBoxes = (boxData.boxes || []).filter((b: any) => !b.client_id);
        setAgencyBoxes(aBoxes);
        if (aBoxes.length > 0) setForm(prev => ({ ...prev, agencyBoxId: aBoxes[0].id }));
      }).catch(console.error);
  }, []);

  const getPartyLabel = (id: string) => {
    if (!id) return '—';
    if (id.startsWith('BOX:')) {
      const boxId = id.replace('BOX:', '');
      const box = agencyBoxes.find(b => b.id === boxId);
      return box ? `🏦 ${box.name} (Agencia)` : 'Caja Agencia';
    }
    const c = clients.find(c => c.id === id);
    return c?.box?.name || (id ? 'Sin caja asignada' : '—');
  };

  // Shared optgroup block for party selects
  const partyOptions = (
    <>
      {agencyBoxes.length > 0 && (
        <optgroup label="── AGENCIA (Cajas propias)">
          {agencyBoxes.map(b => (
            <option key={`BOX:${b.id}`} value={`BOX:${b.id}`}>🏦 {b.name}</option>
          ))}
        </optgroup>
      )}
      <optgroup label="── CLIENTES">
        {clients.map(c => (
          <option key={c.id} value={c.id}>{c.name}{c.tax_id ? ` (${c.tax_id})` : ''}</option>
        ))}
      </optgroup>
    </>
  );

  const calculatedArs = Number(form.usdAmount || 0) * Number(form.exchangeRate || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.agencyBoxId || !form.usdAmount || !form.exchangeRate) {
      if (!form.agencyBoxId) toast.error("No hay Cajas de Agencia. Cree una en Finanzas > Gestión de Cajas.", { duration: 6000 });
      else toast.error("Completar monto y cotización.");
      return;
    }

    const userId = getUserId();
    if (!userId) { toast.error("Sesión inválida."); return; }

    if (ventanilla) {
      const opLabel = ventanillaOp === 'BUY'
        ? 'Cliente trae USD → recibe ARS'
        : 'Cliente trae ARS → recibe USD';
      const nameRef = ventanillaName.trim() ? ` | ${ventanillaName.trim()}` : '';
      const payload = {
        agencyBoxId: form.agencyBoxId,
        operation:   ventanillaOp,
        usdAmount:   Number(form.usdAmount),
        exchangeRate: Number(form.exchangeRate),
        date:        form.date,
        description: form.description || `Ventanilla: ${opLabel}${nameRef}`,
        userId,
      };
      await doFxSubmit(payload, false);
      return;
    }

    if (!form.sellerId || !form.buyerId) {
      toast.error("Completar Vendedor, Comprador, monto y cotización.");
      return;
    }
    if (form.sellerId === form.buyerId) {
      toast.error("El Vendedor y el Comprador no pueden ser la misma parte.");
      return;
    }

    const isSellerAgency = form.sellerId.startsWith('BOX:');
    const isBuyerAgency  = form.buyerId.startsWith('BOX:');
    const clientId = isSellerAgency ? (isBuyerAgency ? '' : form.buyerId) : form.sellerId;
    const operation = isSellerAgency ? 'SELL' : 'BUY';

    const sellerName = isSellerAgency
      ? agencyBoxes.find(b => b.id === form.sellerId.replace('BOX:', ''))?.name || 'Agencia'
      : clients.find(c => c.id === form.sellerId)?.name || '?';
    const buyerName = isBuyerAgency
      ? agencyBoxes.find(b => b.id === form.buyerId.replace('BOX:', ''))?.name || 'Agencia'
      : clients.find(c => c.id === form.buyerId)?.name || '?';
    const desc = form.description || `C/V USD — Vendedor: ${sellerName} | Comprador: ${buyerName}`;

    const agencyBoxOverride = isSellerAgency
      ? form.sellerId.replace('BOX:', '')
      : isBuyerAgency ? form.buyerId.replace('BOX:', '') : form.agencyBoxId;

    const payload = {
      clientId: clientId || undefined,
      agencyBoxId: agencyBoxOverride,
      operation,
      usdAmount: Number(form.usdAmount),
      exchangeRate: Number(form.exchangeRate),
      date: form.date,
      description: desc,
      userId,
    };

    await doFxSubmit(payload, false);
  };

  const doFxSubmit = async (payload: any, confirm: boolean) => {
    setLoading(true);
    try {
      await fetchApi('/fx', {
        method: 'POST',
        body: JSON.stringify({ ...payload, confirm }),
      });
      toast.success("Operación de C/V Dólares registrada.");
      setIsFormOpen(false);
      setOverdraftData(null);
      loadTransactions();
      setForm(prev => ({ ...prev, sellerId: '', buyerId: '', usdAmount: '', exchangeRate: '', description: '' }));
      setVentanillaName('');
    } catch (error: any) {
      if (error.requiresConfirmation) {
        setOverdraftData({ overdrafts: error.overdrafts, payload });
      } else {
        toast.error("Error: " + (error.message || 'Error desconocido'));
      }
    } finally {
      setLoading(false);
    }
  };

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
      loadTransactions();
    } catch (err: any) {
      toast.error(err.message || 'Error al revertir la transacción.');
    } finally {
      setReverting(false);
    }
  };

  // ─── FILTER STATE ──────────────────────────────────────────────────
  const [fxSearch, setFxSearch] = useState('');
  const [fxDateFrom, setFxDateFrom] = useState('');
  const [fxDateTo, setFxDateTo] = useState('');
  const [fxOperator, setFxOperator] = useState('');
  const [fxVisible, setFxVisible] = useState(10);

  const fxFiltered = transactions.filter(t => {
    if (fxSearch && !t.description?.toLowerCase().includes(fxSearch.toLowerCase())) return false;
    if (fxDateFrom && new Date(t.operation_date) < new Date(fxDateFrom)) return false;
    if (fxDateTo   && new Date(t.operation_date) > new Date(fxDateTo))   return false;
    if (fxOperator && t.user?.name !== fxOperator) return false;
    return true;
  });

  const operatorNames = [...new Set(transactions.map((t: any) => t.user?.name).filter(Boolean))];
  const hasFilter = fxSearch || fxDateFrom || fxDateTo || fxOperator;

  // ─── TOTALES COMPRAS / VENTAS ──────────────────────────────────────
  // Para ventanilla: leer movimientos de la caja de agencia (box_id en agencyBoxIdSet)
  // Para operación con cliente: leer movimientos de la caja del cliente (box.client_id seteado)
  // En ambos casos, el punto de vista es el de la AGENCIA.
  const agencyBoxIdSet = new Set(agencyBoxes.map(b => b.id));
  const fxTotals = fxFiltered.reduce((acc, t) => {
    const movs: any[] = t.movements || [];
    const hasClient = movs.some((m: any) => m.client_id);

    for (const mov of movs) {
      if (hasClient) {
        // Operación con cliente: leer la caja del cliente (invertir signo para perspectiva agencia)
        if (!mov.box_id || !mov.box?.client_id) continue;
        if (mov.currency === 'USD') {
          // Cliente recibe USD (DEBIT en caja cliente) → agencia vendió
          if (mov.type === 'DEBIT')  acc.ventasUSD  += Number(mov.amount);
          // Cliente entrega USD (CREDIT en caja cliente) → agencia compró
          if (mov.type === 'CREDIT') acc.comprasUSD += Number(mov.amount);
        }
        if (mov.currency === 'ARS') {
          // Cliente entrega ARS (CREDIT en caja cliente) → agencia cobró por venta
          if (mov.type === 'CREDIT') acc.ventasARS  += Number(mov.amount);
          // Cliente recibe ARS (DEBIT en caja cliente) → agencia pagó por compra
          if (mov.type === 'DEBIT')  acc.comprasARS += Number(mov.amount);
        }
      } else {
        // Ventanilla: leer caja de agencia directamente
        if (!agencyBoxIdSet.has(mov.box_id)) continue;
        if (mov.currency === 'USD') {
          if (mov.type === 'DEBIT')  acc.comprasUSD += Number(mov.amount);
          if (mov.type === 'CREDIT') acc.ventasUSD  += Number(mov.amount);
        }
        if (mov.currency === 'ARS') {
          if (mov.type === 'DEBIT')  acc.ventasARS  += Number(mov.amount);
          if (mov.type === 'CREDIT') acc.comprasARS += Number(mov.amount);
        }
      }
    }
    return acc;
  }, { comprasUSD: 0, comprasARS: 0, ventasUSD: 0, ventasARS: 0 });

  const fmtARS = (n: number) => `$ ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;
  const fmtUSD = (n: number) => `U$S ${n.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

  // ─── MASTER VIEW ──────────────────────────────────────────────────
  if (!isFormOpen) {
    return (
      <div className="w-full animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto pb-8">
        <header className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-[#f8fafc] mb-2 tracking-tight">Historial C/V Dólares</h1>
            <p className="text-[#94a3b8]">Registro de operaciones de cambio cursadas en la filial.</p>
          </div>
          <button onClick={() => setIsFormOpen(true)} className="px-6 py-3 bg-[#0ea5e9] hover:bg-[#0284c7] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#0ea5e9]/20 hover:shadow-[#0ea5e9]/40 hover:-translate-y-0.5">
            + Nueva Operación
          </button>
        </header>

        {/* TOTALES COMPRAS / VENTAS */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* COMPRAS */}
          <div className="glass-panel rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] bg-emerald-500/10 pointer-events-none" />
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/80">Total Compras USD</p>
            </div>
            <p className="font-mono font-black text-2xl text-emerald-400">
              {fmtUSD(fxTotals.comprasUSD)}
            </p>
            <p className="font-mono text-sm text-emerald-600 mt-1">
              {fmtARS(fxTotals.comprasARS)} pagados
            </p>
          </div>
          {/* VENTAS */}
          <div className="glass-panel rounded-2xl border border-amber-500/25 bg-amber-500/5 p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-[60px] bg-amber-500/10 pointer-events-none" />
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80">Total Ventas USD</p>
            </div>
            <p className="font-mono font-black text-2xl text-amber-400">
              {fmtUSD(fxTotals.ventasUSD)}
            </p>
            <p className="font-mono text-sm text-amber-600 mt-1">
              {fmtARS(fxTotals.ventasARS)} cobrados
            </p>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="glass-panel rounded-2xl border border-[#334155]/50 p-5 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]">Filtros</p>
            {hasFilter && <button onClick={() => { setFxSearch(''); setFxDateFrom(''); setFxDateTo(''); setFxOperator(''); }} className="text-xs text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">✕ Limpiar</button>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] text-sm">🔍</span>
              <input type="text" value={fxSearch} onChange={e => setFxSearch(e.target.value)}
                placeholder="Buscar en descripción..."
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] transition-colors placeholder:text-[#334155]" />
            </div>
            <select value={fxOperator} onChange={e => setFxOperator(e.target.value)}
              className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
              <option value="">Todos los operadores</option>
              {operatorNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Desde</label>
                <input type="date" value={fxDateFrom} onChange={e => setFxDateFrom(e.target.value)}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-2 py-2 text-xs text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Hasta</label>
                <input type="date" value={fxDateTo} onChange={e => setFxDateTo(e.target.value)}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-2 py-2 text-xs text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-3 px-1">
          <p className="text-sm text-[#64748b]"><span className="text-[#d1dded] font-bold">{fxFiltered.length}</span> operación{fxFiltered.length !== 1 ? 'es' : ''}{hasFilter && <span className="text-[#0ea5e9] ml-1">(filtrado)</span>}</p>
        </div>

        <div className="glass-panel rounded-2xl overflow-x-auto border border-[#334155]/50 shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#334155]/50 bg-[#0a1324]/50 text-[#94a3b8] text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold">Descripción / Operación</th>
                <th className="p-4 font-semibold text-right">USD</th>
                <th className="p-4 font-semibold text-right">ARS</th>
                <th className="p-4 font-semibold text-right">T/C Pactada</th>
                <th className="p-4 font-semibold text-right">Operador</th>
                <th className="p-4 font-semibold w-24"></th>
              </tr>
            </thead>
            <tbody>
              {fxFiltered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-[#64748b]">{hasFilter ? '⚠ Sin resultados para los filtros actuales.' : 'No hay operaciones registradas.'}</td></tr>
              ) : fxFiltered.slice(0, fxVisible).map((t, idx) => {
                // Calcular montos USD y ARS de la operación
                const movs: any[] = t.movements || [];
                const hasClient = movs.some((m: any) => m.client_id);
                let usdAmt = 0, arsAmt = 0, isSell = false;
                if (hasClient) {
                  // Leer desde caja del cliente
                  const clientUsd = movs.find((m: any) => m.box?.client_id && m.currency === 'USD');
                  const clientArs = movs.find((m: any) => m.box?.client_id && m.currency === 'ARS');
                  usdAmt = clientUsd ? Number(clientUsd.amount) : 0;
                  arsAmt = clientArs ? Number(clientArs.amount) : 0;
                  isSell = clientUsd?.type === 'DEBIT'; // cliente recibe USD → agencia vendió
                } else {
                  // Ventanilla: leer desde caja de agencia
                  const agUsd = movs.find((m: any) => agencyBoxIdSet.has(m.box_id) && m.currency === 'USD');
                  const agArs = movs.find((m: any) => agencyBoxIdSet.has(m.box_id) && m.currency === 'ARS');
                  usdAmt = agUsd ? Number(agUsd.amount) : 0;
                  arsAmt = agArs ? Number(agArs.amount) : 0;
                  isSell = agUsd?.type === 'CREDIT'; // agencia entrega USD → vendió
                }
                return (
                <tr key={t.id} className={`border-b border-[#334155]/30 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0a1324]/30'}`}>
                  <td className="p-4 text-[#d1dded]">{new Date(t.operation_date).toLocaleDateString()}</td>
                  <td className="p-4 text-[#d1dded]">
                    {t.description?.startsWith('Ventanilla:') && (
                      <span className="inline-block mr-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">Ventanilla</span>
                    )}
                    <span className={t.is_reversed ? 'line-through text-[#677383]' : ''}>{t.description || '-'}</span>
                    {t.reversal_of && <span className="ml-2 text-[10px] text-[#7e8b9d] bg-[#2c394a] px-1.5 py-0.5 rounded border border-[#4d596b] font-bold uppercase tracking-wider">Reversión</span>}
                  </td>
                  <td className="p-4 font-bold font-mono text-right text-sky-300">
                    {isSell ? '-' : '+'} {fmtUSD(usdAmt)}
                  </td>
                  <td className="p-4 font-bold font-mono text-right text-emerald-300">
                    {isSell ? '+' : '-'} {fmtARS(arsAmt)}
                  </td>
                  <td className="p-4 text-emerald-400 font-bold font-mono text-right">$ {Number(t.exchange_rate || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-[#64748b] text-right">{t.user?.name || 'Sistema'}</td>
                  <td className="p-4 text-right">
                    {!t.is_reversed && !t.reversal_of && (
                      <button onClick={() => setRevertTarget(t)} className="text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors font-medium">
                        Revertir
                      </button>
                    )}
                    {t.is_reversed && <span className="text-[10px] text-red-400/70 font-bold uppercase tracking-wider">Revertida</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>          {fxVisible < fxFiltered.length && (
            <div className="p-4 text-center border-t border-[#334155]/30">
              <button onClick={() => setFxVisible(v => v + 10)} className="text-sm text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                Ver más ({fxFiltered.length - fxVisible} restantes)
              </button>
            </div>
          )}        </div>
        {revertTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050B14]/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
            <div className="glass-panel shadow-[0_0_50px_rgba(0,0,0,0.6)] border-t border-t-white/10 rounded-3xl w-full max-w-lg">
              <div className="p-6 border-b border-[#334155]/50 flex justify-between items-center">
                <h2 className="text-xl font-bold text-[#f8fafc] tracking-tight">Revertir Transacción</h2>
                <button onClick={() => setRevertTarget(null)} className="text-[#64748b] hover:text-white font-bold text-xl transition-colors">×</button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-[#94a3b8] text-sm leading-relaxed">Esta acción creará asientos de contrapartida que <strong className="text-[#d1dded]">anulan todos los efectos contables</strong> de la operación original. La transacción quedará marcada como <span className="text-red-400 font-semibold">REVERTIDA</span>.</p>
                <div className="bg-[#081329] border border-[#2c394a] rounded-xl px-4 py-3">
                  <p className="text-xs text-[#64748b] uppercase tracking-wider mb-1">Operación a revertir</p>
                  <p className="text-[#d1dded] font-medium">{revertTarget.description}</p>
                  <p className="text-[#7e8b9d] text-xs mt-1">{new Date(revertTarget.operation_date).toLocaleDateString()} · ID: {revertTarget.id.split('-')[0]}..</p>
                </div>
                <p className="text-yellow-400/80 text-xs">⚠ Esta acción no puede deshacerse.</p>
              </div>
              <div className="p-6 border-t border-[#334155]/50 flex justify-end gap-3">
                <button onClick={() => setRevertTarget(null)} disabled={reverting} className="px-5 py-2.5 text-[#aab6c7] hover:text-white font-medium transition-colors">Cancelar</button>
                <button onClick={handleRevert} disabled={reverting} className="bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-bold transition-all shadow-lg">
                  {reverting ? 'Revirtiendo...' : 'Confirmar Reversión'}
                </button>
              </div>
            </div>
          </div>
        )}      </div>
    );
  }

  // ─── FORM VIEW ────────────────────────────────────────────────────
  return (
    <div className="w-full animate-in slide-in-from-bottom-8 duration-500 max-w-5xl mx-auto pb-12">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-[#f8fafc] mb-1 tracking-tight">Nueva Operación — Compra/Venta de Dólares</h1>
        <p className="text-[#94a3b8]">Indicá Vendedor y Comprador. Las cajas se completan automáticamente.</p>
      </header>

      <form onSubmit={handleSubmit} className="glass-panel p-8 rounded-2xl shadow-xl border-t border-t-white/10 relative overflow-hidden space-y-8">
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full blur-[100px] bg-[#0ea5e9]/8 pointer-events-none"></div>

        {/* MODE TOGGLE */}
        <div className="flex items-center gap-3 bg-[#0a1324]/60 border border-[#334155]/50 rounded-2xl p-4 relative z-10">
          <button type="button"
            onClick={() => setVentanilla(false)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              !ventanilla
                ? 'bg-[#0ea5e9] text-white shadow-lg shadow-[#0ea5e9]/20'
                : 'text-[#64748b] hover:text-[#94a3b8]'
            }`}>
            📊 Operación con Cliente
          </button>
          <button type="button"
            onClick={() => setVentanilla(true)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
              ventanilla
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20'
                : 'text-[#64748b] hover:text-[#94a3b8]'
            }`}>
            🧑‍💼 Ventanilla (Mostrador)
          </button>
        </div>

        {/* VENTANILLA MODE */}
        {ventanilla ? (
          <div className="relative z-10 space-y-5">
            {/* Operation type */}
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#64748b] mb-3">Tipo de operación</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button"
                  onClick={() => setVentanillaOp('BUY')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    ventanillaOp === 'BUY'
                      ? 'border-emerald-500/60 bg-emerald-500/10'
                      : 'border-[#334155]/50 bg-[#0a1324]/40 hover:border-[#334155]/80'
                  }`}>
                  <p className="text-2xl mb-2">💵→💵</p>
                  <p className={`font-bold text-sm ${ventanillaOp === 'BUY' ? 'text-emerald-300' : 'text-[#94a3b8]'}`}>
                    Cliente trae USD
                  </p>
                  <p className="text-xs text-[#64748b] mt-0.5">Agencia compra USD · entrega ARS</p>
                </button>
                <button type="button"
                  onClick={() => setVentanillaOp('SELL')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    ventanillaOp === 'SELL'
                      ? 'border-sky-500/60 bg-sky-500/10'
                      : 'border-[#334155]/50 bg-[#0a1324]/40 hover:border-[#334155]/80'
                  }`}>
                  <p className="text-2xl mb-2">💵←💵</p>
                  <p className={`font-bold text-sm ${ventanillaOp === 'SELL' ? 'text-sky-300' : 'text-[#94a3b8]'}`}>
                    Cliente trae ARS
                  </p>
                  <p className="text-xs text-[#64748b] mt-0.5">Agencia vende USD · recibe ARS</p>
                </button>
              </div>
            </div>
            {/* Optional reference name */}
            <div>
              <label className="block text-sm text-[#aab6c7] mb-1 font-medium">
                Referencia del cliente (opcional)
              </label>
              <input type="text" value={ventanillaName}
                onChange={e => setVentanillaName(e.target.value)}
                placeholder="Nombre o referencia para identificar la operación..."
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-amber-500" />
            </div>
          </div>
        ) : (
        /* CLIENT MODE — original Vendedor/Comprador cards */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
          {/* VENDEDOR */}
          <div className="bg-[#0a1324]/60 border border-[#334155]/60 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-red-400">Vendedor — Entrega USD</h3>
            <div>
              <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Nombre</label>
              <select required={!ventanilla} value={form.sellerId} onChange={e => setForm({ ...form, sellerId: e.target.value })}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-red-400 transition-colors">
                <option value="">Seleccione vendedor...</option>
                {partyOptions}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Caja Vendedor</label>
              <input readOnly value={getPartyLabel(form.sellerId)}
                className="w-full bg-[#050d1c] border border-[#1e2d40] rounded-lg px-4 py-3 text-[#64748b] cursor-not-allowed font-medium italic" />
            </div>
          </div>

          {/* COMPRADOR */}
          <div className="bg-[#0a1324]/60 border border-[#334155]/60 rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400">Comprador — Recibe USD</h3>
            <div>
              <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Nombre</label>
              <select required={!ventanilla} value={form.buyerId} onChange={e => setForm({ ...form, buyerId: e.target.value })}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-emerald-400 transition-colors">
                <option value="">Seleccione comprador...</option>
                {partyOptions}
              </select>
            </div>
            <div>
              <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Caja Comprador</label>
              <input readOnly value={getPartyLabel(form.buyerId)}
                className="w-full bg-[#050d1c] border border-[#1e2d40] rounded-lg px-4 py-3 text-[#64748b] cursor-not-allowed font-medium italic" />
            </div>
          </div>
        </div>
        )}

        {/* NÚMEROS */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-10">
          <div className="bg-[#141f32]/50 border border-[#2c394a] rounded-2xl p-5">
            <label className="block text-xs uppercase font-bold text-[#0ea5e9] mb-3 tracking-wider">Monto (USD)</label>
            <NumericFormat value={form.usdAmount} onValueChange={v => setForm({ ...form, usdAmount: v.value })}
              thousandSeparator="," decimalSeparator="." prefix="U$S "
              className="w-full bg-transparent border-b-2 border-[#334155] focus:border-[#0ea5e9] text-3xl text-[#f8fafc] font-bold py-1 focus:outline-none transition-colors"
              placeholder="U$S 0.00" />
          </div>
          <div className="bg-[#141f32]/50 border border-[#2c394a] rounded-2xl p-5">
            <label className="block text-xs uppercase font-bold text-[#64748b] mb-3 tracking-wider">Cotización (T/C)</label>
            <NumericFormat value={form.exchangeRate} onValueChange={v => setForm({ ...form, exchangeRate: v.value })}
              thousandSeparator="," decimalSeparator="." prefix="$ "
              className="w-full bg-transparent border-b-2 border-[#334155] focus:border-[#94a3b8] text-3xl text-[#d1dded] font-bold py-1 focus:outline-none transition-colors"
              placeholder="$ 0.00" />
          </div>
        </div>

        {/* TOTAL */}
        <div className="bg-[#081329] border border-emerald-500/30 rounded-2xl p-6 relative z-10">
          <p className="text-xs uppercase font-bold text-emerald-400 mb-1 tracking-wider">Total ARS Calculado</p>
          <p className="text-4xl font-bold text-[#f8fafc]">$ {calculatedArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
        </div>

        {/* META */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 relative z-10">
          <div>
            <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Fecha Operación</label>
            <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
              className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Notas (Opcional)</label>
            <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Observaciones de la operación..."
              className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
          </div>
        </div>

        {agencyBoxes.length > 1 && (
          <div className="relative z-10">
            <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Caja Interna de Contabilización</label>
            <select value={form.agencyBoxId} onChange={e => setForm({ ...form, agencyBoxId: e.target.value })}
              className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
              {agencyBoxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        )}

        <div className="pt-4 border-t border-[#334155]/50 flex justify-end space-x-4 relative z-10">
          <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-3 text-[#aab6c7] hover:text-white transition-colors font-medium">Volver</button>
          <button type="submit" disabled={loading}
            className={`px-8 py-3 rounded-xl font-bold text-white transition-all duration-300 shadow-lg ${loading ? 'opacity-50 cursor-not-allowed bg-gray-500' : 'bg-gradient-to-r from-[#0ea5e9] to-[#0284c7] hover:scale-105 hover:shadow-[0_0_20px_rgba(14,165,233,0.4)]'}`}>
            {loading ? 'Procesando...' : 'Confirmar Operación'}
          </button>
        </div>
      </form>

      {overdraftData && (
        <OverdraftConfirmModal
          overdrafts={overdraftData.overdrafts}
          onCancel={() => setOverdraftData(null)}
          onConfirm={() => doFxSubmit(overdraftData.payload, true)}
        />
      )}
    </div>
  );
}
