'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

// ── Accounting sub-categories (for record-keeping) ────────────────────────
const ACCOUNTING_CATEGORIES = [
  { value: 'CLIENT_FUNDING',       label: 'Fondeo de Cliente' },
  { value: 'CAPITAL_CONTRIBUTION', label: 'Aporte de Socios' },
  { value: 'INTEREST_INCOME',      label: 'Cobro de Intereses' },
  { value: 'CHECK_DEPOSIT',        label: 'Ingreso de Cheque' },
  { value: 'OTHER',                label: 'Otro' },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  ACCOUNTING_CATEGORIES.map(c => [c.value, c.label])
);

// ── Income "type" — what is being received ────────────────────────────────
type IncomeType = 'ARS' | 'USD' | 'CHEQUE';

const INCOME_TYPES: { value: IncomeType; label: string; icon: string; color: string; activeColor: string }[] = [
  { value: 'ARS',    label: 'Pesos',   icon: '$',  color: 'border-[#334155]/50 text-[#94a3b8] hover:text-[#d1dded] hover:bg-white/5',         activeColor: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.15)]' },
  { value: 'USD',    label: 'Dólares', icon: 'U$S', color: 'border-[#334155]/50 text-[#94a3b8] hover:text-[#d1dded] hover:bg-white/5',        activeColor: 'border-sky-500/40 bg-sky-500/15 text-sky-300 shadow-[0_0_10px_rgba(14,165,233,0.15)]' },
  { value: 'CHEQUE', label: 'Cheque',  icon: '🏦', color: 'border-[#334155]/50 text-[#94a3b8] hover:text-[#d1dded] hover:bg-white/5',        activeColor: 'border-violet-500/40 bg-violet-500/15 text-violet-300 shadow-[0_0_10px_rgba(139,92,246,0.15)]' },
];

