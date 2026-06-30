const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const fetchApi = async (endpoint: string, options: RequestInit = {}) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
      throw new Error('Sesión expirada');
    }
    const err = await response.json().catch(() => ({}));
    const error: any = new Error(err.error || 'API Request Failed');
    // Attach overdraft data so callers can show a confirmation modal
    if (response.status === 409 && err.requiresConfirmation) {
      error.requiresConfirmation = true;
      error.overdrafts = err.overdrafts;
    }
    throw error;
  }
  return response.json();
};
