const AUTH_TOKEN_KEY = 'pxlite.authToken';

export function aiHelperAuthHeaders(): Record<string, string> {
  const storedToken = typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_TOKEN_KEY) : null;
  const token = storedToken || import.meta.env.VITE_DEV_AUTH_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
