'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { userLoginSchema } from '@acme/shared';
import { fetchApi } from '@/services/api';
import { inputClass } from '@/components/ui/forms';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      userLoginSchema.parse({ email, password });

      const res = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      localStorage.setItem('token', res.token);
      router.push('/dashboard');
    } catch (err: any) {
      if (err.errors) {
        setError(err.errors[0].message);
      } else {
        setError(err.message);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-4 text-ink">
      <div className="w-full max-w-md rounded-[14px] border border-line bg-surface p-8 shadow-sm md:p-12">
        <div className="mb-8 flex flex-col items-center">
          <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-[11px] bg-ink text-xl font-bold text-white">A</span>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">Acme Finanzas</h1>
          <p className="mt-1 text-sm text-subtle">Finanzas y Tesorería</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-muted">Email Empresarial</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              placeholder="admin@acme.com"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-muted">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm font-medium text-negative">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-[9px] bg-ink px-4 py-3 font-semibold text-white shadow-sm transition-all hover:opacity-85 active:scale-[0.99]"
          >
            Iniciar Sesión
          </button>
        </form>
      </div>
    </div>
  );
}
