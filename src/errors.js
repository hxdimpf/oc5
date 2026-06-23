/**
 * Structured API errors — consistent shape across all endpoints.
 *
 * Every error response uses: { error: { code, status, message? } }
 * Route handlers call: throw err(code, status)  — caught by error middleware.
 */

const registry = {
  ERR_NOT_FOUND:       { status: 404, message: 'Not found' },
  ERR_AUTH:            { status: 401, message: 'Login required' },
  ERR_FORBIDDEN:       { status: 403, message: 'Not authorized' },
  LOG_PASSWORD:        { status: 403, message: 'Log password required' },
  OWNER_ONLY:          { status: 403, message: 'Only the cache owner can perform this action' },
  DUPLICATE_LOG:       { status: 409, message: 'You have already logged this type' },
  ERR_VALIDATION:      { status: 400, message: 'Bad request' },
  INVALID_COORDS:      { status: 400, message: 'Invalid coordinates' },
  ERR_INTERNAL:        { status: 500, message: 'Internal server error' },
};

/**
 * Throw a structured API error. Use in route handlers:
 *   throw err('LOG_PASSWORD');
 *   throw err('NOT_FOUND', 'Cache OC1234 not found');
 */
export function err(code, message) {
  const def = registry[code] || { status: 500, message: 'Unknown error' };
  const e = new Error(message || def.message);
  e.code = code;
  e.status = def.status;
  return e;
}

/**
 * Express error middleware — catches thrown err() and returns structured JSON.
 * Register as the LAST middleware in app.js:
 *   app.use(errorHandler);
 */
export function errorHandler(e, req, res, _next) {
  if (e.code && e.status) {
    return res.status(e.status).json({ error: { code: e.code, message: e.message } });
  }
  console.error('Unhandled error:', e.stack || e.message);
  res.status(500).json({ error: { code: 'ERR_INTERNAL', message: 'Internal server error' } });
}

/**
 * Convenience: send a structured error response without throwing.
 * Use when you need to return inline (e.g., in if/else chains):
 *   return fail(res, 'LOG_PASSWORD');
 */
export function fail(res, code, message) {
  const def = registry[code] || { status: 500 };
  return res.status(def.status).json({ error: { code, message: message || def.message } });
}
