/* Admin Panel — Shared API Helper
   All admin fetch calls go through this module so the Authorization header
   and error handling are applied consistently. */

const TOKEN = () => localStorage.getItem('cv_token') || '';

/**
 * Authenticated fetch wrapper for the admin panel.
 * Returns parsed JSON or throws an Error with the API's error message.
 */
export async function adminFetch(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export function adminGet(path)         { return adminFetch(path); }
export function adminPost(path, body)  { return adminFetch(path, { method: 'POST',   body: JSON.stringify(body) }); }
export function adminPatch(path, body) { return adminFetch(path, { method: 'PATCH',  body: JSON.stringify(body) }); }
export function adminDelete(path)      { return adminFetch(path, { method: 'DELETE' }); }
