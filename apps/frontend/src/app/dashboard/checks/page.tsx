'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { AccountCurrency, CheckStatus } from '@acme/shared';
import { NumericFormat } from 'react-number-format';

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
    switch (status) {
        case 'PENDING_PURCHASE': return <span className="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded text-xs">Pendiente Compra</span>;
        case 'IN_PORTFOLIO': return <span className="bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-1 rounded text-xs">En Cartera</span>;
        case 'DELIVERED': return <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-2 py-1 rounded text-xs">Entregado</span>;
        case 'DEPOSITED': return <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded text-xs">Depositado</span>;
        case 'REJECTED': return <span className="bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded text-xs">Rechazado</span>;
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
    <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500 pb-8">
      <header className="mb-6 flex justify-between items-center bg-[#141f32]/40 backdrop-blur-md border border-[#2c394a] shadow-lg rounded-2xl p-6">
        <div>
          <h1 className="text-3xl font-bold text-[#d1dded] mb-2">Gestión de Cheques</h1>
          <p className="text-[#aab6c7]">Control de valores de terceros y cartera activa.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-[#0ea5e9]/20 hover:shadow-[#0ea5e9]/30 hover:-translate-y-0.5"
        >
          + Cargar Cheque
        </button>
      </header>

      {/* FILTER BAR */}
      <div className="bg-[#141f32]/40 backdrop-blur-md border border-[#2c394a] rounded-2xl p-5 mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-[#64748b]">Filtros</p>
          {hasChFilter && <button onClick={() => { setChSearch(''); setChStatus(''); setChClient(''); setChDueFrom(''); setChDueTo(''); setChMinAmount(''); }} className="text-xs text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">✕ Limpiar</button>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] text-sm">🔍</span>
            <input type="text" value={chSearch} onChange={e => setChSearch(e.target.value)} placeholder="Buscar banco o N° cheque..."
              className="w-full bg-[#081329] border border-[#2c394a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] transition-colors placeholder:text-[#334155]" />
          </div>
          <select value={chStatus} onChange={e => setChStatus(e.target.value)}
            className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
            <option value="">Todos los estados</option>
            <option value="PENDING_PURCHASE">Pendiente de Compra</option>
            <option value="IN_PORTFOLIO">En Cartera</option>
            <option value="DELIVERED">Entregado</option>
            <option value="DEPOSITED">Depositado</option>
            <option value="REJECTED">Rechazado</option>
          </select>
          <select value={chClient} onChange={e => setChClient(e.target.value)}
            className="bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
            <option value="">Todos los clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Vto. desde</label>
            <input type="date" value={chDueFrom} onChange={e => setChDueFrom(e.target.value)}
              className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2 text-xs text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Vto. hasta</label>
            <input type="date" value={chDueTo} onChange={e => setChDueTo(e.target.value)}
              className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2 text-xs text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
          </div>
          <div>
            <label className="block text-[10px] uppercase font-bold text-[#64748b] mb-1 tracking-wider">Importe mínimo ($)</label>
            <input type="number" value={chMinAmount} onChange={e => setChMinAmount(e.target.value)} placeholder="0.00"
              className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-3 py-2 text-xs text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] placeholder:text-[#334155]" />
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center mb-3 px-1">
        <p className="text-sm text-[#64748b]"><span className="text-[#d1dded] font-bold">{filteredChecks.length}</span> resultado{filteredChecks.length !== 1 ? 's' : ''}{hasChFilter && <span className="text-[#0ea5e9] ml-1">(filtrado)</span>}</p>
        {filteredChecks.length > 0 && <p className="text-sm text-[#64748b]">Total: <span className="text-emerald-400 font-bold font-mono">$ {filteredTotal.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span></p>}
      </div>

      {/* Table */}
      <div className="bg-[#141f32]/40 backdrop-blur-md border border-[#2c394a] shadow-lg rounded-2xl overflow-hidden overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[860px]">
          <thead>
            <tr className="bg-[#081329]/50 border-b border-[#2c394a]">
              <th className="p-4 text-[#aab6c7] font-medium">N° Cheque / Banco</th>
              <th className="p-4 text-[#aab6c7] font-medium">Cliente</th>
              <th className="p-4 text-[#aab6c7] font-medium">Importe</th>
              <th className="p-4 text-[#aab6c7] font-medium">Fechas (Emisión / Cobro)</th>
              <th className="p-4 text-[#aab6c7] font-medium">Estado</th>
              <th className="p-4 text-[#aab6c7] font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-4 text-center text-[#7e8b9d]">Cargando cheques...</td></tr>
            ) : filteredChecks.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-[#7e8b9d]">{hasChFilter ? '⚠ Sin resultados.' : 'No hay cheques registrados.'}</td></tr>
            ) : (
              filteredChecks.slice(0, checksVisible).map(check => {
                const overdue = isOverdue(check);
                return (
                  <tr key={check.id}
                    className={`border-b border-[#2c394a]/50 hover:bg-[#2c394a]/30 transition-colors ${overdue ? 'bg-red-500/5' : ''}`}>
                    <td className="p-4 relative">
                      {overdue && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-red-500" />}
                      <p className="text-[#d1dded] font-medium">{check.check_number}</p>
                      <p className="text-sm text-[#7e8b9d]">{check.bank_name}</p>
                    </td>
                    <td className="p-4 text-[#929fb1] text-sm">{check.source_client?.name || <span className="italic text-[#4a5568]">Ventanilla</span>}</td>
                    <td className="p-4">
                      <p className="text-[#d1dded] font-bold text-lg">{check.currency === 'ARS' ? '$' : 'U$S'} {Number(check.amount).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                      <p className="text-xs text-[#aab6c7] tracking-wider font-semibold bg-[#2c394a]/30 inline-block px-1.5 py-0.5 rounded border border-[#2c394a] mt-0.5">
                        {check.currency === 'ARS' ? 'ARS' : 'USD'}
                      </p>
                    </td>
                    <td className="p-4 text-sm">
                      <p className="text-[#929fb1]">Emisión: {new Date(check.issue_date).toLocaleDateString()}</p>
                      <p className={`font-medium ${overdue ? 'text-red-400' : 'text-[#d1dded]'}`}>
                        Cobro: {new Date(check.due_date).toLocaleDateString()}
                        {overdue && <span className="ml-2 text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-bold">VENCIDO</span>}
                      </p>
                    </td>
                    <td className="p-4">{getStatusBadge(check.status)}</td>
                    <td className="p-4 text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => setEditCheck({
                          ...check,
                          source_client_id: check.source_client?.id || '',
                          issue_date: check.issue_date?.split('T')[0],
                          due_date: check.due_date?.split('T')[0],
                        })}
                        className="text-sm px-3 py-1.5 rounded bg-[#0ea5e9]/10 hover:bg-[#0ea5e9]/20 text-[#0ea5e9] border border-[#0ea5e9]/20 transition-colors">
                        Editar
                      </button>
                      {check.status !== 'REJECTED' && (
                        <button
                          onClick={() => setVoidCheckItem(check)}
                          className="text-sm px-3 py-1.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors">
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
          <div className="p-4 text-center border-t border-[#334155]/30">
            <button onClick={() => setChecksVisible(v => v + 20)} className="text-sm text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">
              Ver más ({filteredChecks.length - checksVisible} restantes)
            </button>
          </div>
        )}
      </div>

      {/* CREATE Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#141f32] p-8 rounded-2xl border border-[#2c394a] w-full max-w-xl shadow-2xl my-8">
            <h2 className="text-2xl font-bold text-[#d1dded] mb-6">Cargar Nuevo Cheque</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm text-[#aab6c7] mb-1">Cliente Emisor (Opcional)</label>
                <select value={newCheck.source_client_id} onChange={e => setNewCheck({...newCheck, source_client_id: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
                  <option value="">Ventanilla / Sin cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">N° de Cheque</label>
                <input required value={newCheck.check_number} onChange={e => setNewCheck({...newCheck, check_number: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Banco</label>
                <input required value={newCheck.bank_name} onChange={e => setNewCheck({...newCheck, bank_name: e.target.value})} placeholder="Ej: Galicia" className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Importe</label>
                <NumericFormat required value={newCheck.amount} onValueChange={v => setNewCheck({...newCheck, amount: v.value})}
                  thousandSeparator="," decimalSeparator="." allowNegative={false} decimalScale={2}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Moneda</label>
                <select value={newCheck.currency} onChange={e => setNewCheck({...newCheck, currency: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Fecha de Pago (Venc.)</label>
                <input required type="date" value={newCheck.due_date} onChange={e => setNewCheck({...newCheck, due_date: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Fecha Emisión</label>
                <input required type="date" value={newCheck.issue_date} onChange={e => setNewCheck({...newCheck, issue_date: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div className="md:col-span-2 flex justify-end space-x-3 mt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-[#aab6c7] hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-6 py-2 rounded-lg font-bold transition-all shadow-md shadow-[#0ea5e9]/20">Registrar Cheque</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT Modal */}
      {editCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-[#141f32] p-8 rounded-2xl border border-[#0ea5e9]/30 w-full max-w-xl shadow-2xl my-8">
            <h2 className="text-2xl font-bold text-[#d1dded] mb-1">Editar Cheque</h2>
            <p className="text-[#64748b] text-sm mb-6">#{editCheck.check_number} — {editCheck.bank_name}</p>
            <form onSubmit={handleEditSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm text-[#aab6c7] mb-1">Cliente Emisor</label>
                <select value={editCheck.source_client_id} onChange={e => setEditCheck({...editCheck, source_client_id: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
                  <option value="">Ventanilla / Sin cliente</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">N° de Cheque</label>
                <input required value={editCheck.check_number} onChange={e => setEditCheck({...editCheck, check_number: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Banco</label>
                <input required value={editCheck.bank_name} onChange={e => setEditCheck({...editCheck, bank_name: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Importe</label>
                <NumericFormat value={editCheck.amount} onValueChange={v => setEditCheck({...editCheck, amount: v.value})}
                  thousandSeparator="," decimalSeparator="." allowNegative={false} decimalScale={2}
                  className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Moneda</label>
                <select value={editCheck.currency} onChange={e => setEditCheck({...editCheck, currency: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
                  <option value="ARS">Pesos (ARS)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Fecha de Cobro (Venc.)</label>
                <input required type="date" value={editCheck.due_date?.split('T')[0]} onChange={e => setEditCheck({...editCheck, due_date: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Fecha Emisión</label>
                <input required type="date" value={editCheck.issue_date?.split('T')[0]} onChange={e => setEditCheck({...editCheck, issue_date: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Estado del Cheque</label>
                <select value={editCheck.status} onChange={e => setEditCheck({...editCheck, status: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]">
                  <option value="IN_PORTFOLIO">En Cartera</option>
                  <option value="DELIVERED">Entregado</option>
                  <option value="DEPOSITED">Depositado</option>
                  <option value="REJECTED">Rechazado</option>
                </select>
              </div>
              <div className="md:col-span-2 flex justify-end space-x-3 mt-2">
                <button type="button" onClick={() => setEditCheck(null)} className="px-4 py-2 text-[#aab6c7] hover:text-white transition-colors">Cancelar</button>
                <button type="submit" disabled={saving} className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-6 py-2 rounded-lg font-bold transition-all shadow-md shadow-[#0ea5e9]/20 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID Confirmation Modal */}
      {voidCheckItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#1a2333] p-8 rounded-2xl border border-red-500/30 w-full max-w-sm shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
              <span className="text-red-400 text-3xl font-bold">!</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">¿Anular Cheque?</h2>
            <p className="text-[#aab6c7] text-sm mb-2">
              Estás a punto de anular el cheque <strong className="text-white">#{voidCheckItem.check_number}</strong> del banco <strong className="text-white">{voidCheckItem.bank_name}</strong>.
            </p>
            <p className="text-[#64748b] text-xs mb-8">El estado pasará a <span className="text-red-400 font-bold">Rechazado</span>. Esta acción puede revertirse editándolo.</p>
            <div className="flex flex-col space-y-3">
              <button onClick={handleVoid} disabled={saving} className="w-full bg-red-500/80 hover:bg-red-500 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50">
                {saving ? 'Anulando...' : 'Sí, anular cheque'}
              </button>
              <button onClick={() => setVoidCheckItem(null)} className="w-full bg-[#2c394a]/50 hover:bg-[#2c394a] text-[#aab6c7] hover:text-white py-2.5 rounded-lg font-medium transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
