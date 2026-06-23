/**
 * Flight Recorder — ring-buffer telemetry for the data layer and route handlers.
 *
 * Buffers ALWAYS run. Always wrap around. No enable/disable — that guarantees
 * data is missing when you need it most.
 *
 * Config defines:
 *   - depth per recorder (ring buffer capacity)
 *   - error triggers: which recorders dump when a specific error fires
 *
 * Record entries are compact: [timestamp, type, ...args]
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

  /** Push a compact entry: [timestamp, eventType, ...args] */
  push(entry) {
    this.buf[this.idx] = entry;
    this.idx = (this.idx + 1) % this.depth;
    if (this.count < this.depth) this.count++;
  }

  /** Return all entries in chronological order */
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

/**
 * Define a flight recorder. Always on, always wrapping.
 * @param {string} name
 * @param {number} depth  ring buffer capacity
 */
export function defineRecorder(name, depth) {
  const r = { name, ring: new RingBuffer(depth), depth };
  recorders[name] = r;
  return r;
}

/** Record an event to a named recorder. Always writing. */
export function record(name, type, ...args) {
  const r = recorders[name];
  if (!r) return;  // undefined recorder — silently skip
  r.ring.push([Date.now(), type, ...args]);
}

// ── Error-triggered dumping ─────────────────────────────────────────────

const ERROR_TRIGGERS = {
  SqlError:        ['sql', 'data'],
  ValidationError: ['http'],
  '*':             ['data', 'http'],
};

/**
 * When an error occurs, dump configured recorders and return merged timeline.
 * @param {Error} err
 * @returns {object} { error, timeline }
 */
export function dumpOnError(err) {
  const triggers = ERROR_TRIGGERS[err.code || err.constructor?.name] || ERROR_TRIGGERS['*'];
  const timeline = [];

  for (const name of triggers) {
    const r = recorders[name];
    if (!r) continue;
    const entries = r.drain();
    for (const e of entries) {
      timeline.push({ recorder: name, time: e[0], type: e[1], args: e.slice(2) });
    }
  }

  timeline.sort((a, b) => a.time - b.time);
  return { error: { code: err.code, message: err.message }, timeline };
}

// ── Trace formatter ─────────────────────────────────────────────────────

const TYPE_NAMES = {
  '>': 'enter', '<': 'exit', '!': 'error', '?': 'query', 'R': 'request', 'S': 'response',
};

/**
 * Expand a raw flight recorder entry to a human-readable line.
 * @param {{ recorder: string, time: number, type: string, args: any[] }} entry
 * @returns {string}
 */
export function formatEntry(entry) {
  const ts = new Date(entry.time).toISOString().slice(11, 23);
  const type = TYPE_NAMES[entry.type] || entry.type;
  const detail = entry.args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  return `[${ts}] ${entry.recorder.padEnd(6)} ${type.padEnd(8)} ${detail}`;
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
    time: new Date(e[0]).toISOString(),
    type: TYPE_NAMES[e[1]] || e[1],
    args: e.slice(2),
  }));
}
