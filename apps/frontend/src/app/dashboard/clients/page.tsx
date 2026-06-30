'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass } from '@/components/ui/forms';

interface Client {
  id: string;
  name: string;
  tax_id: string | null;
  email: string | null;
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', tax_id: '', email: '' });

  // Opening balance state
  const emptyOB = () => ({ arsAmount: '', arsDir: 'ACREEDOR', usdAmount: '', usdDir: 'ACREEDOR' });
  const [openingBalance, setOpeningBalance] = useState(emptyOB());

  const loadClients = async () => {
    try {
      const data = await fetchApi('/clients');
      setClients(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await fetchApi('/clients', {
        method: 'POST',
        body: JSON.stringify(newClient),
      });
      const ob = openingBalance;
      const clientBalances: any[] = [];
      if (Number(ob.arsAmount) > 0) clientBalances.push({ currency: 'ARS', amount: Number(ob.arsAmount), direction: ob.arsDir });
      if (Number(ob.usdAmount) > 0) clientBalances.push({ currency: 'USD', amount: Number(ob.usdAmount), direction: ob.usdDir });
      if (clientBalances.length > 0) {
        const userId = getUserId();
        await fetchApi('/transactions/opening-balance', {
          method: 'POST',
          body: JSON.stringify({ userId, clientId: created.id, clientBalances }),
        });
      }
      setShowModal(false);
      setNewClient({ name: '', tax_id: '', email: '' });
      setOpeningBalance(emptyOB());
      loadClients();
    } catch (err) {
      console.error(err);
    }
  };

  const [clientSearch, setClientSearch] = useState('');

  const filteredClients = clients.filter(c => {
    const q = clientSearch.toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.tax_id?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto h-full w-full max-w-[1400px] animate-in fade-in duration-500">
      <header className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Directorio de Clientes</h1>
          <p className="mt-1 text-[13.5px] text-muted">Administración de cuentas corrientes y entidades.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="whitespace-nowrap rounded-[9px] bg-ink px-5 py-2.5 font-bold text-white shadow-sm transition-all hover:opacity-85"
        >
          + Nuevo Cliente
        </button>
      </header>

      {/* SEARCH BAR */}
      <Card className="mb-4 flex flex-col items-stretch gap-3 px-4 py-3 sm:flex-row sm:items-center">
        <span className="flex-shrink-0 text-sm text-faint">🔍</span>
        <input
          type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email..."
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
        />
        {clientSearch && (
          <button onClick={() => setClientSearch('')} className="flex-shrink-0 whitespace-nowrap text-xs font-medium text-accent transition-colors hover:underline">✕</button>
        )}
        <span className="flex-shrink-0 border-l border-line pl-3 text-xs text-muted">
          <span className="font-bold text-ink">{filteredClients.length}</span> / {clients.length}
        </span>
      </Card>

      {/* Table */}
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-track">
              <th className="p-4 font-medium text-muted">Nombre / Razón Social</th>
              <th className="p-4 font-medium text-muted">Teléfono</th>
              <th className="p-4 font-medium text-muted">Email</th>
              <th className="p-4 text-right font-medium text-muted">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-4 text-center text-faint">Cargando clientes...</td></tr>
            ) : filteredClients.length === 0 ? (
              <tr><td colSpan={4} className="p-4 text-center text-faint">{clientSearch ? '⚠ Sin resultados.' : 'No hay clientes registrados.'}</td></tr>
            ) : (
              filteredClients.map(client => (
                <tr key={client.id} className="border-b border-line transition-colors hover:bg-row-hover">
                  <td className="p-4 font-medium text-ink">{client.name}</td>
                  <td className="p-4 text-muted">{client.tax_id || '-'}</td>
                  <td className="p-4 text-muted">{client.email || '-'}</td>
                  <td className="min-w-0 p-4 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button onClick={() => router.push(`/dashboard/clients/${client.id}`)} className="whitespace-nowrap rounded border border-line bg-surface px-3 py-1 text-sm font-medium text-ink transition-colors hover:bg-track">Ver Cajas</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {/* Basic Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[14px] border border-line bg-surface p-8 shadow-2xl">
            <h2 className="mb-6 text-2xl font-semibold text-ink">Nuevo Cliente</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-muted">Nombre</label>
                <input required value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Teléfono</label>
                <input value={newClient.tax_id} onChange={e => setNewClient({...newClient, tax_id: e.target.value})} className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-muted">Email</label>
                <input type="email" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} className={inputClass} />
              </div>

              {/* Opening balance */}
              <div className="border-t border-line pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Saldo Inicial (opcional)</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-8 text-xs text-faint">ARS</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={openingBalance.arsAmount}
                      onChange={e => setOpeningBalance(ob => ({ ...ob, arsAmount: e.target.value }))}
                      className={`${inputClass} flex-1 text-sm`}
                    />
                    <select
                      value={openingBalance.arsDir}
                      onChange={e => setOpeningBalance(ob => ({ ...ob, arsDir: e.target.value }))}
                      className={`${selectClass} w-auto px-2 text-sm`}
                    >
                      <option value="ACREEDOR">Acreedor</option>
                      <option value="DEUDOR">Deudor</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-8 text-xs text-faint">USD</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={openingBalance.usdAmount}
                      onChange={e => setOpeningBalance(ob => ({ ...ob, usdAmount: e.target.value }))}
                      className={`${inputClass} flex-1 text-sm`}
                    />
                    <select
                      value={openingBalance.usdDir}
                      onChange={e => setOpeningBalance(ob => ({ ...ob, usdDir: e.target.value }))}
                      className={`${selectClass} w-auto px-2 text-sm`}
                    >
                      <option value="ACREEDOR">Acreedor</option>
                      <option value="DEUDOR">Deudor</option>
                    </select>
                  </div>
                </div>
                <p className="mt-2 text-xs text-faint">Acreedor = le debemos al cliente · Deudor = el cliente nos debe</p>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button type="button" onClick={() => { setShowModal(false); setOpeningBalance(emptyOB()); }} className="px-4 py-2 text-muted transition-colors hover:text-ink">Cancelar</button>
                <button type="submit" className="rounded-lg bg-ink px-6 py-2 font-medium text-white transition-colors hover:opacity-85">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