export default function IncomesPage() {
  const router = useRouter();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [transactions, setTransactions] = useState<any[]>([]);
  const [clients, setClients]           = useState<any[]>([]);
  const [boxes, setBoxes]               = useState<any[]>([]);
  const [revertTarget, setRevertTarget] = useState<any | null>(null);
  const [reverting, setReverting]       = useState(false);

  // ── Form state ─────────────────────────────────────────────────────────
  const [incomeType, setIncomeType] = useState<IncomeType>('ARS');
  const todayStr = new Date().toISOString().split('T')[0];
  const [operationDate, setOperationDate] = useState(todayStr);

  const [form, setForm] = useState({
    clientId:    '',
    agencyBoxId: '',
    amount:      '',
    category:    'CLIENT_FUNDING',
    description: '',
  });

  // Check list (only when incomeType === 'CHEQUE')
  const newCheckRow = () => {
    const today = new Date().toISOString().split('T')[0];
    const due = (() => { const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]; })();
    return { _id: String(Date.now() + Math.random()), bankName: '', checkNumber: '', amount: '', issueDate: today, dueDate: due };
  };
  const [checkList, setCheckList] = useState<any[]>(() => [newCheckRow()]);
  const updateCheckRow = (id: string, field: string, value: string) => {
    setCheckList(list => list.map(row => {
      if (row._id !== id) return row;
      const updated = { ...row, [field]: value };
      if (field === 'issueDate' && value) {
        const d = new Date(value + 'T00:00:00');
        d.setDate(d.getDate() + 30);
        updated.dueDate = d.toISOString().split('T')[0];
      }
      return updated;
    }));
  };

  const isCheck   = incomeType === 'CHEQUE';
  const currency  = incomeType === 'USD' ? 'USD' : 'ARS';

  // When type changes to CHEQUE, force category to CHECK_DEPOSIT; otherwise reset to CLIENT_FUNDING
  useEffect(() => {
    setForm(f => ({
      ...f,
      category: isCheck ? 'CHECK_DEPOSIT' : (f.category === 'CHECK_DEPOSIT' ? 'CLIENT_FUNDING' : f.category),
    }));
  }, [isCheck]);

  const loadTransactions = () => {
    Promise.all([
      fetchApi('/transactions?type=INCOME'),
      fetchApi('/transactions?type=CHECK_TRADE&category=CHECK_DEPOSIT'),
    ])
      .then(([cashTxs, checkTxs]) => {
        const all = [
          ...(Array.isArray(cashTxs) ? cashTxs : []),
          ...(Array.isArray(checkTxs) ? checkTxs : []),
        ].sort((a, b) => new Date(b.operation_date).getTime() - new Date(a.operation_date).getTime());
        setTransactions(all);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadTransactions();
    Promise.all([fetchApi('/clients'), fetchApi('/boxes')])
      .then(([clientData, boxData]) => {
        setClients(Array.isArray(clientData) ? clientData : (clientData.clients || []));
        const agencyBoxes = (boxData.boxes || []).filter((b: any) => !b.client_id);
        setBoxes(agencyBoxes);
        if (agencyBoxes.length > 0) setForm(prev => ({ ...prev, agencyBoxId: agencyBoxes[0].id }));
      })
      .catch(console.error);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.agencyBoxId || !form.description) {
      if (!form.agencyBoxId) toast.error("Cree una 'Caja Principal' primero.", { duration: 6000 });
      else toast.error('Complete la descripción.');
      return;
    }
    if (!isCheck && !form.amount) { toast.error('Ingrese el monto.'); return; }
    if (isCheck && checkList.some(r => !r.bankName || !r.checkNumber || !r.amount || !r.dueDate)) {
      toast.error('Complete banco, número, importe y vencimiento en todos los cheques.');
      return;
    }

    const userId = getUserId();
    if (!userId) { toast.error('Sesión inválida.'); return; }

    setLoading(true);
    try {
      if (isCheck) {
        await fetchApi('/checks/bulk-income', {
          method: 'POST',
          body: JSON.stringify({
            checks: checkList.map(row => ({
              check_number: row.checkNumber,
              bank_name:    row.bankName,
              amount:       Number(row.amount),
              currency:     'ARS',
              issue_date:   row.issueDate,
              due_date:     row.dueDate,
            })),
            clientId:      form.clientId || null,
            boxId:         form.agencyBoxId,
            description:   form.description,
            userId,
            operationDate: operationDate !== todayStr ? operationDate : undefined,
          }),
        });
        toast.success(`${checkList.length} cheque${checkList.length !== 1 ? 's' : ''} ingresado${checkList.length !== 1 ? 's' : ''} en cartera.`);
      } else {
        await fetchApi('/transactions/income', {
          method: 'POST',
          body: JSON.stringify({
            boxId:         form.agencyBoxId,
            clientId:      form.clientId || null,
            checkId:       null,
            amount:        Number(form.amount),
            currency,
            category:      form.category,
            description:   form.description,
            userId,
            operationDate: operationDate !== todayStr ? operationDate : undefined,
          }),
        });
        toast.success('Ingreso registrado exitosamente.');
      }
      setIsFormOpen(false);
      loadTransactions();
      setForm(f => ({ ...f, amount: '', description: '', clientId: '', category: 'CLIENT_FUNDING' }));
      setCheckList([newCheckRow()]);
      setIncomeType('ARS');
      setOperationDate(new Date().toISOString().split('T')[0]);
    } catch (error: any) {
      toast.error('Error: ' + (error.message || 'Error desconocido'));
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

  // ─── FILTER STATE ────────────────────────────────────────────────────────
  const [iSearch, setISearch]     = useState('');
  const [iCategory, setICategory] = useState('');
  const [iClient, setIClient]     = useState('');
  const [iCurrency, setICurrency] = useState('');
  const [iDateFrom, setIDateFrom] = useState('');
  const [iDateTo, setIDateTo]     = useState('');
  const [incomeVisible, setIncomeVisible] = useState(10);

  const incomeFiltered = transactions.filter((t: any) => {
    const mov = t.movements?.[0];
    if (iSearch    && !t.description?.toLowerCase().includes(iSearch.toLowerCase())) return false;
    if (iCategory  && t.category !== iCategory)          return false;
    if (iClient    && mov?.client?.id !== iClient)        return false;
    if (iCurrency  && mov?.currency !== iCurrency)        return false;
    if (iDateFrom  && new Date(t.operation_date) < new Date(iDateFrom)) return false;
    if (iDateTo    && new Date(t.operation_date) > new Date(iDateTo))   return false;
    return true;
  });
  // Total efectivo (sin cheques) y total cheques por separado
  const cashTotalARS = incomeFiltered.filter((t: any) => t.type === 'INCOME' && t.movements?.[0]?.currency === 'ARS').reduce((s: number, t: any) => s + Number(t.movements?.[0]?.amount || 0), 0);
  const cashTotalUSD = incomeFiltered.filter((t: any) => t.type === 'INCOME' && t.movements?.[0]?.currency === 'USD').reduce((s: number, t: any) => s + Number(t.movements?.[0]?.amount || 0), 0);
  const checkTotal = incomeFiltered.filter((t: any) => t.category === 'CHECK_DEPOSIT').reduce((s: number, t: any) => s + Number(t.movements?.[0]?.amount || 0), 0);
  const hasIFilter   = iSearch || iCategory || iClient || iCurrency || iDateFrom || iDateTo;

  // ─── LIST VIEW ───────────────────────────────────────────────────────────
  if (!isFormOpen) {
    return (
      <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto pb-8">
        <header className="mb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-bold text-[#f8fafc] mb-2 tracking-tight">Ingresos de Caja</h1>
            <p className="text-[#94a3b8]">Pesos, dólares y cheques recibidos.</p>
          </div>
          <button
            onClick={() => setIsFormOpen(true)}
            className="px-6 py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
          >
            + Nuevo Ingreso
          </button>
        </header>

        {/* FILTER BAR */}
        <div className="glass-panel rounded-2xl border border-[#334155]/50 p-5 mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]">Filtros</p>
            {hasIFilter && (
              <button onClick={() => { setISearch(''); setICategory(''); setIClient(''); setICurrency(''); setIDateFrom(''); setIDateTo(''); }}
                className="text-xs text-[#0ea5e9] hover:text-[#38bdf8] font-medium">✕ Limpiar</button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] text-sm">🔍</span>
              <input type="text" value={iSearch} onChange={e => setISearch(e.target.value)} placeholder="Buscar descripción..."
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-emerald-500 placeholder:text-[#334155]" />
            </div>
            <select value={iCategory} onChange={e => setICategory(e.target.value)}
              className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-emerald-500">
              <option value="">Todas las categorías</option>
              {ACCOUNTING_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={iClient} onChange={e => setIClient(e.target.value)}
              className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-emerald-500">
              <option value="">Todos los clientes</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select value={iCurrency} onChange={e => setICurrency(e.target.value)}
              className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-emerald-500">
              <option value="">Toda moneda</option>
              <option value="ARS">ARS — Pesos</option>
              <option value="USD">USD — Dólares</option>
            </select>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Desde</label>
              <input type="date" value={iDateFrom} onChange={e => setIDateFrom(e.target.value)}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2 text-xs text-[#d1dded] focus:outline-none focus:border-emerald-500" />
            </div>
            <div>
              <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Hasta</label>
              <input type="date" value={iDateTo} onChange={e => setIDateTo(e.target.value)}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2 text-xs text-[#d1dded] focus:outline-none focus:border-emerald-500" />
            </div>
          </div>
        </div>

        <div className="flex justify-between items-center mb-3 px-1">
          <p className="text-sm text-[#64748b]">
            <span className="text-[#d1dded] font-bold">{incomeFiltered.length}</span> resultado{incomeFiltered.length !== 1 ? 's' : ''}
            {hasIFilter && <span className="text-emerald-400 ml-1">(filtrado)</span>}
          </p>
          {incomeFiltered.length > 0 && (
            <div className="flex items-center gap-4">
              {cashTotalARS > 0 && (
                <p className="text-sm text-[#64748b]">ARS: <span className="text-emerald-400 font-bold font-mono">$ {cashTotalARS.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>
              )}
              {cashTotalUSD > 0 && (
                <p className="text-sm text-[#64748b]">USD: <span className="text-emerald-400 font-bold font-mono">U$S {cashTotalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>
              )}
              {checkTotal > 0 && (
                <p className="text-sm text-[#64748b]">Cheques: <span className="text-violet-400 font-bold font-mono">$ {checkTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>
              )}
            </div>
          )}
        </div>

        <div className="glass-panel rounded-2xl overflow-x-auto border border-[#334155]/50 shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#334155]/50 bg-[#0a1324]/50 text-[#94a3b8] text-xs uppercase tracking-wider">
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold">Tipo</th>
                <th className="p-4 font-semibold">Categoría</th>
                <th className="p-4 font-semibold">Cliente</th>
                <th className="p-4 font-semibold">Descripción</th>
                <th className="p-4 font-semibold text-right">Importe</th>
                <th className="p-4 font-semibold w-24"></th>
              </tr>
            </thead>
            <tbody>
              {incomeFiltered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-[#64748b]">
                  {hasIFilter ? '⚠ Sin resultados.' : 'No hay ingresos registrados.'}
                </td></tr>
              ) : incomeFiltered.slice(0, incomeVisible).map((t: any, idx: number) => {
                const mov      = t.movements?.[0];
                const isChk    = t.category === 'CHECK_DEPOSIT';
                const isUSD    = mov?.currency === 'USD';
                return (
                  <tr key={t.id} className={`border-b border-[#334155]/30 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0a1324]/30'}`}>
                    <td className="p-4 text-[#d1dded] whitespace-nowrap">{new Date(t.operation_date).toLocaleDateString('es-AR')}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-md text-xs font-bold border ${isChk ? 'bg-violet-500/10 text-violet-400 border-violet-500/20' : isUSD ? 'bg-sky-500/10 text-sky-400 border-sky-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                        {isChk ? '🏦 Cheque' : isUSD ? 'U$S Dólares' : '$ Pesos'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-black/30 rounded text-xs font-medium text-[#94a3b8] border border-[#334155]/50">
                        {CATEGORY_LABEL[t.category] ?? t.category}
                      </span>
                    </td>
                    <td className="p-4 text-[#d1dded]">{mov?.client?.name || '—'}</td>
                    <td className="p-4">
                      <p className={t.is_reversed ? 'text-[#677383] line-through' : 'text-[#d1dded]'}>{t.description}</p>
                      {t.reversal_of && <span className="mt-1 inline-block text-[10px] text-[#7e8b9d] bg-[#2c394a] px-1.5 py-0.5 rounded border border-[#4d596b] font-bold uppercase tracking-wider">Reversión</span>}
                    </td>
                    <td className={`p-4 font-bold font-mono text-right ${isChk ? 'text-violet-400' : isUSD ? 'text-sky-400' : 'text-emerald-400'}`}>
                      {isUSD ? 'U$S ' : '$ '}{Number(mov?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
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
          </table>
          {incomeVisible < incomeFiltered.length && (
            <div className="p-4 text-center border-t border-[#334155]/30">
              <button onClick={() => setIncomeVisible(v => v + 10)} className="text-sm text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
                Ver más ({incomeFiltered.length - incomeVisible} restantes)
              </button>
            </div>
          )}
        </div>

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
        )}
      </div>
    );
  }

  // ─── FORM VIEW ───────────────────────────────────────────────────────────
  const activeType = INCOME_TYPES.find(t => t.value === incomeType)!;

  return (
    <div className="w-full h-full animate-in slide-in-from-bottom-8 duration-500 max-w-3xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-[#f8fafc] mb-2 tracking-tight">Nuevo Ingreso</h1>
        <p className="text-[#94a3b8]">¿Qué estás recibiendo?</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── TIPO: PESOS / DÓLARES / CHEQUE ──────────────────────────── */}
        <div className="glass-panel p-5 rounded-2xl border border-[#334155]/50">
          <div className="grid grid-cols-3 gap-3">
            {INCOME_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setIncomeType(t.value)}
                className={`flex flex-col items-center gap-1.5 py-4 px-3 rounded-xl border font-bold transition-all duration-200 ${
                  incomeType === t.value ? t.activeColor : t.color
                }`}
              >
                <span className="text-2xl leading-none">{t.icon}</span>
                <span className="text-sm">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── DATOS PRINCIPALES ───────────────────────────────────────── */}
        <div className="glass-panel p-6 rounded-2xl border border-[#334155]/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Cliente */}
            <div>
              <label className="block text-sm text-[#aab6c7] mb-2 font-medium">
                Cliente
                {isCheck
                  ? <span className="text-[#475569] text-xs ml-1">(emisor del cheque — opcional)</span>
                  : <span className="text-[#475569] text-xs ml-1">(opcional)</span>}
              </label>
              <select
                value={form.clientId}
                onChange={e => setForm({ ...form, clientId: e.target.value })}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-emerald-500"
              >
                <option value="">{isCheck ? '— Sin cliente asociado (ventanilla) —' : 'Ingreso libre / sin cliente'}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Caja */}
            <div>
              <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Caja Receptora</label>
              <select disabled required value={form.agencyBoxId}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] opacity-70 cursor-not-allowed">
                <option value="">{boxes.length > 0 ? 'Autocompletado...' : 'Cree Caja Principal'}</option>
                {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            {/* Categoría contable — solo visible cuando NO es cheque */}
            {!isCheck && (
              <div className="md:col-span-2">
                <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Categoría contable</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-emerald-500"
                >
                  {ACCOUNTING_CATEGORIES.filter(c => c.value !== 'CHECK_DEPOSIT').map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Monto — solo visible cuando NO es cheque (cada cheque tiene su propio importe) */}
            {!isCheck && (
            <div className="col-span-1 md:col-span-2 bg-[#141f32]/50 border border-[#2c394a] rounded-2xl p-6">
              <label className="block text-xs uppercase font-bold mb-3 tracking-wider"
                style={{ color: incomeType === 'USD' ? '#38bdf8' : '#34d399' }}>
                {incomeType === 'USD' ? 'Monto en Dólares' : 'Monto en Pesos'}
              </label>
              <NumericFormat
                value={form.amount}
                onValueChange={v => setForm({ ...form, amount: v.value })}
                thousandSeparator="," decimalSeparator="."
                prefix={incomeType === 'USD' ? 'U$S ' : '$ '}
                className="w-full bg-transparent border-b-2 border-[#334155] focus:outline-none transition-colors text-4xl text-[#f8fafc] font-bold py-2"
                style={{ borderBottomColor: incomeType === 'USD' ? '#0ea5e9' : '#10b981' } as any}
                placeholder="0.00"
              />
            </div>
            )}

            {/* Descripción */}
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm text-[#aab6c7] mb-2 font-medium">Descripción / Motivo</label>
              <input
                type="text" required
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder={isCheck ? 'Ej: Cheque recibido de Juan por operación enero' : 'Ej: Aporte de capital en efectivo'}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Fecha de operación */}
            <div className="col-span-1 md:col-span-2">
              <label className="block text-sm text-[#aab6c7] mb-2 font-medium">
                Fecha de operación
                {operationDate !== todayStr && (
                  <span className="ml-2 text-xs text-amber-400 font-normal">← fecha retroactiva</span>
                )}
              </label>
              <input
                type="date"
                value={operationDate}
                max={todayStr}
                onChange={e => setOperationDate(e.target.value)}
                className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* ── DATOS DEL CHEQUE (solo si CHEQUE) ───────────────────────── */}
        {isCheck && (
          <div className="glass-panel p-6 rounded-2xl border border-violet-500/25 bg-violet-500/5 animate-in slide-in-from-top-2 duration-300 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold uppercase tracking-widest text-violet-400">
                Cheques a ingresar
                <span className="ml-2 text-violet-300/50 font-normal">({checkList.length} cheque{checkList.length !== 1 ? 's' : ''})</span>
              </h2>
              <button type="button"
                onClick={() => setCheckList(l => [...l, newCheckRow()])}
                className="text-xs font-bold text-violet-400 hover:text-violet-300 border border-violet-500/30 hover:border-violet-400/50 px-3 py-1.5 rounded-lg transition-all">
                + Agregar otro cheque
              </button>
            </div>

            {checkList.map((row, idx) => (
              <div key={row._id} className="bg-[#0a1324]/60 border border-[#2c394a] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Cheque #{idx + 1}</p>
                  {checkList.length > 1 && (
                    <button type="button"
                      onClick={() => setCheckList(l => l.filter(r => r._id !== row._id))}
                      className="text-xs text-red-400/70 hover:text-red-400 transition-colors">
                      ✕ Eliminar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#64748b] mb-1 font-medium">Banco <span className="text-red-400">*</span></label>
                    <input type="text" required value={row.bankName}
                      onChange={e => updateCheckRow(row._id, 'bankName', e.target.value)}
                      placeholder="Ej: Galicia, Nación..."
                      className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2.5 text-[#d1dded] text-sm focus:outline-none focus:border-violet-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#64748b] mb-1 font-medium">N° de Cheque <span className="text-red-400">*</span></label>
                    <input type="text" required value={row.checkNumber}
                      onChange={e => updateCheckRow(row._id, 'checkNumber', e.target.value)}
                      placeholder="Número"
                      className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2.5 text-[#d1dded] text-sm focus:outline-none focus:border-violet-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#64748b] mb-1 font-medium">Importe <span className="text-red-400">*</span></label>
                    <NumericFormat
                      value={row.amount}
                      onValueChange={v => updateCheckRow(row._id, 'amount', v.value)}
                      thousandSeparator="," decimalSeparator="." prefix="$ "
                      className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2.5 text-[#d1dded] text-sm focus:outline-none focus:border-violet-400"
                      placeholder="$ 0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#64748b] mb-1 font-medium">F. Emisión</label>
                    <input type="date" value={row.issueDate}
                      onChange={e => updateCheckRow(row._id, 'issueDate', e.target.value)}
                      className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2.5 text-[#d1dded] text-sm focus:outline-none focus:border-violet-400" />
                  </div>
                  <div>
                    <label className="block text-xs text-[#64748b] mb-1 font-medium">F. Vencimiento <span className="text-red-400">*</span></label>
                    <input type="date" required value={row.dueDate}
                      min={row.issueDate}
                      onChange={e => updateCheckRow(row._id, 'dueDate', e.target.value)}
                      className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2.5 text-[#d1dded] text-sm focus:outline-none focus:border-violet-400" />
                  </div>
                </div>
              </div>
            ))}

            {checkList.length > 1 && (
              <div className="flex justify-between items-center pt-2 border-t border-violet-500/20">
                <span className="text-sm text-[#64748b]">Total {checkList.length} cheques</span>
                <span className="text-base font-bold text-violet-300">
                  $ {checkList.reduce((s, r) => s + (Number(r.amount) || 0), 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <p className="text-xs text-violet-400/70">
              ℹ Los cheques quedarán en <strong>Pendiente de Compra</strong> y podrán comprarse desde Compra/Venta de Cheques.
            </p>
          </div>
        )}

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <div className="pt-2 flex justify-end gap-4">
          <button type="button" onClick={() => setIsFormOpen(false)}
            className="px-6 py-3 text-[#aab6c7] hover:text-white transition-colors font-medium">
            Volver
          </button>
          <button
            type="submit" disabled={loading}
            className={`px-8 py-3 rounded-xl font-bold text-white transition-all duration-300 shadow-lg ${
              loading ? 'opacity-50 cursor-not-allowed bg-gray-500'
              : isCheck      ? 'bg-gradient-to-r from-violet-500 to-violet-600 hover:scale-105 hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]'
              : incomeType === 'USD' ? 'bg-gradient-to-r from-sky-500 to-sky-600 hover:scale-105 hover:shadow-[0_0_20px_rgba(14,165,233,0.4)]'
              : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:scale-105 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)]'
            }`}
          >
            {loading ? 'Procesando...'
              : isCheck ? `🏦 Registrar ${checkList.length} Cheque${checkList.length !== 1 ? 's' : ''}`
              : `Confirmar Ingreso en ${incomeType === 'USD' ? 'Dólares' : 'Pesos'}`}
          </button>
        </div>
      </form>
    </div>
  );
}
