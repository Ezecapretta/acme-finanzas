'use client';
import { useState, useEffect } from 'react';
import { fetchApi } from '@/services/api';
import { getRole } from '@/services/auth';
import toast from 'react-hot-toast';
import { Card } from '@/components/ui/Card';
import { inputClass, selectClass } from '@/components/ui/forms';

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
    <div className="mx-auto h-full w-full max-w-[1400px] animate-in fade-in duration-500">
      <header className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-[26px] font-semibold tracking-[-0.025em] text-ink">Usuarios y Operadores</h1>
          <p className="mt-1 text-[13.5px] text-muted">Gestión de accesos, roles y credenciales del sistema.</p>
        </div>
        <button
          onClick={openCreate}
          disabled={!isAdmin}
          className={`whitespace-nowrap rounded-[9px] bg-ink px-6 py-3 font-bold text-white shadow-sm transition-all hover:opacity-85 ${!isAdmin ? 'cursor-not-allowed opacity-40' : ''}`}
        >
          + Nuevo Usuario
        </button>
      </header>

      {/* USER TABLE */}
      <Card className="mb-8 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-track text-xs uppercase tracking-wider text-muted">
              <th className="p-4 font-semibold">Nombre</th>
              <th className="p-4 font-semibold">Email</th>
              <th className="p-4 font-semibold">Rol</th>
              <th className="p-4 font-semibold">Estado</th>
              <th className="p-4 font-semibold">Alta</th>
              <th className="p-4 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="animate-pulse p-8 text-center font-bold text-accent">Cargando usuarios...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-faint">No hay usuarios registrados.</td></tr>
            ) : users.map((u, idx) => (
              <tr key={u.id} className={`border-b border-line transition-colors hover:bg-row-hover ${idx % 2 === 0 ? 'bg-transparent' : 'bg-canvas'}`}>
                <td className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-ink">{u.name}</span>
                  </div>
                </td>
                <td className="p-4 font-mono text-sm text-muted">{u.email}</td>
                <td className="p-4">
                  {u.role === 'ADMIN'
                    ? <span className="rounded bg-warn-bg px-2 py-1 text-xs font-bold text-warn">ADMIN</span>
                    : <span className="rounded bg-accent-bg px-2 py-1 text-xs font-bold text-accent">OPERADOR</span>
                  }
                </td>
                <td className="p-4">
                  <span className={`rounded px-2 py-1 text-xs font-bold ${u.is_active ? 'bg-positive-bg text-positive' : 'bg-negative-bg text-negative'}`}>
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="p-4 text-sm text-faint">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="min-w-0 p-4 text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    {isAdmin && (
                      <button onClick={() => openEdit(u)} className="whitespace-nowrap rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:bg-track hover:text-ink">
                        Editar
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => openResetModal(u)}
                        className="whitespace-nowrap rounded-lg border border-warn/20 bg-warn-bg px-3 py-1.5 text-sm font-medium text-warn transition-colors hover:opacity-80"
                      >
                        Resetear Clave
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`whitespace-nowrap rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:opacity-80 ${u.is_active ? 'border-negative/20 bg-negative-bg text-negative' : 'border-positive/20 bg-positive-bg text-positive'}`}
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
      </Card>

      {/* MODAL FORM */}
      {formMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-[14px] border border-line bg-surface p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="mb-6 text-2xl font-semibold text-ink">
              {formMode === 'create' ? '+ Crear Nuevo Usuario' : '✏️ Editar Usuario'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-muted">Nombre Completo</label>
                <input
                  required type="text"
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  placeholder="Ej: Maria González"
                  className={inputClass}
                />
              </div>

              {formMode === 'create' && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-muted">Email / Usuario</label>
                  <input
                    required type="email"
                    value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}
                    placeholder="operador@acme.com"
                    className={inputClass}
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-muted">
                  {formMode === 'create' ? 'Contraseña' : 'Nueva Contraseña (dejar en blanco para no cambiar)'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                  placeholder="••••••••"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-muted">Rol del Sistema</label>
                <select
                  value={form.role}
                  onChange={e => setForm({...form, role: e.target.value})}
                  className={`${selectClass} font-bold`}
                >
                  <option value="OPERATOR">Operador — Acceso Estándar</option>
                  <option value="ADMIN">Administrador — Acceso Completo</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={closeForm} className="px-5 py-2.5 font-medium text-muted transition-colors hover:text-ink">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`rounded-xl px-6 py-2.5 font-bold text-white shadow-sm transition-all ${saving ? 'cursor-not-allowed bg-faint opacity-60' : 'bg-ink hover:opacity-85'}`}
                >
                  {saving ? 'Guardando...' : formMode === 'create' ? 'Crear Usuario' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET PASSWORD — PREP MODAL */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-[14px] border border-warn/30 bg-surface p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-2xl">🔑</span>
              <h2 className="text-xl font-bold text-ink">Resetear Contraseña</h2>
            </div>
            <p className="mb-6 text-sm text-muted">
              Elegí la nueva clave para <span className="font-medium text-ink">{resetTarget.name}</span>. Podés editarla o usar la generada automáticamente.
            </p>
            <div className="mb-2">
              <label className="mb-1 block text-sm font-medium text-muted">Nueva contraseña</label>
              <input
                type="text"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                className="w-full rounded-lg border border-warn/40 bg-warn-bg px-4 py-3 font-mono text-base font-bold tracking-widest text-warn transition-colors focus:border-warn focus:outline-none"
              />
            </div>
            <button
              onClick={() => setResetPassword(generatePassword())}
              className="mb-6 text-xs text-faint underline underline-offset-2 transition-colors hover:text-muted"
            >
              Generar nueva aleatoria
            </button>
            <div className="mt-2 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="px-5 py-2.5 font-medium text-muted transition-colors hover:text-ink"
              >
                Cancelar
              </button>
              <button
                onClick={confirmReset}
                disabled={resetSaving || !resetPassword.trim()}
                className={`rounded-xl px-6 py-2.5 font-bold text-white shadow-sm transition-all ${
                  resetSaving || !resetPassword.trim()
                    ? 'cursor-not-allowed bg-faint opacity-60'
                    : 'bg-warn hover:opacity-90'
                }`}
              >
                {resetSaving ? 'Guardando...' : 'Confirmar Cambio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET PASSWORD — DONE MODAL */}
      {resetDoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-[14px] border border-positive/30 bg-surface p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <h2 className="text-xl font-bold text-ink">Contraseña Actualizada</h2>
            </div>
            <p className="mb-6 text-sm text-muted">
              La contraseña de <span className="font-medium text-ink">{resetDoneModal.user.name}</span> fue cambiada. Compartí esta clave:
            </p>
            <div className="mb-6 flex items-center gap-2 rounded-xl border border-positive/30 bg-positive-bg px-4 py-3">
              <span className="flex-1 select-all font-mono text-lg font-bold tracking-widest text-positive">
                {resetDoneModal.password}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(resetDoneModal.password);
                  setCopied(true);
                }}
                className="whitespace-nowrap rounded-lg border border-positive/30 bg-positive-bg px-3 py-1 text-xs font-bold text-positive transition-colors hover:opacity-80"
              >
                {copied ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
            <p className="mb-6 text-xs text-faint">El usuario podrá ingresar con esta clave a partir de ahora.</p>
            <button
              onClick={() => setResetDoneModal(null)}
              className="w-full rounded-xl bg-ink py-2.5 font-bold text-white shadow-sm transition-all hover:opacity-85"
            >
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
