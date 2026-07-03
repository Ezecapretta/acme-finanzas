'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { AccountCurrency, AccountType } from '@acme/shared';
import { Card } from '@/components/ui/Card';
import { inputClass } from '@/components/ui/forms';

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
    <div className="mx-auto w-full max-w-[1400px] animate-in fade-in duration-500 pb-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Tesorería y Cajas</h1>
          <p className="mt-1 text-[13.5px] text-muted">Listado de fondos disponibles con saldo proyectado ACID.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="rounded-[9px] bg-ink px-5 py-2.5 font-bold text-white shadow-sm transition-all hover:opacity-85"
        >
          + Crear Caja/Banco
        </button>
      </header>

      {/* FILTER BAR */}
      <Card className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="relative min-w-[200px] flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-faint">🔍</span>
          <input type="text" value={boxSearch} onChange={e => setBoxSearch(e.target.value)}
            placeholder="Buscar por nombre o cliente..."
            className={`${inputClass} pl-9`} />
        </div>
        <div className="flex overflow-hidden rounded-lg border border-line">
          {(['all', 'agency', 'client'] as const).map(t => (
            <button key={t} onClick={() => setBoxType(t)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${boxType === t ? 'bg-ink text-white' : 'bg-surface text-muted hover:text-ink'}`}>
              {t === 'all' ? 'Todas' : t === 'agency' ? 'Propias' : 'De Clientes'}
            </button>
          ))}
        </div>
        <span className="whitespace-nowrap border-l border-line pl-3 text-xs text-muted">
          <span className="font-bold text-ink">{filteredBoxes.length}</span> / {boxes.length} cajas
        </span>
        {(boxSearch || boxType !== 'all') && (
          <button onClick={() => { setBoxSearch(''); setBoxType('all'); }} className="text-xs font-medium text-accent transition-colors hover:underline">✕ Limpiar</button>
        )}
      </Card>

      {/* Balance Grids */}
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="col-span-3 py-10 text-center text-faint">Cargando saldos...</p>
        ) : filteredBoxes.length === 0 ? (
          <p className="col-span-3 py-10 text-center text-faint">⚠ Sin resultados para los filtros actuales.</p>
        ) : filteredBoxes.map(box => (
          <Card key={box.id} hover className="p-6">
            <div className="mb-4 flex items-start justify-between">
              <h3 className="text-lg font-medium text-ink">{box.name}</h3>
              {box.client && <span className="rounded border border-accent/20 bg-accent-bg px-2 py-0.5 text-xs font-semibold text-accent">Ref: {box.client.name}</span>}
            </div>

            <div>
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-faint">Pesos Físicos</p>
              <p className="mb-3 text-2xl font-bold tracking-tight text-ink">$ {Number(box.balances?.ARS || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>

              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-faint">Dólar Físico (USD)</p>
              <p className="mb-2 text-xl font-bold tracking-tight text-accent">U$S {Number(box.balances?.USD || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            </div>

            <div className="mt-6 flex items-center justify-end border-t border-line pt-4">
               <div>
                  <button onClick={() => { setEditBox(box); setShowEditModal(true); }} className="mr-3 text-sm text-muted transition-colors hover:text-ink">Editar</button>
                  <button onClick={() => setDeleteBoxConfirm({id: box.id, name: box.name})} className="text-sm text-negative/80 transition-colors hover:text-negative">Eliminar</button>
               </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Basic Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[14px] border border-line bg-surface p-8 shadow-2xl">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Apertura de Caja/Banco</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted">Nombre</label>
                <input required value={newBox.name} onChange={e => setNewBox({...newBox, name: e.target.value})} placeholder="Ej: Cuenta Banco X" className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">ID Cliente (Si aplica a un Ocupante/Ventanilla)</label>
                <input value={newBox.client_id} onChange={e => setNewBox({...newBox, client_id: e.target.value})} placeholder="UUID - Opcional" className={inputClass} />
              </div>

              {/* Opening balance */}
              <div className="border-t border-line pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Saldo Inicial (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-faint">Pesos (ARS)</label>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={boxOpeningBalance.arsAmount}
                      onChange={e => setBoxOpeningBalance(ob => ({ ...ob, arsAmount: e.target.value }))}
                      className={`${inputClass} text-sm`}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-faint">Dólares (USD)</label>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={boxOpeningBalance.usdAmount}
                      onChange={e => setBoxOpeningBalance(ob => ({ ...ob, usdAmount: e.target.value }))}
                      className={`${inputClass} text-sm`}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button type="button" onClick={() => { setShowModal(false); setBoxOpeningBalance(emptyOB()); }} className="px-4 py-2 text-muted transition-colors hover:text-ink">Cancelar</button>
                <button type="submit" className="rounded-lg bg-ink px-6 py-2 font-medium text-white transition-colors hover:opacity-85">Confirmar Apertura</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[14px] border border-line bg-surface p-8 shadow-2xl">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Editar Caja</h2>
            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted">Nombre</label>
                <input required value={editBox.name} onChange={e => setEditBox({...editBox, name: e.target.value})} className={inputClass} />
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 text-muted transition-colors hover:text-ink">Cancelar</button>
                <button type="submit" className="rounded-lg bg-ink px-6 py-2 font-medium text-white transition-colors hover:opacity-85">Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Confirm Delete Modal */}
      {deleteBoxConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-[14px] border border-negative/30 bg-surface p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-negative/20 bg-negative-bg">
               <span className="text-3xl font-bold text-negative">!</span>
            </div>
            <h2 className="mb-2 text-xl font-bold text-ink">¿Eliminar Caja?</h2>
            <p className="mb-8 text-sm text-muted">
              Estás a punto de ocultar la caja <strong className="text-ink">{deleteBoxConfirm.name}</strong>. Esta acción mantendrá el historial intacto pero evitará futuras transacciones.
            </p>
            <div className="flex flex-col space-y-3">
              <button onClick={confirmDelete} className="w-full rounded-lg bg-negative py-2.5 font-medium text-white transition-colors hover:opacity-90">Sí, eliminar caja</button>
              <button onClick={() => setDeleteBoxConfirm(null)} className="w-full rounded-lg bg-track py-2.5 font-medium text-muted transition-colors hover:text-ink">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
