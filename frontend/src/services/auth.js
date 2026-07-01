/**
 * STAP Phase 5 — Authentication Service (Frontend)
 * 
 * Handles JWT token management, login, register, and auto-refresh.
 */

import { CONFIG } from '../config';

const AUTH_API = `${CONFIG.STAP_API}/auth`;
const TOKEN_KEY = 'tradeiq-access-token';
const REFRESH_KEY = 'tradeiq-refresh-token';
const USER_KEY = 'tradeiq-user';

// ─── Token Storage ───────────────────────────────────────────────────────────

export function getAccessToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setTokens(accessToken, refreshToken, user) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}


// ─── Auth Headers ────────────────────────────────────────────────────────────

export function authHeaders() {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

/**
 * Fetch wrapper that auto-attaches auth headers.
 */
export async function authFetch(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });

  // If 401, try refresh
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      // Retry with new token
      const retryHeaders = {
        'Content-Type': 'application/json',
        ...authHeaders(),
        ...(options.headers || {}),
      };
      return fetch(url, { ...options, headers: retryHeaders });
    }
    // Refresh failed — clear auth
    clearAuth();
    window.dispatchEvent(new Event('auth-logout'));
  }

  return response;
}


// ─── Register ────────────────────────────────────────────────────────────────

export async function register(email, password, name) {
  const res = await fetch(`${AUTH_API}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, name }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Registration failed');
  }

  const data = await res.json();
  setTokens(data.access_token, data.refresh_token, data.user);
  return data.user;
}


// ─── Login ───────────────────────────────────────────────────────────────────

export async function login(email, password) {
  // OAuth2 requires form-encoded body with 'username' field
  const formData = new URLSearchParams();
  formData.append('username', email);
  formData.append('password', password);

  const res = await fetch(`${AUTH_API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Login failed');
  }

  const data = await res.json();
  setTokens(data.access_token, data.refresh_token, data.user);
  return data.user;
}


// ─── Refresh Token ───────────────────────────────────────────────────────────

export async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const res = await fetch(`${AUTH_API}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) return false;

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.access_token);
    return true;
  } catch {
    return false;
  }
}


// ─── Get Current User ────────────────────────────────────────────────────────

export async function fetchCurrentUser() {
  const token = getAccessToken();
  if (!token) return null;

  const res = await fetch(`${AUTH_API}/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  return res.json();
}


// ─── Logout ──────────────────────────────────────────────────────────────────

export function logout() {
  clearAuth();
  window.dispatchEvent(new Event('auth-logout'));
}


// ─── Subscription ────────────────────────────────────────────────────────────

export async function getSubscription() {
  const res = await authFetch(`${AUTH_API}/subscription`);
  if (!res.ok) return null;
  return res.json();
}

export async function checkout(planId) {
  const res = await authFetch(`${CONFIG.STAP_API}/billing/checkout`, {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Checkout failed');
  }

  return res.json();
}

export async function cancelSubscription() {
  const res = await authFetch(`${CONFIG.STAP_API}/billing/cancel`, {
    method: 'POST',
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Cancellation failed');
  }

  return res.json();
}
