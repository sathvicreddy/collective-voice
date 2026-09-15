/* ============================================================
   src/errors/index.js
   Typed application error classes.

   Controllers and services throw these; the centralized error
   handler in middleware/errorHandler.js catches them and maps
   them to the correct HTTP status codes.

   Usage:
     const { NotFoundError } = require("../errors");
     throw new NotFoundError("Meeting not found");
   ============================================================ */
"use strict";

/**
 * Base application error. All typed errors extend this.
 * @param {string} message  — human-readable message (sent as { error: message })
 * @param {number} status   — HTTP status code
 */
class AppError extends Error {
  constructor(message, status) {
    super(message);
    this.name  = this.constructor.name;
    this.status = status;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
}

/** 400 Bad Request — invalid input, missing required fields, etc. */
class ValidationError extends AppError {
  constructor(message = "Bad request.") { super(message, 400); }
}

/** 401 Unauthorized — missing or invalid authentication credential. */
class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized.") { super(message, 401); }
}

/** 403 Forbidden — authenticated but not permitted to perform the action. */
class ForbiddenError extends AppError {
  constructor(message = "Forbidden.") { super(message, 403); }
}

/** 404 Not Found — resource does not exist. */
class NotFoundError extends AppError {
  constructor(message = "Not found.") { super(message, 404); }
}

/** 409 Conflict — resource already exists or state machine conflict. */
class ConflictError extends AppError {
  constructor(message = "Conflict.") { super(message, 409); }
}

/** 410 Gone — resource existed but is no longer available (expired meeting, etc.). */
class GoneError extends AppError {
  constructor(message = "Resource no longer available.") { super(message, 410); }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  GoneError,
};
