const API_BASE = 'https://api.epmarketingandresearch.com';
const TOKEN_KEY = 'ep_session_token';
const ACCOUNT_KEY = 'ep_account';

export interface Account {
  id: number;
  email: string;
  display_name: string;
  role: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getAccount(): Account | null {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Account;
  } catch {
    return null;
  }
}

export function saveSession(token: string, account: Account): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACCOUNT_KEY);
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export async function validateSession(): Promise<Account | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const resp = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      clearSession();
      return null;
    }
    const data = await resp.json();
    // Update cached account info
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(data.account));
    return data.account as Account;
  } catch {
    return null;
  }
}

export async function login(email: string, password: string): Promise<{ token: string; account: Account }> {
  const resp = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Login failed');
  saveSession(data.token, data.account);
  return data;
}

export async function signup(invite_token: string, email: string, password: string, display_name: string): Promise<{ token: string; account: Account }> {
  const resp = await fetch(`${API_BASE}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invite_token, email, password, display_name }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Signup failed');
  saveSession(data.token, data.account);
  return data;
}

export async function logout(): Promise<void> {
  const token = getToken();
  if (token) {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* ignore */ }
  }
  clearSession();
}

export async function validateInvite(token: string): Promise<{ valid: boolean; email?: string; role?: string; error?: string }> {
  const resp = await fetch(`${API_BASE}/api/auth/invite/validate?token=${encodeURIComponent(token)}`);
  return await resp.json();
}
