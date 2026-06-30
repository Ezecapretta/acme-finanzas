'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { userLoginSchema } from '@acme/shared';
import { fetchApi } from '@/services/api';

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
    <div className="flex min-h-screen items-center justify-center bg-[#081329] text-[#d1dded]">
      <div className="glass-panel p-8 md:p-12 rounded-2xl w-full max-w-md shadow-2xl relative overflow-hidden">
        {/* Glow effect behind */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 bg-[#4d596b] rounded-full blur-[80px] opacity-40"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-32 h-32 bg-[#4d596b] rounded-full blur-[80px] opacity-40"></div>
        
        <div className="relative z-10 w-full">
          <h1 className="text-3xl font-bold mb-2 tracking-tight text-center text-[#d1dded]">
            Acme
          </h1>
          <p className="text-[#aab6c7] text-center mb-8 text-sm">Finanzas y Tesorería</p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-[#929fb1] mb-2">Email Empresarial</label>
              <input 
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#141f32]/80 border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:ring-2 focus:ring-[#677383]/50 focus:border-[#677383] transition-all"
                placeholder="admin@acme.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#929fb1] mb-2">Contraseña</label>
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#141f32]/80 border border-[#2c394a] rounded-lg px-4 py-3 text-[#d1dded] focus:outline-none focus:ring-2 focus:ring-[#677383]/50 focus:border-[#677383] transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-red-400 text-sm font-medium">{error}</p>}

            <button 
              type="submit" 
              className="w-full bg-[#4d596b] hover:bg-[#677383] text-white font-semibold py-3 px-4 rounded-lg transform transition-all active:scale-[0.98] shadow-lg shadow-[#141f32]/50 border border-[#7e8b9d]"
            >
              Iniciar Sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
