import { state } from "../state.js";

/**
 * Authenticated fetch wrapper.
 * Automatically injects `Authorization: Bearer <token>` when the user
 * has a JWT stored in state.token — fixing Bug #1 where every write
 * was sent anonymously regardless of login status.
 * Caller-supplied headers take precedence (spread after the defaults).
 */
export async function api(path, options = {}) {
  const baseHeaders = { "Content-Type": "application/json" };
  if (state.token) baseHeaders["Authorization"] = `Bearer ${state.token}`;

  const response = await fetch(path, {
    ...options,
    headers: { ...baseHeaders, ...(options.headers || {}) }
  });

  if (!response.ok) {
    let errMsg = `Request failed: ${response.status}`;
    try {
      const errBody = await response.clone().json();
      if (errBody.error) errMsg = errBody.error;
    } catch { /* ignore parse errors */ }
    throw new Error(errMsg);
  }

  return response.json();
}

export function go(route) { location.hash = route; }

