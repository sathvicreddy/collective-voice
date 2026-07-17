/* eslint-disable */
'use strict';

// Maximum accepted request body size: 1 MiB.
// Requests exceeding this are rejected with 413 before the body is fully buffered.
const MAX_BODY_BYTES = 1_048_576;

function json(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

/**
 * Reads and JSON-parses the request body.
 *
 * Rejects with a shaped error object in two cases:
 *   { status: 413 }  — body exceeded MAX_BODY_BYTES
 *   { status: 400 }  — body is non-empty but not valid JSON
 *
 * Callers should catch these and respond with the matching HTTP status.
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body  = "";
    let bytes = 0;

    req.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) {
        // Destroy the socket so the client stops sending data
        req.destroy();
        return reject(Object.assign(new Error("Payload too large"), { status: 413 }));
      }
      body += chunk;
    });

    req.on("end", () => {
      if (!body) { resolve({}); return; }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(Object.assign(new Error("Invalid JSON in request body"), { status: 400 }));
      }
    });

    req.on("error", (err) => reject(err));
  });
}

module.exports = { json, readBody, MAX_BODY_BYTES };
