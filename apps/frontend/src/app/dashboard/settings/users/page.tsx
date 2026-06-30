'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getRole } from '@/services/auth';
import toast from 'react-hot-toast';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OPERATOR';
  is_active: boolean;
  created_at: string;
}

type FormMode = 'create' | 'edit' | null;

interface ResetDoneModal {
  user: User;
  password: string;
}

const generatePassword = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

export default function UsersSettingsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin] = useState(() => getRole() === 'ADMIN');
  const [formMode, setFormMode] = useState<FormMode>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetSaving, setResetSaving] = useState(false);
  const [resetDoneModal, setResetDoneModal] = useState<ResetDoneModal | null>(null);
  const [copied, setCopied] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'OPERATOR'
  });

  const loadUsers = () => {
    setLoading(true);
    fetchApi('/auth/users')
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadUsers(); }, []);

  const openCreate = () => {
    setForm({ name: '', email: '', password: '', role: 'OPERATOR' });
    setSelectedUser(null);
    setFormMode('create');
  };

  const openEdit = (user: User) => {
    setForm({ name: user.name, email: user.email, password: '', role: user.role });
    setSelectedUser(user);
    setFormMode('edit');
  };

  const closeForm = () => { setFormMode(null); setSelectedUser(null); };

  const openResetModal = (user: User) => {
    setResetTarget(user);
    setResetPassword(generatePassword());
  };

  const confirmReset = async () => {
    if (!resetTarget || !resetPassword.trim()) return;
    setResetSaving(true);
    try {
      await fetchApi(`/auth/users/${resetTarget.id}`, { method: 'PUT', body: JSON.stringify({ password: resetPassword.trim() }) });
      setResetDoneModal({ user: resetTarget, password: resetPassword.trim() });
      setResetTarget(null);
      setCopied(false);
    } catch (error: any) {
      toast.error(error.message || 'Error reseteando contraseña.');
    } finally {
      setResetSaving(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (formMode === 'create') {
        if (!form.password) { toast.error("La contraseña es obligatoria."); setSaving(false); return; }
        await fetchApi('/auth/users', { method: 'POST', body: JSON.stringify(form) });
        toast.success(`Usuario "${form.name}" creado exitosamente.`);
      } else if (formMode === 'edit' && selectedUser) {
        const payload: any = { name: form.name, role: form.role };
        if (form.password) payload.password = form.password;
        await fetchApi(`/auth/users/${selectedUser.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        toast.success(`Usuario "${form.name}" actualizado.`);
      }
      closeForm();
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Error guardando usuario.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await fetchApi(`/auth/users/${user.id}/toggle-status`, { method: 'PUT' });
      toast.success(`${user.name} ${user.is_active ? 'desactivado' : 'activado'}.`);
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || 'Error cambiando estado.');
    }
  };

  return (
    <div className="w-full h-full animate-in fade-in zoom-in-95 duration-500 max-w-6xl mx-auto">
      <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#f8fafc] mb-2 tracking-tight">Usuarios y Operadores</h1>
          <p className="text-[#94a3b8]">Gestión de accesos, roles y credenciales del sistema.</p>
        </div>
        <button
          onClick={openCreate}
          disabled={!isAdmin}
          className={`px-6 py-3 bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] text-white rounded-xl font-bold transition-all shadow-lg shadow-[#0ea5e9]/20 hover:shadow-[#0ea5e9]/40 hover:-translate-y-0.5 whitespace-nowrap ${!isAdmin ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          + Nuevo Usuario
        </button>
      </header>

      {/* USER TABLE */}
      <div className="glass-panel rounded-2xl overflow-x-auto border border-[#334155]/50 shadow-xl mb-8">
        <table className="w-full min-w-[760px] text-left border-collapse">
          <thead>
            <tr className="border-b border-[#334155]/50 bg-[#0a1324]/50 text-[#94a3b8] text-xs uppercase tracking-wider">
              <th className="p-4 font-semibold">Nombre</th>
              <th className="p-4 font-semibold">Email</th>
              <th className="p-4 font-semibold">Rol</th>
              <th className="p-4 font-semibold">Estado</th>
              <th className="p-4 font-semibold">Alta</th>
              <th className="p-4 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-[#0ea5e9] animate-pulse font-bold">Cargando usuarios...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-[#64748b]">No hay usuarios registrados.</td></tr>
            ) : users.map((u, idx) => (
              <tr key={u.id} className={`border-b border-[#334155]/30 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-transparent' : 'bg-[#0a1324]/30'}`}>
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#0ea5e9] to-[#38bdf8] flex items-center justify-center text-white font-bold text-sm shadow-md shadow-[#0ea5e9]/20">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-[#f8fafc]">{u.name}</span>
                  </div>
                </td>
                <td className="p-4 text-[#94a3b8] font-mono text-sm">{u.email}</td>
                <td className="p-4">
                  {u.role === 'ADMIN'
                    ? <span className="px-2 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded text-xs font-bold">ADMIN</span>
                    : <span className="px-2 py-1 bg-[#0ea5e9]/10 text-[#0ea5e9] border border-[#0ea5e9]/20 rounded text-xs font-bold">OPERADOR</span>
                  }
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${u.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="p-4 text-[#64748b] text-sm">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="p-4 text-right min-w-0">
                  <div className="flex flex-wrap justify-end gap-2">
                    {isAdmin && (
                      <button onClick={() => openEdit(u)} className="px-3 py-1.5 bg-[#141f32] hover:bg-[#1e2f47] text-[#aab6c7] hover:text-white border border-[#334155]/60 rounded-lg text-sm transition-colors whitespace-nowrap">
                        Editar
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => openResetModal(u)}
                        className="px-3 py-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                      >
                        Resetear Clave
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors whitespace-nowrap ${u.is_active ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'}`}
                      >
                        {u.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL FORM */}
      {formMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-md rounded-2xl p-8 shadow-2xl border border-[#334155]/70 relative overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[80px] bg-[#0ea5e9]/10 pointer-events-none"></div>
            
            <div className="relative z-10">
              <h2 className="text-2xl font-bold text-[#f8fafc] mb-6">
                {formMode === 'create' ? '+ Crear Nuevo Usuario' : '✏️ Editar Usuario'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Nombre Completo</label>
                  <input
                    required type="text"
                    value={form.name}
                    onChange={e => setForm({...form, name: e.target.value})}
                    placeholder="Ej: Maria González"
                    className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] transition-colors"
                  />
                </div>

                {formMode === 'create' && (
                  <div>
                    <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Email / Usuario</label>
                    <input
                      required type="email"
                      value={form.email}
                      onChange={e => setForm({...form, email: e.target.value})}
                      placeholder="operador@acme.com"
                      className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] transition-colors"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-[#aab6c7] mb-1 font-medium">
                    {formMode === 'create' ? 'Contraseña' : 'Nueva Contraseña (dejar en blanco para no cambiar)'}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => setForm({...form, password: e.target.value})}
                    placeholder="••••••••"
                    className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Rol del Sistema</label>
                  <select
                    value={form.role}
                    onChange={e => setForm({...form, role: e.target.value})}
                    className="w-full bg-[#081329] border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:border-[#0ea5e9] font-bold"
                  >
                    <option value="OPERATOR">Operador — Acceso Estándar</option>
                    <option value="ADMIN">Administrador — Acceso Completo</option>
                  </select>
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button type="button" onClick={closeForm} className="px-5 py-2.5 text-[#aab6c7] hover:text-white transition-colors font-medium">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className={`px-6 py-2.5 rounded-xl font-bold text-white transition-all shadow-lg ${saving ? 'opacity-50 cursor-not-allowed bg-gray-500' : 'bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] hover:scale-105 hover:shadow-[0_0_20px_rgba(14,165,233,0.4)]'}`}
                  >
                    {saving ? 'Guardando...' : formMode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* RESET PASSWORD — PREP MODAL */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-8 shadow-2xl border border-amber-500/30 relative animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-[60px] bg-amber-500/10 pointer-events-none"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">🔑</span>
                <h2 className="text-xl font-bold text-[#f8fafc]">Resetear Contraseña</h2>
              </div>
              <p className="text-[#94a3b8] text-sm mb-6">
                Elegí la nueva clave para <span className="text-[#f8fafc] font-medium">{resetTarget.name}</span>. Podés editarla o usar la generada automáticamente.
              </p>
              <div className="mb-2">
                <label className="block text-sm text-[#aab6c7] mb-1 font-medium">Nueva contraseña</label>
                <input
                  type="text"
                  value={resetPassword}
                  onChange={e => setResetPassword(e.target.value)}
                  className="w-full bg-[#081329] border border-amber-500/30 rounded-lg px-4 py-3 text-amber-300 font-mono font-bold text-base focus:outline-none focus:border-amber-400 transition-colors tracking-widest"
                />
              </div>
              <button
                onClick={() => setResetPassword(generatePassword())}
                className="text-xs text-[#64748b] hover:text-[#94a3b8] transition-colors mb-6 underline underline-offset-2"
              >
                Generar nueva aleatoria
              </button>
              <div className="flex justify-end gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-5 py-2.5 text-[#aab6c7] hover:text-white transition-colors font-medium"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmReset}
                  disabled={resetSaving || !resetPassword.trim()}
                  className={`px-6 py-2.5 rounded-xl font-bold text-white transition-all shadow-lg ${
                    resetSaving || !resetPassword.trim()
                      ? 'opacity-50 cursor-not-allowed bg-gray-500'
                      : 'bg-gradient-to-r from-amber-500 to-amber-400 hover:scale-105 hover:shadow-[0_0_20px_rgba(245,158,11,0.4)]'
                  }`}
                >
                  {resetSaving ? 'Guardando...' : 'Confirmar Cambio'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RESET PASSWORD — DONE MODAL */}
      {resetDoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-sm rounded-2xl p-8 shadow-2xl border border-emerald-500/30 relative animate-in zoom-in-95 duration-300">
            <div className="absolute top-0 right-0 w-48 h-48 rounded-full blur-[60px] bg-emerald-500/10 pointer-events-none"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">✅</span>
                <h2 className="text-xl font-bold text-[#f8fafc]">Contraseña Actualizada</h2>
              </div>
              <p className="text-[#94a3b8] text-sm mb-6">
                La contraseña de <span className="text-[#f8fafc] font-medium">{resetDoneModal.user.name}</span> fue cambiada. Compartí esta clave:
              </p>
              <div className="flex items-center gap-2 bg-[#081329] border border-emerald-500/30 rounded-xl px-4 py-3 mb-6">
                <span className="font-mono text-emerald-300 text-lg font-bold flex-1 tracking-widest select-all">
                  {resetDoneModal.password}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(resetDoneModal.password);
                    setCopied(true);
                  }}
                  className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold hover:bg-emerald-500/30 transition-colors whitespace-nowrap"
                >
                  {copied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="text-[#64748b] text-xs mb-6">El usuario podrá ingresar con esta clave a partir de ahora.</p>
              <button
                onClick={() => setResetDoneModal(null)}
                className="w-full py-2.5 rounded-xl font-bold text-white bg-gradient-to-r from-[#0ea5e9] to-[#38bdf8] hover:scale-105 transition-all shadow-lg"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
