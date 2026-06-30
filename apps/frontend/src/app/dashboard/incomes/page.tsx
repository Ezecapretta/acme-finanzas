'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { NumericFormat } from 'react-number-format';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass } from '@/components/ui/forms';

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

const INACTIVE_TYPE = 'border-line text-muted hover:bg-track hover:text-ink';
const INCOME_TYPES: { value: IncomeType; label: string; icon: string; activeColor: string }[] = [
  { value: 'ARS',    label: 'Pesos',   icon: '$',   activeColor: 'border-positive bg-positive-bg text-positive' },
  { value: 'USD',    label: 'Dólares', icon: 'U$S', activeColor: 'border-warn bg-warn-bg text-warn' },
  { value: 'CHEQUE', label: 'Cheque',  icon: '🏦',  activeColor: 'border-accent bg-accent-bg text-accent' },
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
      <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-500 pb-8">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Ingresos de Caja</h1>
            <p className="mt-1 text-[13.5px] text-muted">Pesos, dólares y cheques recibidos.</p>
          </div>
          <button
            onClick={() => setIsFormOpen(true)}
            className="rounded-[9px] bg-positive px-5 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90"
          >
            + Nuevo Ingreso
          </button>
        </header>

        {/* FILTER BAR */}
        <Card className="mb-4 space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Filtros</p>
            {hasIFilter && (
              <button onClick={() => { setISearch(''); setICategory(''); setIClient(''); setICurrency(''); setIDateFrom(''); setIDateTo(''); }}
                className="text-xs font-medium text-accent hover:underline">✕ Limpiar</button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">🔍</span>
              <input type="text" value={iSearch} onChange={e => setISearch(e.target.value)} placeholder="Buscar descripción..."
                className={`${inputClass} pl-9`} />
            </div>
            <select value={iCategory} onChange={e => setICategory(e.target.value)} className={selectClass}>
              <option value="">Todas las categorías</option>
              {ACCOUNTING_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <select value={iClient} onChange={e => setIClient(e.target.value)} className={selectClass}>
              <option value="">Todos los clientes</option>
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <select value={iCurrency} onChange={e => setICurrency(e.target.value)} className={selectClass}>
              <option value="">Toda moneda</option>
              <option value="ARS">ARS — Pesos</option>
              <option value="USD">USD — Dólares</option>
            </select>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Desde</label>
              <input type="date" value={iDateFrom} onChange={e => setIDateFrom(e.target.value)}
                className={`${inputClass} py-2 text-xs`} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Hasta</label>
              <input type="date" value={iDateTo} onChange={e => setIDateTo(e.target.value)}
                className={`${inputClass} py-2 text-xs`} />
            </div>
          </div>
        </Card>

        <div className="mb-3 flex items-center justify-between px-1">
          <p className="text-sm text-muted">
            <span className="font-bold text-ink">{incomeFiltered.length}</span> resultado{incomeFiltered.length !== 1 ? 's' : ''}
            {hasIFilter && <span className="ml-1 text-positive">(filtrado)</span>}
          </p>
          {incomeFiltered.length > 0 && (
            <div className="flex items-center gap-4">
              {cashTotalARS > 0 && (
                <p className="text-sm text-muted">ARS: <span className="font-mono font-bold text-positive">$ {cashTotalARS.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>
              )}
              {cashTotalUSD > 0 && (
                <p className="text-sm text-muted">USD: <span className="font-mono font-bold text-positive">U$S {cashTotalUSD.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>
              )}
              {checkTotal > 0 && (
                <p className="text-sm text-muted">Cheques: <span className="font-mono font-bold text-accent">$ {checkTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>
              )}
            </div>
          )}
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-track text-xs uppercase tracking-wider text-muted">
                <th className="p-4 font-semibold">Fecha</th>
                <th className="p-4 font-semibold">Tipo</th>
                <th className="p-4 font-semibold">Categoría</th>
                <th className="p-4 font-semibold">Cliente</th>
                <th className="p-4 font-semibold">Descripción</th>
                <th className="p-4 text-right font-semibold">Importe</th>
                <th className="w-24 p-4 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {incomeFiltered.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-faint">
                  {hasIFilter ? '⚠ Sin resultados.' : 'No hay ingresos registrados.'}
                </td></tr>
              ) : incomeFiltered.slice(0, incomeVisible).map((t: any, idx: number) => {
                const mov      = t.movements?.[0];
                const isChk    = t.category === 'CHECK_DEPOSIT';
                const isUSD    = mov?.currency === 'USD';
                return (
                  <tr key={t.id} className={`border-b border-line transition-colors hover:bg-row-hover ${idx % 2 === 0 ? 'bg-transparent' : 'bg-canvas'}`}>
                    <td className="whitespace-nowrap p-4 text-ink">{new Date(t.operation_date).toLocaleDateString('es-AR')}</td>
                    <td className="p-4">
                      <span className={`whitespace-nowrap rounded-md px-2 py-1 text-xs font-bold ${isChk ? 'bg-accent-bg text-accent' : isUSD ? 'bg-warn-bg text-warn' : 'bg-positive-bg text-positive'}`}>
                        {isChk ? '🏦 Cheque' : isUSD ? 'U$S Dólares' : '$ Pesos'}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="whitespace-nowrap rounded border border-line bg-track px-2 py-1 text-xs font-medium text-muted">
                        {CATEGORY_LABEL[t.category] ?? t.category}
                      </span>
                    </td>
                    <td className="p-4 text-ink">{mov?.client?.name || '—'}</td>
                    <td className="p-4">
                      <p className={t.is_reversed ? 'text-faint line-through' : 'text-ink'}>{t.description}</p>
                      {t.reversal_of && <span className="mt-1 inline-block rounded border border-line bg-track px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">Reversión</span>}
                    </td>
                    <td className={`whitespace-nowrap p-4 text-right font-mono font-bold ${isChk ? 'text-accent' : isUSD ? 'text-warn' : 'text-positive'}`}>
                      {isUSD ? 'U$S ' : '$ '}{Number(mov?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
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
          {incomeVisible < incomeFiltered.length && (
            <div className="border-t border-line p-4 text-center">
              <button onClick={() => setIncomeVisible(v => v + 10)} className="text-sm font-medium text-accent transition-colors hover:underline">
                Ver más ({incomeFiltered.length - incomeVisible} restantes)
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

  // ─── FORM VIEW ───────────────────────────────────────────────────────────
  const activeType = INCOME_TYPES.find(t => t.value === incomeType)!;

  return (
    <div className="mx-auto w-full max-w-4xl animate-in slide-in-from-bottom-8 duration-500">
      <header className="mb-8">
        <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Nuevo Ingreso</h1>
        <p className="mt-1 text-[13.5px] text-muted">¿Qué estás recibiendo?</p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── TIPO: PESOS / DÓLARES / CHEQUE ──────────────────────────── */}
        <Card className="p-5">
          <div className="grid grid-cols-3 gap-3">
            {INCOME_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setIncomeType(t.value)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-3 py-4 font-bold transition-all duration-200 ${
                  incomeType === t.value ? t.activeColor : INACTIVE_TYPE
                }`}
              >
                <span className="text-2xl leading-none">{t.icon}</span>
                <span className="text-sm">{t.label}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* ── DATOS PRINCIPALES ───────────────────────────────────────── */}
        <Card className="p-6">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

            {/* Cliente */}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">
                Cliente
                {isCheck
                  ? <span className="ml-1 text-xs text-faint">(emisor del cheque — opcional)</span>
                  : <span className="ml-1 text-xs text-faint">(opcional)</span>}
              </label>
              <select
                value={form.clientId}
                onChange={e => setForm({ ...form, clientId: e.target.value })}
                className={selectClass}
              >
                <option value="">{isCheck ? '— Sin cliente asociado (ventanilla) —' : 'Ingreso libre / sin cliente'}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Caja */}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted">Caja Receptora</label>
              <select disabled required value={form.agencyBoxId}
                className={`${selectClass} cursor-not-allowed opacity-60`}>
                <option value="">{boxes.length > 0 ? 'Autocompletado...' : 'Cree Caja Principal'}</option>
                {boxes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            {/* Categoría contable — solo visible cuando NO es cheque */}
            {!isCheck && (
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-muted">Categoría contable</label>
                <select
                  value={form.category}
                  onChange={e => setForm({ ...form, category: e.target.value })}
                  className={selectClass}
                >
                  {ACCOUNTING_CATEGORIES.filter(c => c.value !== 'CHECK_DEPOSIT').map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Monto — solo visible cuando NO es cheque (cada cheque tiene su propio importe) */}
            {!isCheck && (
            <div className="col-span-1 rounded-2xl border border-line bg-canvas p-6 md:col-span-2">
              <label className={`mb-3 block text-xs font-bold uppercase tracking-wider ${incomeType === 'USD' ? 'text-warn' : 'text-positive'}`}>
                {incomeType === 'USD' ? 'Monto en Dólares' : 'Monto en Pesos'}
              </label>
              <NumericFormat
                value={form.amount}
                onValueChange={v => setForm({ ...form, amount: v.value })}
                thousandSeparator="," decimalSeparator="."
                prefix={incomeType === 'USD' ? 'U$S ' : '$ '}
                className="w-full border-b-2 bg-transparent py-2 text-4xl font-bold text-ink transition-colors focus:outline-none"
                style={{ borderBottomColor: incomeType === 'USD' ? '#b25a00' : '#0a7a52' } as any}
                placeholder="0.00"
              />
            </div>
            )}

            {/* Descripción */}
            <div className="col-span-1 md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-muted">Descripción / Motivo</label>
              <input
                type="text" required
                value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder={isCheck ? 'Ej: Cheque recibido de Juan por operación enero' : 'Ej: Aporte de capital en efectivo'}
                className={inputClass}
              />
            </div>

            {/* Fecha de operación */}
            <div className="col-span-1 md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-muted">
                Fecha de operación
                {operationDate !== todayStr && (
                  <span className="ml-2 text-xs font-normal text-warn">← fecha retroactiva</span>
                )}
              </label>
              <input
                type="date"
                value={operationDate}
                max={todayStr}
                onChange={e => setOperationDate(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </Card>

        {/* ── DATOS DEL CHEQUE (solo si CHEQUE) ───────────────────────── */}
        {isCheck && (
          <Card className="space-y-4 border-accent/30 bg-accent-bg p-6 animate-in slide-in-from-top-2 duration-300">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-accent">
                Cheques a ingresar
                <span className="ml-2 font-normal text-accent/60">({checkList.length} cheque{checkList.length !== 1 ? 's' : ''})</span>
              </h2>
              <button type="button"
                onClick={() => setCheckList(l => [...l, newCheckRow()])}
                className="rounded-lg border border-accent/40 px-3 py-1.5 text-xs font-bold text-accent transition-all hover:bg-accent-bg">
                + Agregar otro cheque
              </button>
            </div>

            {checkList.map((row, idx) => (
              <div key={row._id} className="rounded-xl border border-line bg-surface p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">Cheque #{idx + 1}</p>
                  {checkList.length > 1 && (
                    <button type="button"
                      onClick={() => setCheckList(l => l.filter(r => r._id !== row._id))}
                      className="text-xs text-negative/70 transition-colors hover:text-negative">
                      ✕ Eliminar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Banco <span className="text-negative">*</span></label>
                    <input type="text" required value={row.bankName}
                      onChange={e => updateCheckRow(row._id, 'bankName', e.target.value)}
                      placeholder="Ej: Galicia, Nación..."
                      className={`${inputClass} py-2.5 text-sm`} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">N° de Cheque <span className="text-negative">*</span></label>
                    <input type="text" required value={row.checkNumber}
                      onChange={e => updateCheckRow(row._id, 'checkNumber', e.target.value)}
                      placeholder="Número"
                      className={`${inputClass} py-2.5 text-sm`} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">Importe <span className="text-negative">*</span></label>
                    <NumericFormat
                      value={row.amount}
                      onValueChange={v => updateCheckRow(row._id, 'amount', v.value)}
                      thousandSeparator="," decimalSeparator="." prefix="$ "
                      className={`${inputClass} py-2.5 text-sm`}
                      placeholder="$ 0.00"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">F. Emisión</label>
                    <input type="date" value={row.issueDate}
                      onChange={e => updateCheckRow(row._id, 'issueDate', e.target.value)}
                      className={`${inputClass} py-2.5 text-sm`} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted">F. Vencimiento <span className="text-negative">*</span></label>
                    <input type="date" required value={row.dueDate}
                      min={row.issueDate}
                      onChange={e => updateCheckRow(row._id, 'dueDate', e.target.value)}
                      className={`${inputClass} py-2.5 text-sm`} />
                  </div>
                </div>
              </div>
            ))}

            {checkList.length > 1 && (
              <div className="flex items-center justify-between border-t border-accent/20 pt-2">
                <span className="text-sm text-muted">Total {checkList.length} cheques</span>
                <span className="text-base font-bold text-accent">
                  $ {checkList.reduce((s, r) => s + (Number(r.amount) || 0), 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            <p className="text-xs text-accent/70">
              ℹ Los cheques quedarán en <strong>Pendiente de Compra</strong> y podrán comprarse desde Compra/Venta de Cheques.
            </p>
          </Card>
        )}

        {/* ── FOOTER ───────────────────────────────────────────────────── */}
        <div className="flex justify-end gap-4 pt-2">
          <button type="button" onClick={() => setIsFormOpen(false)}
            className="px-6 py-3 font-medium text-muted transition-colors hover:text-ink">
            Volver
          </button>
          <button
            type="submit" disabled={loading}
            className={`rounded-xl px-8 py-3 font-bold text-white shadow-sm transition-all duration-300 ${
              loading ? 'cursor-not-allowed bg-faint opacity-60'
              : isCheck      ? 'bg-accent hover:opacity-90'
              : incomeType === 'USD' ? 'bg-warn hover:opacity-90'
              : 'bg-positive hover:opacity-90'
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
