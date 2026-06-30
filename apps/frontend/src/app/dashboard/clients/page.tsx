'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/services/api';
import { getUserId } from '@/services/auth';

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
    <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500">
      <header className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#141f32]/40 backdrop-blur-md border border-[#2c394a] shadow-lg rounded-2xl p-6">
        <div>
          <h1 className="text-3xl font-bold text-[#d1dded] mb-2">Directorio de Clientes</h1>
          <p className="text-[#aab6c7]">Administración de cuentas corrientes y entidades.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-[#0ea5e9]/20 hover:shadow-[#0ea5e9]/30 hover:-translate-y-0.5 whitespace-nowrap"
        >
          + Nuevo Cliente
        </button>
      </header>

      {/* SEARCH BAR */}
      <div className="bg-[#141f32]/40 backdrop-blur-md border border-[#2c394a] rounded-2xl px-4 py-3 mb-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <span className="text-[#64748b] text-sm flex-shrink-0">🔍</span>
        <input
          type="text" value={clientSearch} onChange={e => setClientSearch(e.target.value)}
          placeholder="Buscar por nombre, teléfono o email..."
          className="flex-1 min-w-0 bg-transparent text-sm text-[#d1dded] focus:outline-none placeholder:text-[#334155]"
        />
        {clientSearch && (
          <button onClick={() => setClientSearch('')} className="text-xs text-[#0ea5e9] hover:text-[#38bdf8] font-medium transition-colors flex-shrink-0 whitespace-nowrap">✕</button>
        )}
        <span className="text-xs text-[#64748b] flex-shrink-0 border-l border-[#334155] pl-3">
          <span className="text-[#d1dded] font-bold">{filteredClients.length}</span> / {clients.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-[#141f32]/40 backdrop-blur-md border border-[#2c394a] shadow-lg rounded-2xl overflow-x-auto">
        <table className="w-full min-w-[720px] text-left border-collapse">
          <thead>
            <tr className="bg-[#081329]/50 border-b border-[#2c394a]">
              <th className="p-4 text-[#aab6c7] font-medium">Nombre / Razón Social</th>
              <th className="p-4 text-[#aab6c7] font-medium">Teléfono</th>
              <th className="p-4 text-[#aab6c7] font-medium">Email</th>
              <th className="p-4 text-[#aab6c7] font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-4 text-center text-[#7e8b9d]">Cargando clientes...</td></tr>
            ) : filteredClients.length === 0 ? (
              <tr><td colSpan={4} className="p-4 text-center text-[#7e8b9d]">{clientSearch ? '⚠ Sin resultados.' : 'No hay clientes registrados.'}</td></tr>
            ) : (
              filteredClients.map(client => (
                <tr key={client.id} className="border-b border-[#2c394a]/50 hover:bg-[#2c394a]/30 transition-colors">
                  <td className="p-4 text-[#d1dded] font-medium">{client.name}</td>
                  <td className="p-4 text-[#929fb1]">{client.tax_id || '-'}</td>
                  <td className="p-4 text-[#929fb1]">{client.email || '-'}</td>
                  <td className="p-4 text-right min-w-0">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button onClick={() => router.push(`/dashboard/clients/${client.id}`)} className="text-[#d1dded] font-medium transition-colors text-sm px-3 py-1 rounded bg-[#2c394a]/50 hover:bg-[#4d596b] border border-[#4d596b] whitespace-nowrap">Ver Cajas</button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Basic Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-[#141f32] p-8 rounded-2xl border border-[#2c394a] w-full max-w-md shadow-2xl">
            <h2 className="text-2xl font-bold text-[#d1dded] mb-6">Nuevo Cliente</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Nombre</label>
                <input required value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#677383]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Teléfono</label>
                <input value={newClient.tax_id} onChange={e => setNewClient({...newClient, tax_id: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#677383]" />
              </div>
              <div>
                <label className="block text-sm text-[#aab6c7] mb-1">Email</label>
                <input type="email" value={newClient.email} onChange={e => setNewClient({...newClient, email: e.target.value})} className="w-full bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] focus:outline-none focus:border-[#677383]" />
              </div>

              {/* Opening balance */}
              <div className="border-t border-[#2c394a] pt-4">
                <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">Saldo Inicial (opcional)</p>
                <div className="space-y-3">
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-[#7e8b9d] w-8">ARS</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={openingBalance.arsAmount}
                      onChange={e => setOpeningBalance(ob => ({ ...ob, arsAmount: e.target.value }))}
                      className="flex-1 bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] text-sm focus:outline-none focus:border-[#677383]"
                    />
                    <select
                      value={openingBalance.arsDir}
                      onChange={e => setOpeningBalance(ob => ({ ...ob, arsDir: e.target.value }))}
                      className="bg-[#081329] border border-[#2c394a] rounded px-2 py-2 text-[#d1dded] text-sm focus:outline-none focus:border-[#677383]"
                    >
                      <option value="ACREEDOR">Acreedor</option>
                      <option value="DEUDOR">Deudor</option>
                    </select>
                  </div>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs text-[#7e8b9d] w-8">USD</span>
                    <input
                      type="number" min="0" step="0.01" placeholder="0.00"
                      value={openingBalance.usdAmount}
                      onChange={e => setOpeningBalance(ob => ({ ...ob, usdAmount: e.target.value }))}
                      className="flex-1 bg-[#081329] border border-[#2c394a] rounded px-3 py-2 text-[#d1dded] text-sm focus:outline-none focus:border-[#677383]"
                    />
                    <select
                      value={openingBalance.usdDir}
                      onChange={e => setOpeningBalance(ob => ({ ...ob, usdDir: e.target.value }))}
                      className="bg-[#081329] border border-[#2c394a] rounded px-2 py-2 text-[#d1dded] text-sm focus:outline-none focus:border-[#677383]"
                    >
                      <option value="ACREEDOR">Acreedor</option>
                      <option value="DEUDOR">Deudor</option>
                    </select>
                  </div>
                </div>
                <p className="text-xs text-[#4d596b] mt-2">Acreedor = le debemos al cliente · Deudor = el cliente nos debe</p>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => { setShowModal(false); setOpeningBalance(emptyOB()); }} className="px-4 py-2 text-[#aab6c7] hover:text-white transition-colors">Cancelar</button>
                <button type="submit" className="bg-[#4d596b] hover:bg-[#677383] text-white px-6 py-2 rounded-lg font-medium transition-colors">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
