// When the public site is hosted on a CDN (separate origin from the backend),
// set VITE_API_BASE_URL to the backend URL. All `/api` and `/uploads` requests
// are then prefixed with it. Left empty for same-origin (dev / admin served by backend).
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

if (BASE && typeof window !== 'undefined') {
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && (input.startsWith('/api') || input.startsWith('/uploads'))) {
      // include credentials so cookie-based sessions work cross-origin (admin)
      return original(BASE + input, { credentials: 'include', ...init });
    }
    return original(input as any, init);
  };
}

export {};
