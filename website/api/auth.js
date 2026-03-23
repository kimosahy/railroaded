/**
 * Auth utilities for frontend pages.
 * Tokens stored in sessionStorage (not localStorage per spec).
 */

const API_BASE = window.location.hostname === 'localhost'
  ? `http://localhost:${window.location.port || 3000}`
  : 'https://api.railroaded.ai';

const auth = {
  getAccessToken() {
    return sessionStorage.getItem('rr_access_token');
  },

  getRefreshToken() {
    return sessionStorage.getItem('rr_refresh_token');
  },

  getAccount() {
    const raw = sessionStorage.getItem('rr_account');
    return raw ? JSON.parse(raw) : null;
  },

  isLoggedIn() {
    return !!this.getAccessToken();
  },

  logout() {
    const refreshToken = this.getRefreshToken();
    if (refreshToken) {
      fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      }).catch(() => {});
    }
    sessionStorage.removeItem('rr_access_token');
    sessionStorage.removeItem('rr_refresh_token');
    sessionStorage.removeItem('rr_account');
    window.location.href = '/login';
  },

  async fetchWithAuth(url, options = {}) {
    const token = this.getAccessToken();
    if (!token) {
      window.location.href = '/login';
      return null;
    }

    const headers = { ...options.headers, Authorization: `Bearer ${token}` };
    let res = await fetch(url, { ...options, headers });

    // If 401, try to refresh
    if (res.status === 401) {
      const refreshed = await this.refresh();
      if (!refreshed) {
        window.location.href = '/login';
        return null;
      }
      headers.Authorization = `Bearer ${this.getAccessToken()}`;
      res = await fetch(url, { ...options, headers });
    }

    return res;
  },

  async refresh() {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        this.logout();
        return false;
      }

      const data = await res.json();
      sessionStorage.setItem('rr_access_token', data.access_token);
      sessionStorage.setItem('rr_refresh_token', data.refresh_token);
      return true;
    } catch {
      return false;
    }
  },

  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = '/login';
      return false;
    }
    return true;
  },

  updateNav() {
    const navLinks = document.querySelector('nav .links');
    if (!navLinks) return;

    // Remove existing auth links
    navLinks.querySelectorAll('.auth-link').forEach(el => el.remove());

    if (this.isLoggedIn()) {
      const dashLink = document.createElement('a');
      dashLink.href = '/dashboard';
      dashLink.textContent = 'Dashboard';
      dashLink.className = 'auth-link';
      if (window.location.pathname === '/dashboard') dashLink.classList.add('active');
      navLinks.appendChild(dashLink);
    } else {
      const loginLink = document.createElement('a');
      loginLink.href = '/login';
      loginLink.textContent = 'Login';
      loginLink.className = 'auth-link';
      navLinks.appendChild(loginLink);
    }
  },
};

// Auto-update nav on load
document.addEventListener('DOMContentLoaded', () => auth.updateNav());
