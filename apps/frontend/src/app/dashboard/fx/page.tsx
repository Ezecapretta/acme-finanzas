'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import toast from 'react-hot-toast';
import OverdraftConfirmModal, { OverdraftInfo } from '@/components/OverdraftConfirmModal';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass } from '@/components/ui/forms';

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
      <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-500 pb-8">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Historial C/V Dólares</h1>
            <p className="mt-1 text-[13.5px] text-muted">Registro de operaciones de cambio cursadas en la filial.</p>
          </div>
          <button onClick={() => setIsFormOpen(true)} className="rounded-[9px] bg-ink px-6 py-3 font-bold text-white shadow-sm transition-all hover:opacity-85">
            + Nueva Operación
          </button>
        </header>

        {/* TOTALES COMPRAS / VENTAS */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          {/* COMPRAS */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-positive" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Total Compras USD</p>
            </div>
            <p className="font-mono text-2xl font-black text-positive">
              {fmtUSD(fxTotals.comprasUSD)}
            </p>
            <p className="mt-1 font-mono text-sm text-muted">
              {fmtARS(fxTotals.comprasARS)} pagados
            </p>
          </Card>
          {/* VENTAS */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-warn" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted">Total Ventas USD</p>
            </div>
            <p className="font-mono text-2xl font-black text-warn">
              {fmtUSD(fxTotals.ventasUSD)}
            </p>
            <p className="mt-1 font-mono text-sm text-muted">
              {fmtARS(fxTotals.ventasARS)} cobrados
            </p>
          </Card>
        </div>

        {/* FILTER BAR */}
        <Card className="mb-4 space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Filtros</p>
            {hasFilter && <button onClick={() => { setFxSearch(''); setFxDateFrom(''); setFxDateTo(''); setFxOperator(''); }} className="text-xs font-medium text-accent transition-colors hover:underline">✕ Limpiar</button>}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">🔍</span>
              <input type="text" value={fxSearch} onChange={e => setFxSearch(e.target.value)}
                placeholder="Buscar en descripción..."
                className={`${inputClass} pl-9`} />
            </div>
            <select value={fxOperator} onChange={e => setFxOperator(e.target.value)} className={selectClass}>
              <option value="">Todos los operadores</option>
              {operatorNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Desde</label>
                <input type="date" value={fxDateFrom} onChange={e => setFxDateFrom(e.target.value)}
                  className={`${inputClass} px-2 py-2 text-xs`} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Hasta</label>
                <input type="date" value={fxDateTo} onChange={e => setFxDateTo(e.target.value)}
                  className={`${inputClass} px-2 py-2 text-xs`} />
              </div>
            </div>
          </div>
        </Card>

        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-sm text-muted"><span className="font-bold text-ink">{fxFiltered.length}</span> operación{fxFiltered.length !== 1 ? 'es' : ''}{hasFilter && <span className="ml-1 text-accent">(filtrado)</span>}</p>
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-track text-xs uppercase tracking-wider text-muted">
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold">Descripción / Operación</th>
                <th className="p-4 text-right font-semibold">USD</th>
                <th className="p-4 text-right font-semibold">ARS</th>
                <th className="p-4 text-right font-semibold">T/C Pactada</th>
                <th className="p-4 text-right font-semibold">Operador</th>
                <th className="w-24 p-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {fxFiltered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-faint">{hasFilter ? '⚠ Sin resultados para los filtros actuales.' : 'No hay operaciones registradas.'}</td></tr>
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
                <tr key={t.id} className={`border-b border-line transition-colors hover:bg-row-hover ${idx % 2 === 0 ? 'bg-transparent' : 'bg-canvas'}`}>
                  <td className="p-4 text-ink">{new Date(t.operation_date).toLocaleDateString()}</td>
                  <td className="p-4 text-ink">
                    {t.description?.startsWith('Ventanilla:') && (
                      <span className="mr-2 inline-block rounded bg-warn-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warn">Ventanilla</span>
                    )}
                    <span className={t.is_reversed ? 'text-faint line-through' : ''}>{t.description || '-'}</span>
                    {t.reversal_of && <span className="ml-2 rounded border border-line bg-track px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Reversión</span>}
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-ink">
                    {isSell ? '-' : '+'} {fmtUSD(usdAmt)}
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-ink">
                    {isSell ? '+' : '-'} {fmtARS(arsAmt)}
                  </td>
                  <td className="p-4 text-right font-mono font-bold text-accent">$ {Number(t.exchange_rate || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</td>
                  <td className="p-4 text-right text-muted">{t.user?.name || 'Sistema'}</td>
                  <td className="p-4 text-right">
                    {!t.is_reversed && !t.reversal_of && (
                      <button onClick={() => setRevertTarget(t)} className="rounded-lg border border-negative/30 px-3 py-1.5 text-xs font-medium text-negative transition-colors hover:bg-negative-bg">
                        Revertir
                      </button>
                    )}
                    {t.is_reversed && <span className="text-[10px] font-bold uppercase tracking-wider text-negative/70">Revertida</span>}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {fxVisible < fxFiltered.length && (
            <div className="border-t border-line p-4 text-center">
              <button onClick={() => setFxVisible(v => v + 10)} className="text-sm font-medium text-accent transition-colors hover:underline">
                Ver más ({fxFiltered.length - fxVisible} restantes)
              </button>
            </div>
          )}
        </Card>
        {revertTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-300">
            <div className="w-full max-w-lg rounded-[14px] border border-line bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-line p-6">
                <h2 className="text-xl font-semibold tracking-tight text-ink">Revertir Transacción</h2>
                <button onClick={() => setRevertTarget(null)} className="text-xl font-bold text-faint transition-colors hover:text-ink">×</button>
              </div>
              <div className="space-y-4 p-6">
                <p className="text-sm leading-relaxed text-muted">Esta acción creará asientos de contrapartida que <strong className="text-ink">anulan todos los efectos contables</strong> de la operación original. La transacción quedará marcada como <span className="font-semibold text-negative">REVERTIDA</span>.</p>
                <div className="rounded-xl border border-line bg-canvas px-4 py-3">
                  <p className="mb-1 text-xs uppercase tracking-wider text-faint">Operación a revertir</p>
                  <p className="font-medium text-ink">{revertTarget.description}</p>
                  <p className="mt-1 text-xs text-faint">{new Date(revertTarget.operation_date).toLocaleDateString()} · ID: {revertTarget.id.split('-')[0]}..</p>
                </div>
                <p className="text-xs text-warn">⚠ Esta acción no puede deshacerse.</p>
              </div>
              <div className="flex justify-end gap-3 border-t border-line p-6">
                <button onClick={() => setRevertTarget(null)} disabled={reverting} className="px-5 py-2.5 font-medium text-muted transition-colors hover:text-ink">Cancelar</button>
                <button onClick={handleRevert} disabled={reverting} className="rounded-lg bg-negative px-6 py-2.5 font-bold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-50">
                  {reverting ? 'Revirtiendo...' : 'Confirmar Reversión'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── FORM VIEW ────────────────────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-5xl animate-in slide-in-from-bottom-8 duration-500 pb-12">
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Nueva Operación — Compra/Venta de Dólares</h1>
        <p className="mt-1 text-[13.5px] text-muted">Indicá Vendedor y Comprador. Las cajas se completan automáticamente.</p>
      </header>

      <form onSubmit={handleSubmit}>
        <Card className="space-y-8 p-8">
          {/* MODE TOGGLE */}
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-canvas p-4">
            <button type="button"
              onClick={() => setVentanilla(false)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                !ventanilla
                  ? 'bg-ink text-white shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}>
              📊 Operación con Cliente
            </button>
            <button type="button"
              onClick={() => setVentanilla(true)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                ventanilla
                  ? 'bg-warn text-white shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}>
              🧑‍💼 Ventanilla (Mostrador)
            </button>
          </div>

          {/* VENTANILLA MODE */}
          {ventanilla ? (
            <div className="space-y-5">
              {/* Operation type */}
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Tipo de operación</p>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button"
                    onClick={() => setVentanillaOp('BUY')}
                    className={`rounded-2xl border-2 p-4 text-left transition-all ${
                      ventanillaOp === 'BUY'
                        ? 'border-positive bg-positive-bg'
                        : 'border-line bg-canvas hover:border-line-hover'
                    }`}>
                    <p className="mb-2 text-2xl">💵→💵</p>
                    <p className={`text-sm font-bold ${ventanillaOp === 'BUY' ? 'text-positive' : 'text-muted'}`}>
                      Cliente trae USD
                    </p>
                    <p className="mt-0.5 text-xs text-faint">Agencia compra USD · entrega ARS</p>
                  </button>
                  <button type="button"
                    onClick={() => setVentanillaOp('SELL')}
                    className={`rounded-2xl border-2 p-4 text-left transition-all ${
                      ventanillaOp === 'SELL'
                        ? 'border-accent bg-accent-bg'
                        : 'border-line bg-canvas hover:border-line-hover'
                    }`}>
                    <p className="mb-2 text-2xl">💵←💵</p>
                    <p className={`text-sm font-bold ${ventanillaOp === 'SELL' ? 'text-accent' : 'text-muted'}`}>
                      Cliente trae ARS
                    </p>
                    <p className="mt-0.5 text-xs text-faint">Agencia vende USD · recibe ARS</p>
                  </button>
                </div>
              </div>
              {/* Optional reference name */}
              <div>
                <label className="mb-1 block text-sm font-medium text-muted">
                  Referencia del cliente (opcional)
                </label>
                <input type="text" value={ventanillaName}
                  onChange={e => setVentanillaName(e.target.value)}
                  placeholder="Nombre o referencia para identificar la operación..."
                  className={inputClass} />
              </div>
            </div>
          ) : (
          /* CLIENT MODE — original Vendedor/Comprador cards */
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* VENDEDOR */}
            <div className="space-y-4 rounded-2xl border border-line bg-canvas p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-negative">Vendedor — Entrega USD</h3>
              <div>
                <label className="mb-1 block text-sm font-medium text-muted">Nombre</label>
                <select required={!ventanilla} value={form.sellerId} onChange={e => setForm({ ...form, sellerId: e.target.value })}
                  className={selectClass}>
                  <option value="">Seleccione vendedor...</option>
                  {partyOptions}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-muted">Caja Vendedor</label>
                <input readOnly value={getPartyLabel(form.sellerId)}
                  className="w-full cursor-not-allowed rounded-[9px] border border-line bg-track px-4 py-2.5 font-medium italic text-faint" />
              </div>
            </div>

            {/* COMPRADOR */}
            <div className="space-y-4 rounded-2xl border border-line bg-canvas p-5">
              <h3 className="text-xs font-bold uppercase tracking-widest text-positive">Comprador — Recibe USD</h3>
              <div>
                <label className="mb-1 block text-sm font-medium text-muted">Nombre</label>
                <select required={!ventanilla} value={form.buyerId} onChange={e => setForm({ ...form, buyerId: e.target.value })}
                  className={selectClass}>
                  <option value="">Seleccione comprador...</option>
                  {partyOptions}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-muted">Caja Comprador</label>
                <input readOnly value={getPartyLabel(form.buyerId)}
                  className="w-full cursor-not-allowed rounded-[9px] border border-line bg-track px-4 py-2.5 font-medium italic text-faint" />
              </div>
            </div>
          </div>
          )}

          {/* NÚMEROS */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-line bg-canvas p-5">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-accent">Monto (USD)</label>
              <NumericFormat value={form.usdAmount} onValueChange={v => setForm({ ...form, usdAmount: v.value })}
                thousandSeparator="," decimalSeparator="." prefix="U$S "
                className="w-full border-b-2 border-line bg-transparent py-1 text-3xl font-bold text-ink transition-colors focus:border-accent focus:outline-none"
                placeholder="U$S 0.00" />
            </div>
            <div className="rounded-2xl border border-line bg-canvas p-5">
              <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-muted">Cotización (T/C)</label>
              <NumericFormat value={form.exchangeRate} onValueChange={v => setForm({ ...form, exchangeRate: v.value })}
                thousandSeparator="," decimalSeparator="." prefix="$ "
                className="w-full border-b-2 border-line bg-transparent py-1 text-3xl font-bold text-ink transition-colors focus:border-ink focus:outline-none"
                placeholder="$ 0.00" />
            </div>
          </div>

          {/* TOTAL */}
          <div className="rounded-2xl border border-accent/30 bg-accent-bg p-6">
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-accent">Total ARS Calculado</p>
            <p className="text-4xl font-bold text-ink">$ {calculatedArs.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
          </div>

          {/* META */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">Fecha Operación</label>
              <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                className={inputClass} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">Notas (Opcional)</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="Observaciones de la operación..."
                className={inputClass} />
            </div>
          </div>

          {agencyBoxes.length > 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-muted">Caja Interna de Contabilización</label>
              <select value={form.agencyBoxId} onChange={e => setForm({ ...form, agencyBoxId: e.target.value })}
                className={selectClass}>
                {agencyBoxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex justify-end space-x-4 border-t border-line pt-4">
            <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-3 font-medium text-muted transition-colors hover:text-ink">Volver</button>
            <button type="submit" disabled={loading}
              className={`rounded-xl px-8 py-3 font-bold text-white shadow-sm transition-all duration-300 ${loading ? 'cursor-not-allowed bg-faint opacity-60' : 'bg-ink hover:opacity-85'}`}>
              {loading ? 'Procesando...' : 'Confirmar Operación'}
            </button>
          </div>
        </Card>
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
