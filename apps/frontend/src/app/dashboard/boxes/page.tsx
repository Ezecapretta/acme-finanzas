'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { AccountCurrency, AccountType } from '@acme/shared';

interface Box {
  id: string;
  name: string;
  is_active: boolean;
  client?: { id: string, name: string };
  balances: {
    ARS: number;
    USD: number;
  };
}

export default function BoxesPage() {
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [newBox, setNewBox] = useState({ name: '', client_id: '' });

  // Opening balance state
  const emptyOB = () => ({ arsAmount: '', usdAmount: '' });
  const [boxOpeningBalance, setBoxOpeningBalance] = useState(emptyOB());

  // Edit & Delete states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editBox, setEditBox] = useState<Box | null>(null);
  const [deleteBoxConfirm, setDeleteBoxConfirm] = useState<{id: string, name: string} | null>(null);

  const loadBoxes = async () => {
    try {
      const data = await fetchApi('/boxes');
      setBoxes(data.boxes);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoxes();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await fetchApi('/boxes', {
        method: 'POST',
        body: JSON.stringify(newBox),
      });
      const ob = boxOpeningBalance;
      const boxBalances: any[] = [];
      if (Number(ob.arsAmount) > 0) boxBalances.push({ currency: 'ARS', amount: Number(ob.arsAmount) });
      if (Number(ob.usdAmount) > 0) boxBalances.push({ currency: 'USD', amount: Number(ob.usdAmount) });
      if (boxBalances.length > 0) {
        const userId = getUserId();
        await fetchApi('/transactions/opening-balance', {
          method: 'POST',
          body: JSON.stringify({ userId, boxId: created.id, boxBalances }),
        });
      }
      setShowModal(false);
      setNewBox({ name: '', client_id: '' });
      setBoxOpeningBalance(emptyOB());
      loadBoxes();
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBox) return;
    try {
      await fetchApi(`/boxes/${editBox.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: editBox.name }),
      });
      setShowEditModal(false);
      loadBoxes();
    } catch (err) {
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    if (!deleteBoxConfirm) return;
    try {
      await fetchApi(`/boxes/${deleteBoxConfirm.id}`, { method: 'DELETE' });
      setDeleteBoxConfirm(null);
      loadBoxes();
    } catch (err) {
      console.error(err);
      alert('Error eliminando caja');
    }
  };

  // ─── FILTER STATE ──────────────────────────────────────────────────
  const [boxSearch, setBoxSearch] = useState('');
  const [boxType, setBoxType] = useState<'all' | 'agency' | 'client'>('all');

  const filteredBoxes = boxes.filter(b => {
    const q = boxSearch.toLowerCase();
    if (q && !b.name.toLowerCase().includes(q) && !b.client?.name.toLowerCase().includes(q)) return false;
    if (boxType === 'agency' && b.client) return false;
    if (boxType === 'client' && !b.client) return false;
    return true;
  });

  return (
    <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500 pb-8">
      <header className="mb-6 flex justify-between items-center glass-panel rounded-2xl p-6">
        <div>
          <h1 className="text-3xl font-bold text-[#f8fafc] mb-2 tracking-tight">Tesorería y Cajas</h1>
          <p className="text-[#94a3b8]">Listado de fondos disponibles con saldo proyectado ACID.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-[#0ea5e9]/20 hover:shadow-[#0ea5e9]/30 hover:-translate-y-0.5"
        >
          + Crear Caja/Banco
        </button>
      </header>

      {/* FILTER BAR */}
      <div className="glass-panel rounded-2xl border border-[#334155]/50 px-4 py-3 mb-6 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] text-sm">🔍</span>
          <input type="text" value={boxSearch} onChange={e => setBoxSearch(e.target.value)}
            placeholder="Buscar por nombre o cliente..."
            className="w-full bg-[#081329] border border-[#2c394a] rounded-lg pl-9 pr-4 py-2.5 text-sm text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] transition-colors placeholder:text-[#334155]" />
        </div>
        <div className="flex rounded-lg overflow-hidden border border-[#2c394a]">
          {(['all', 'agency', 'client'] as const).map(t => (
            <button key={t} onClick={() => setBoxType(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${boxType === t ? 'bg-[#0ea5e9] text-white' : 'bg-[#081329] text-[#64748b] hover:text-[#d1dded]'}`}>
              {t === 'all' ? 'Todas' : t === 'agency' ? 'Propias' : 'De Clientes'}
            </button>
          ))}
        </div>
        <span className="text-xs text-[#64748b] border-l border-[#334155] pl-3 whitespace-nowrap">
          <span className="text-[#d1dded] font-bold">{filteredBoxes.length}</span> / {boxes.length} cajas
        </span>
        {(boxSearch || boxType !== 'all') && (
          <button onClick={() => { setBoxSearch(''); setBoxType('all'); }} className="text-xs text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors">✕ Limpiar</button>
        )}
      </div>

      {/* Balance Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {loading ? (
          <p className="text-[#64748b] col-span-3 text-center py-10">Cargando saldos...</p>
        ) : filteredBoxes.length === 0 ? (
          <p className="text-[#64748b] col-span-3 text-center py-10">⚠ Sin resultados para los filtros actuales.</p>
        ) : filteredBoxes.map(box => (
          <div key={box.id} className="glass-panel hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(14,165,233,0.15)] transition-all duration-300 p-6 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl transition-all duration-500 bg-[#0ea5e9]/10 group-hover:bg-[#0ea5e9]/20"></div>
            
            <div className="flex justify-between items-start mb-4 relative z-10">
              <h3 className="text-[#aab6c7] text-lg font-medium">{box.name}</h3>
              {box.client && <span className="bg-[#0ea5e9]/10 text-[#38bdf8] px-2 py-0.5 rounded text-xs font-semibold border border-[#0ea5e9]/20">Ref: {box.client.name}</span>}
            </div>
            
            <div className="relative z-10">
              <p className="text-[#64748b] text-xs font-bold uppercase tracking-wider mb-1">Pesos Físicos</p>
              <p className="text-[#f8fafc] text-2xl tracking-tight mb-3 font-bold">$ {Number(box.balances?.ARS || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>

              <p className="text-[#64748b] text-xs font-bold uppercase tracking-wider mb-1">Dólar Físico (USD)</p>
              <p className="text-[#0ea5e9] text-xl tracking-tight mb-2 font-bold">U$S {Number(box.balances?.USD || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>
            
            <div className="mt-6 flex justify-end items-center relative z-10 border-t border-[#2c394a] pt-4">
               <div>
                  <button onClick={() => { setEditBox(box); setShowEditModal(true); }} className="text-sm text-[#7e8b9d] hover:text-[#d1dded] transition-colors mr-3">Editar</button>
                  <button onClick={() => setDeleteBoxConfirm({id: box.id, name: box.name})} className="text-sm text-red-500/70 hover:text-red-400 transition-colors">Eliminar</button>
               </div>
            </div>
          </div>
        ))}
      </div>

      {/* Basic Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050B14]/80 backdrop-blur-md">
          <div className="glass-panel shadow-[0_0_40px_rgba(0,0,0,0.5)] border-t border-t-white/10 p-8 rounded-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold text-[#f8fafc] tracking-tight mb-6">Apertura de Caja/Banco</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Nombre</label>
                <input required value={newBox.name} onChange={e => setNewBox({...newBox, name: e.target.value})} placeholder="Ej: Cuenta Banco X" className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#677383]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">ID Cliente (Si aplica a un Ocupante/Ventanilla)</label>
                <input value={newBox.client_id} onChange={e => setNewBox({...newBox, client_id: e.target.value})} placeholder="UUID - Opcional" className="w-full bg-transparent border border-[#334155]/50 rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9]" />
              </div>

              {/* Opening balance */}
              <div className="border-t border-[#2c394a] pt-4">
                <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">Saldo Inicial (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-[#7e8b9d] mb-1">Pesos (ARS)</label>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={boxOpeningBalance.arsAmount}
                      onChange={e => setBoxOpeningBalance(ob => ({ ...ob, arsAmount: e.target.value }))}
                      className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] text-sm focus:outline-none focus:border-[#677383]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#7e8b9d] mb-1">Dólares (USD)</label>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={boxOpeningBalance.usdAmount}
                      onChange={e => setBoxOpeningBalance(ob => ({ ...ob, usdAmount: e.target.value }))}
                      className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] text-sm focus:outline-none focus:border-[#677383]"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => { setShowModal(false); setBoxOpeningBalance(emptyOB()); }} className="px-4 py-2 text-[#aab6c7] hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="bg-[#4d596b] hover:bg-[#677383] text-white px-6 py-2 rounded-lg font-medium transition-colors">Confirmar Apertura</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050B14]/80 backdrop-blur-md">
          <div className="glass-panel shadow-[0_0_40px_rgba(0,0,0,0.5)] border-t border-t-white/10 p-8 rounded-2xl w-full max-w-md">
            <h2 className="text-2xl font-bold text-[#f8fafc] tracking-tight mb-6">Editar Caja</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Nombre</label>
                <input required value={editBox.name} onChange={e => setEditBox({...editBox, name: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#677383]" />
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 text-[#aab6c7] hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="bg-[#4d596b] hover:bg-[#d1dded] hover:text-black text-white px-6 py-2 rounded-lg font-medium transition-colors">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirm Delete Modal */}
      {deleteBoxConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-[#1a2333] p-8 rounded-2xl border border-red-500/30 w-full max-w-sm shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
               <span className="text-red-400 text-3xl font-bold">!</span>
            </div>
            <h2 className="text-xl font-bold text-white mb-2">¿Eliminar Caja?</h2>
            <p className="text-[#aab6c7] text-sm mb-8">
              Estás a punto de ocultar la caja <strong>{deleteBoxConfirm.name}</strong>. Esta acción mantendrá el historial intacto pero evitará futuras transacciones.
            </p>
            <div className="flex flex-col space-y-3">
              <button onClick={confirmDelete} className="w-full bg-red-500/80 hover:bg-red-500 text-white py-2.5 rounded-lg font-medium transition-colors">Sí, eliminar caja</button>
              <button onClick={() => setDeleteBoxConfirm(null)} className="w-full bg-[#2c394a]/50 hover:bg-[#2c394a] text-[#aab6c7] hover:text-white py-2.5 rounded-lg font-medium transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
