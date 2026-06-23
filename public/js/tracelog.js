/**
 * tracelog.js — lightweight frontend tracing, wired to dev console levels.
 *
 * Usage:
 *   import { tracelog, eventlog } from './tracelog.js';
 *   tracelog('cache.js', 'ocGetDetail', 135);     // console.debug:  +135ms cache.js ocGetDetail
 *   eventlog('W', 'Coords parse failed', raw);    // console.warn:  [W] cache.js:42 Coords parse failed
 *
 * Levels: debug → console.debug, info → console.info, warn → console.warn, error → console.error
 *         Prefix: +ms source fn  (tracelog)  or  [level] source  (eventlog)
 *
 * Caller location: uses Error().stack to find the calling file:line (browser-dependent).
 * Falls back to callerName if V8 stack inspection is unavailable.
 */

const levelLabels = { D: 'debug', I: 'info', W: 'warn', E: 'error' };

function callerSource() {
  try {
    const e = new Error();
    const stack = e.stack.split('\n');
    // Skip Error, tracelog/eventlog themselves, find first external caller
    for (let i = 2; i < stack.length; i++) {
      const line = stack[i];
      if (line.includes('tracelog.js')) continue;
      const m = line.match(/(\w+\.js):(\d+)/);
      if (m) return `${m[1]}:${m[2]}`;
      const m2 = line.match(/at (\w+)/);
      if (m2) return m2[1];
    }
  } catch {}
  return '?';
}

/**
 * Performance trace — logs elapsed time for a named operation.
 * @param {string} src    source module (or caller detected)
 * @param {string} fn     function or operation name
 * @param {number} ms     elapsed milliseconds
 */
export function tracelog(src, fn, ms) {
  console.debug(` +${String(ms).padStart(5)}ms ${src.padEnd(20)} ${fn}`);
}

/**
 * Event log — typed message with optional detail.
 * @param {string} level   'D'|'I'|'W'|'E'
 * @param {string} msg     human-readable message
 * @param {*}      detail  optional data to inspect
 */
export function eventlog(level, msg, detail) {
  const label = levelLabels[level] || 'I';
  const src = callerSource();
  const fn = console[label] || console.log;
  if (detail !== undefined) {
    fn(`[${level}] ${src} ${msg}`, detail);
  } else {
    fn(`[${level}] ${src} ${msg}`);
  }
}
