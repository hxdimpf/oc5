/**
 * Flight Recorder — ring-buffer telemetry for the data layer and route handlers.
 *
 * Buffers ALWAYS run. Always wrap around. No enable/disable — that guarantees
 * data is missing when you need it most.
 *
 * Record format (all entries):
 *   { t, src, type, ...payload }
 *
 * Payload varies by recorder:
 *   data:  { fn, args?, ms? }
 *   http:  { method, path, status, ms }
 *   sql:   { sql, n?, ms?, err? }
 *
 * A TraceFormatter expands and merges them into a linear timeline for rendering.
 */

// ── Ring buffer ─────────────────────────────────────────────────────────

class RingBuffer {
  constructor(depth) {
    this.depth = depth;
    this.buf = new Array(depth);
    this.idx = 0;
    this.count = 0;
  }

  push(entry) {
    this.buf[this.idx] = entry;
    this.idx = (this.idx + 1) % this.depth;
    if (this.count < this.depth) this.count++;
  }

  drain() {
    if (this.count === 0) return [];
    const entries = [];
    const start = this.count < this.depth ? 0 : this.idx;
    for (let i = 0; i < this.count; i++) {
      entries.push(this.buf[(start + i) % this.depth]);
    }
    this.count = 0;
    this.idx = 0;
    return entries;
  }

  snapshot() {
    if (this.count === 0) return [];
    const entries = [];
    const start = this.count < this.depth ? 0 : this.idx;
    for (let i = 0; i < this.count; i++) {
      entries.push(this.buf[(start + i) % this.depth]);
    }
    return entries;
  }
}

// ── Recorder registry ───────────────────────────────────────────────────

const recorders = {};

export function defineRecorder(name, depth) {
  const r = { name, ring: new RingBuffer(depth), depth };
  recorders[name] = r;
  return r;
}

/**
 * Record an event. Always writing.
 * @param {string} src     recorder name ('data', 'http', 'sql')
 * @param {string} type    event type ('>', '<', '!', '?', 'ok', 'R')
 * @param {object} payload recorder-specific payload (fn, sql, method, ms, …)
 */
export function record(src, type, payload = {}) {
  const r = recorders[src];
  if (!r) return;
  r.ring.push({ t: Date.now(), src, type, ...payload });
}

// ── Error types → recorder dump matrix ─────────────────────────────────

const ERROR_TRIGGERS = {
  SQL_ERROR:          ['sql', 'data'],         // DB query failures — full query log + data trace
  ERR_VALIDATION:     ['http'],                // Input validation — HTTP request log
  ERR_AUTH:           ['http'],                // Auth failures — HTTP request log
  ERR_NOT_FOUND:      ['http'],                // 404s — HTTP request log (minimal)
  ERR_INTERNAL:       ['sql', 'data', 'http'], // Unhandled — dump everything
  '*':                ['data', 'http'],        // Catch-all
};

export function dumpOnError(err) {
  const code = err.code || err.constructor?.name || '*';
  const triggers = ERROR_TRIGGERS[code] || ERROR_TRIGGERS['*'];
  const timeline = [];

  for (const name of triggers) {
    const r = recorders[name];
    if (!r) continue;
    for (const e of r.drain()) {
      timeline.push(e);
    }
  }

  timeline.sort((a, b) => a.t - b.t);
  return { error: { code, message: err.message }, timeline };
}

// ── File dump ──────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

export function dumpToFile(err, timeline) {
  try {
    mkdirSync('logs', { recursive: true });
    const code = err.code || 'UNKNOWN';
    const ts = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
    const file = join('logs', `flight-${code}-${ts}.jsonl`);

    const header = JSON.stringify({
      error:  { code, message: err.message, stack: err.stack?.split('\n').slice(0, 3) },
      count:  timeline.length,
      dumped: new Date().toISOString(),
    });
    const lines = timeline.map(e => JSON.stringify(e));
    writeFileSync(file, header + '\n' + lines.join('\n') + '\n');
    console.error(`Flight recorder dump → ${file} (${lines.length} entries)`);
    return file;
  } catch (e) {
    console.error('Failed to write flight recorder dump:', e.message);
    return null;
  }
}

// ── Trace formatter ─────────────────────────────────────────────────────

const TYPE_LABELS = { '>': 'enter', '<': 'exit', '!': 'error', '?': 'query', 'ok': 'ok', 'R': 'request' };

export function formatEntry(e) {
  const ts = new Date(e.t).toISOString().slice(11, 23);
  const type = TYPE_LABELS[e.type] || e.type;
  let detail = '';
  if (e.src === 'data')  detail = `${e.fn || ''} ${e.ms ? e.ms + 'ms' : ''} ${e.args ? '(' + e.args + ' args)' : ''}`;
  if (e.src === 'http')  detail = `${e.method || ''} ${e.path || ''} → ${e.status || ''} ${e.ms ? e.ms + 'ms' : ''}`;
  if (e.src === 'sql')   detail = `${e.sql || ''} ${e.n != null ? '(' + e.n + ' params)' : ''} ${e.ms ? e.ms + 'ms' : ''}`;
  return `[${ts}] ${e.src.padEnd(6)} ${type.padEnd(7)} ${detail}`;
}

// ── Admin API ───────────────────────────────────────────────────────────

export function adminState() {
  const state = {};
  for (const [name, r] of Object.entries(recorders)) {
    state[name] = { depth: r.depth, entries: r.ring.count };
  }
  return state;
}

export function adminSnapshot(name) {
  const r = recorders[name];
  if (!r) return null;
  return r.ring.snapshot().map(e => ({
    time: new Date(e.t).toISOString(),
    ...e,
  }));
}
