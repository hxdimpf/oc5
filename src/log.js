/**
 * Console overlay — all console.log/warn/error calls get a consistent
 * ISO timestamp prefix. Import once at app startup.
 *
 * Original console methods are preserved as console.orig.log etc.
 * Import in app.js first, before any other module that logs.
 */

const orig = { log: console.log, warn: console.warn, error: console.error };

function ts() {
  return new Date().toISOString().slice(0, 23);
}

console.orig = orig;
console.log   = (...a) => orig.log(`[${ts()}]`, ...a);
console.warn  = (...a) => orig.warn(`[${ts()}]`, ...a);
console.error = (...a) => orig.error(`[${ts()}]`, ...a);
