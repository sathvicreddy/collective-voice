/* ============================================================
   src/middleware/errorHandler.js
   Centralized error handler.

   Called from the top-level try/catch in server.js for any
   error that bubbles up out of handleApiRequest or the WS
   handlers.

   Behaviour:
     - AppError subclasses → respond with their status + message
     - readBody shape errors (status 400/413) → respond inline
     - Everything else → 500 + log (never leak stack to client)
   ============================================================ */
"use strict";

const { json }     = require("../utils/helpers");
const { AppError } = require("../errors");

/**
 * Handle an error that escaped route/controller logic.
 *
 * @param {Error}                    err  - The caught error
 * @param {import("http").ServerResponse} res  - Node HTTP response
 * @returns {void}
 */
function handleError(err, res) {
  // Already-responded responses (res.headersSent) — nothing more to do.
  if (res.headersSent) return;

  // Typed application errors — safe to surface message to client
  if (err instanceof AppError) {
    return json(res, err.status, { error: err.message });
  }

  // readBody shape errors (set by helpers.js)
  if (err.status === 413) return json(res, 413, { error: "Payload too large (max 1 MiB)." });
  if (err.status === 400) return json(res, 400, { error: err.message || "Invalid JSON in request body." });

  // Unexpected error — log internally, generic message to client
  console.error(`[${new Date().toISOString()}] UNHANDLED API ERROR:`, err.stack || err);
  return json(res, 500, { error: "Internal server error." });
}

module.exports = { handleError };
