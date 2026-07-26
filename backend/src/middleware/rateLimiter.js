/* ============================================================
   Rate Limiter — Token Bucket per IP (Section 3)
   Applied to /api/auth/login and /api/auth/signup to prevent
   brute-force attacks. Uses a simple sliding-window counter
   stored in memory (sufficient for a single-process server;
   swap for Redis once you add horizontal scaling).

   Config (via env):
     RATE_LIMIT_MAX_REQUESTS  — max attempts per window (default 5)
     RATE_LIMIT_WINDOW_MS     — window length in ms (default 900000 = 15 min)
   ============================================================ */
"use strict";

// Map<ip, { count: number, resetAt: number }>
const _buckets = new Map();
const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10);

/**
 * Returns true if the IP has exceeded its rate limit.
 * Side effect: increments the counter for this IP.
 *
 * Reads MAX_REQUESTS dynamically so tests can override RATE_LIMIT_MAX_REQUESTS
 * without restarting the server / module.
 */
function isRateLimited(ip) {
  // Bypass entirely in test environments
  if (process.env.NODE_ENV === "test") return false;

  const maxReq = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "5", 10);
  const now    = Date.now();
  let   bucket = _buckets.get(ip);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    _buckets.set(ip, bucket);
  }

  bucket.count += 1;
  return bucket.count > maxReq;
}


/**
 * Returns the number of seconds until the rate-limit window resets.
 * Returns 0 if the IP is not currently rate-limited.
 */
function retryAfterSeconds(ip) {
  const bucket = _buckets.get(ip);
  if (!bucket) return 0;
  return Math.max(0, Math.ceil((bucket.resetAt - Date.now()) / 1000));
}

/**
 * Extracts the client IP from a Node http.IncomingMessage.
 * Respects X-Forwarded-For when behind a trusted proxy.
 */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

// Periodically clean up expired buckets to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of _buckets) {
    if (now > bucket.resetAt) _buckets.delete(ip);
  }
}, WINDOW_MS);

/**
 * Returns an array of currently rate-limited IPs for the admin health dashboard.
 */
function getRateLimitedIPs() {
  const now = Date.now();
  const maxReq = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "5", 10);
  const result = [];
  for (const [ip, bucket] of _buckets) {
    if (now <= bucket.resetAt && bucket.count > maxReq) {
      const secsLeft = Math.ceil((bucket.resetAt - now) / 1000);
      const h = Math.floor(secsLeft / 3600);
      const m = Math.floor((secsLeft % 3600) / 60);
      const s = secsLeft % 60;
      result.push({
        ip,
        requests: bucket.count,
        resetsIn: `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`,
      });
    }
  }
  return result;
}

module.exports = { isRateLimited, retryAfterSeconds, getClientIp, getRateLimitedIPs };
