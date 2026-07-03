'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { AccountCurrency, CheckStatus } from '@acme/shared';
import { NumericFormat } from 'react-number-format';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass } from '@/components/ui/forms';

interface Check {
  id: string;
  check_number: string;
  bank_name: string;
  amount: number;
  currency: AccountCurrency;
  issue_date: string;
  due_date: string;
  status: CheckStatus;
  source_client: { id: string, name: string } | null;
  destination_client: { id: string, name: string } | null;
}

interface Client {
  id: string;
  name: string;
}

export default function ChecksPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [newCheck, setNewCheck] = useState({
    check_number: '', bank_name: '', amount: '', currency: 'ARS',
    issue_date: '', due_date: '', source_client_id: ''
  });

  const loadData = async () => {
    try {
      const [checksData, clientsData] = await Promise.all([
        fetchApi('/checks'),
        fetchApi('/clients')
      ]);
      setChecks(checksData);
      setClients(clientsData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetchApi('/checks', {
        method: 'POST',
        body: JSON.stringify(newCheck),
      });
      setShowModal(false);
      setNewCheck({ check_number: '', bank_name: '', amount: '', currency: 'ARS', issue_date: '', due_date: '', source_client_id: '' });
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusBadge = (status: CheckStatus) => {
    const base = 'px-2 py-1 rounded text-xs font-semibold';
    switch (status) {
        case 'PENDING_PURCHASE': return <span className={`${base} bg-warn-bg text-warn`}>Pendiente Compra</span>;
        case 'IN_PORTFOLIO': return <span className={`${base} bg-accent-bg text-accent`}>En Cartera</span>;
        case 'DELIVERED': return <span className={`${base} bg-track text-ink-soft`}>Entregado</span>;
        case 'DEPOSITED': return <span className={`${base} bg-positive-bg text-positive`}>Depositado</span>;
        case 'REJECTED': return <span className={`${base} bg-negative-bg text-negative`}>Rechazado</span>;
        default: return null;
    }
  };

  // ─── FILTER STATE ──────────────────────────────────────────────────
  const [checksVisible, setChecksVisible] = useState(20);

  const [chSearch, setChSearch] = useState('');
  const [chStatus, setChStatus] = useState('');
  const [chClient, setChClient] = useState('');
  const [chDueFrom, setChDueFrom] = useState('');
  const [chDueTo, setChDueTo] = useState('');
  const [chMinAmount, setChMinAmount] = useState('');

  const filteredChecks = checks.filter(c => {
    const q = chSearch.toLowerCase();
    if (q && !c.bank_name.toLowerCase().includes(q) && !c.check_number.toLowerCase().includes(q)) return false;
    if (chStatus && c.status !== chStatus) return false;
    if (chClient && c.source_client?.id !== chClient) return false;
    if (chDueFrom && new Date(c.due_date) < new Date(chDueFrom)) return false;
    if (chDueTo   && new Date(c.due_date) > new Date(chDueTo))   return false;
    if (chMinAmount && Number(c.amount) < Number(chMinAmount)) return false;
    return true;
  });
  const filteredTotal = filteredChecks.reduce((acc, c) => acc + Number(c.amount), 0);
  const hasChFilter = chSearch || chStatus || chClient || chDueFrom || chDueTo || chMinAmount;

  // ─── EDIT & VOID STATE ─────────────────────────────────────────────
  const [editCheck, setEditCheck] = useState<any | null>(null);
  const [voidCheckItem, setVoidCheckItem] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const isOverdue = (check: any) =>
    new Date(check.due_date) < today && check.status !== 'REJECTED' && check.status !== 'DEPOSITED';

  const handleVoid = async () => {
    if (!voidCheckItem) return;
    setSaving(true);
    try {
      await fetchApi(`/checks/${voidCheckItem.id}/void`, { method: 'PATCH' });
      setVoidCheckItem(null);
      loadData();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCheck) return;
    setSaving(true);
    try {
      await fetchApi(`/checks/${editCheck.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          check_number: editCheck.check_number,
          bank_name: editCheck.bank_name,
          amount: editCheck.amount,
          currency: editCheck.currency,
          issue_date: editCheck.issue_date?.split('T')[0],
          due_date: editCheck.due_date?.split('T')[0],
          source_client_id: editCheck.source_client_id || null,
          status: editCheck.status,
        })
      });
      setEditCheck(null);
      loadData();
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-500 pb-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Gestión de Cheques</h1>
          <p className="mt-1 text-[13.5px] text-muted">Control de valores de terceros y cartera activa.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-[9px] bg-ink px-5 py-2.5 font-bold text-white shadow-sm transition-all hover:opacity-85"
        >
          + Cargar Cheque
        </button>
      </header>

      {/* FILTER BAR */}
      <Card className="mb-4 space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Filtros</p>
          {hasChFilter && <button onClick={() => { setChSearch(''); setChStatus(''); setChClient(''); setChDueFrom(''); setChDueTo(''); setChMinAmount(''); }} className="text-xs font-medium text-accent transition-colors hover:underline">✕ Limpiar</button>}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">🔍</span>
            <input type="text" value={chSearch} onChange={e => setChSearch(e.target.value)} placeholder="Buscar banco o N° cheque..."
              className={`${inputClass} pl-9`} />
          </div>
          <select value={chStatus} onChange={e => setChStatus(e.target.value)} className={selectClass}>
            <option value="">Todos los estados</option>
            <option value="PENDING_PURCHASE">Pendiente de Compra</option>
            <option value="IN_PORTFOLIO">En Cartera</option>
            <option value="DELIVERED">Entregado</option>
            <option value="DEPOSITED">Depositado</option>
            <option value="REJECTED">Rechazado</option>
          </select>
          <select value={chClient} onChange={e => setChClient(e.target.value)} className={selectClass}>
            <option value="">Todos los clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Vto. desde</label>
            <input type="date" value={chDueFrom} onChange={e => setChDueFrom(e.target.value)}
              className={`${inputClass} py-2 text-xs`} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Vto. hasta</label>
            <input type="date" value={chDueTo} onChange={e => setChDueTo(e.target.value)}
              className={`${inputClass} py-2 text-xs`} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-muted">Importe mínimo ($)</label>
            <input type="number" value={chMinAmount} onChange={e => setChMinAmount(e.target.value)} placeholder="0.00"
              className={`${inputClass} py-2 text-xs`} />
          </div>
        </div>
      </Card>

      <div className="mb-3 flex items-center justify-between px-1">
        <p className="text-sm text-muted"><span className="font-bold text-ink">{filteredChecks.length}</span> resultado{filteredChecks.length !== 1 ? 's' : ''}{hasChFilter && <span className="ml-1 text-accent">(filtrado)</span>}</p>
        {filteredChecks.length > 0 && <p className="text-sm text-muted">Total: <span className="font-mono font-bold text-positive">$ {filteredTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>}
      </div>

      {/* Table */}
      <Card className="overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-track">
              <th className="p-4 font-medium text-muted">N° Cheque / Banco</th>
              <th className="p-4 font-medium text-muted">Cliente</th>
              <th className="p-4 font-medium text-muted">Importe</th>
              <th className="p-4 font-medium text-muted">Fechas (Emisión / Cobro)</th>
              <th className="p-4 font-medium text-muted">Estado</th>
              <th className="p-4 text-right font-medium text-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-4 text-center text-faint">Cargando cheques...</td></tr>
            ) : filteredChecks.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-faint">{hasChFilter ? '⚠ Sin resultados.' : 'No hay cheques registrados.'}</td></tr>
            ) : (
              filteredChecks.slice(0, checksVisible).map(check => {
                const overdue = isOverdue(check);
                return (
                  <tr key={check.id}
                    className={`border-b border-line transition-colors hover:bg-row-hover ${overdue ? 'bg-negative-bg/40' : ''}`}>
                    <td className="relative p-4">
                      {overdue && <span className="absolute bottom-0 left-0 top-0 w-0.5 bg-negative" />}
                      <p className="font-medium text-ink">{check.check_number}</p>
                      <p className="text-sm text-faint">{check.bank_name}</p>
                    </td>
                    <td className="p-4 text-sm text-muted">{check.source_client?.name || <span className="italic text-faint">Ventanilla</span>}</td>
                    <td className="p-4">
                      <p className="text-lg font-bold text-ink">{check.currency === 'ARS' ? '$' : 'U$S'} {Number(check.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                      <p className="mt-0.5 inline-block rounded border border-line bg-track px-1.5 py-0.5 text-xs font-semibold tracking-wider text-muted">
                        {check.currency === 'ARS' ? 'ARS' : 'USD'}
                      </p>
                    </td>
                    <td className="p-4 text-sm">
                      <p className="text-muted">Emisión: {new Date(check.issue_date).toLocaleDateString()}</p>
                      <p className={`font-medium ${overdue ? 'text-negative' : 'text-ink'}`}>
                        Cobro: {new Date(check.due_date).toLocaleDateString()}
                        {overdue && <span className="ml-2 rounded border border-negative/20 bg-negative-bg px-1.5 py-0.5 text-xs font-bold text-negative">VENCIDO</span>}
                      </p>
                    </td>
                    <td className="p-4">{getStatusBadge(check.status)}</td>
                    <td className="space-x-2 whitespace-nowrap p-4 text-right">
                      <button
                        onClick={() => setEditCheck({
                          ...check,
                          source_client_id: check.source_client?.id || '',
                          issue_date: check.issue_date?.split('T')[0],
                          due_date: check.due_date?.split('T')[0],
                        })}
                        className="rounded border border-accent/20 bg-accent-bg px-3 py-1.5 text-sm text-accent transition-colors hover:opacity-80">
                        Editar
                      </button>
                      {check.status !== 'REJECTED' && (
                        <button
                          onClick={() => setVoidCheckItem(check)}
                          className="rounded border border-negative/20 bg-negative-bg px-3 py-1.5 text-sm text-negative transition-colors hover:opacity-80">
                          Anular
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {checksVisible < filteredChecks.length && (
          <div className="border-t border-line p-4 text-center">
            <button onClick={() => setChecksVisible(v => v + 20)} className="text-sm font-medium text-accent transition-colors hover:underline">
              Ver más ({filteredChecks.length - checksVisible} restantes)
            </button>
          </div>
        )}
      </Card>

      {/* CREATE Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-xl rounded-[14px] border border-line bg-surface p-8 shadow-2xl">
            <h2 className="mb-6 text-2xl font-semibold text-ink">Cargar Nuevo Cheque</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm text-muted">Cliente Emisor (Opcional)</label>
                <select value={newCheck.source_client_id} onChange={e => setNewCheck({...newCheck, source_client_id: e.target.value})} className={selectClass}>
                  <option value="">Ventanilla / Sin cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">N° de Cheque</label>
                <input required value={newCheck.check_number} onChange={e => setNewCheck({...newCheck, check_number: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Banco</label>
                <input required value={newCheck.bank_name} onChange={e => setNewCheck({...newCheck, bank_name: e.target.value})} placeholder="Ej: Galicia" className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Importe</label>
                <NumericFormat required value={newCheck.amount} onValueChange={v => setNewCheck({...newCheck, amount: v.value})}
                  thousandSeparator="," decimalSeparator="." allowNegative={false} decimalScale={2}
                  className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Moneda</label>
                <select value={newCheck.currency} onChange={e => setNewCheck({...newCheck, currency: e.target.value})} className={selectClass}>
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Fecha de Pago (Venc.)</label>
                <input required type="date" value={newCheck.due_date} onChange={e => setNewCheck({...newCheck, due_date: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Fecha Emisión</label>
                <input required type="date" value={newCheck.issue_date} onChange={e => setNewCheck({...newCheck, issue_date: e.target.value})} className={inputClass} />
              </div>
              <div className="mt-2 flex justify-end space-x-3 md:col-span-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-muted transition-colors hover:text-ink">Cancelar</button>
                <button type="submit" className="rounded-lg bg-ink px-6 py-2 font-bold text-white shadow-sm transition-all hover:opacity-85">Registrar Cheque</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT Modal */}
      {editCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-xl rounded-[14px] border border-line bg-surface p-8 shadow-2xl">
            <h2 className="mb-1 text-2xl font-semibold text-ink">Editar Cheque</h2>
            <p className="mb-6 text-sm text-faint">#{editCheck.check_number} — {editCheck.bank_name}</p>
            <form onSubmit={handleEditSave} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm text-muted">Cliente Emisor</label>
                <select value={editCheck.source_client_id} onChange={e => setEditCheck({...editCheck, source_client_id: e.target.value})} className={selectClass}>
                  <option value="">Ventanilla / Sin cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">N° de Cheque</label>
                <input required value={editCheck.check_number} onChange={e => setEditCheck({...editCheck, check_number: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Banco</label>
                <input required value={editCheck.bank_name} onChange={e => setEditCheck({...editCheck, bank_name: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Importe</label>
                <NumericFormat value={editCheck.amount} onValueChange={v => setEditCheck({...editCheck, amount: v.value})}
                  thousandSeparator="," decimalSeparator="." allowNegative={false} decimalScale={2}
                  className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Moneda</label>
                <select value={editCheck.currency} onChange={e => setEditCheck({...editCheck, currency: e.target.value})} className={selectClass}>
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Fecha de Cobro (Venc.)</label>
                <input required type="date" value={editCheck.due_date?.split('T')[0]} onChange={e => setEditCheck({...editCheck, due_date: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Fecha Emisión</label>
                <input required type="date" value={editCheck.issue_date?.split('T')[0]} onChange={e => setEditCheck({...editCheck, issue_date: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Estado del Cheque</label>
                <select value={editCheck.status} onChange={e => setEditCheck({...editCheck, status: e.target.value})} className={selectClass}>
                  <option value="IN_PORTFOLIO">En Cartera</option>
                  <option value="DELIVERED">Entregado</option>
                  <option value="DEPOSITED">Depositado</option>
                  <option value="REJECTED">Rechazado</option>
                </select>
              </div>
              <div className="mt-2 flex justify-end space-x-3 md:col-span-2">
                <button type="button" onClick={() => setEditCheck(null)} className="px-4 py-2 text-muted transition-colors hover:text-ink">Cancelar</button>
                <button type="submit" disabled={saving} className="rounded-lg bg-ink px-6 py-2 font-bold text-white shadow-sm transition-all hover:opacity-85 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID Confirmation Modal */}
      {voidCheckItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-[14px] border border-negative/30 bg-surface p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-negative/20 bg-negative-bg">
              <span className="text-3xl font-bold text-negative">!</span>
            </div>
            <h2 className="mb-2 text-xl font-bold text-ink">¿Anular Cheque?</h2>
            <p className="mb-2 text-sm text-muted">
              Estás a punto de anular el cheque <strong className="text-ink">#{voidCheckItem.check_number}</strong> del banco <strong className="text-ink">{voidCheckItem.bank_name}</strong>.
            </p>
            <p className="mb-8 text-xs text-faint">El estado pasará a <span className="font-bold text-negative">Rechazado</span>. Esta acción puede revertirse editándolo.</p>
            <div className="flex flex-col space-y-3">
              <button onClick={handleVoid} disabled={saving} className="w-full rounded-lg bg-negative py-2.5 font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50">
                {saving ? 'Anulando...' : 'Sí, anular cheque'}
              </button>
              <button onClick={() => setVoidCheckItem(null)} className="w-full rounded-lg bg-track py-2.5 font-medium text-muted transition-colors hover:text-ink">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
