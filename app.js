// Timestamp overlay — must be first import
import './src/log.js';

import express from 'express';
import nunjucks from 'nunjucks';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Flight recorders — ring buffers for the data layer and HTTP layer
import { defineRecorder, dumpOnError, dumpToFile, formatEntry } from './src/flightrecorder.js';
defineRecorder('data', 200);   // data layer function calls + timing
defineRecorder('http', 100);   // request path, method, status, duration
defineRecorder('sql',  50);    // raw SQL + params (activated on error)

import auth from './src/auth.js';
import { errorHandler } from './src/errors.js';

// Feature route modules — each is a self-contained express.Router().
// See CONVENTIONS.md. Rule: app.js mounts routers; it never defines a handler.
import indexRoutes      from './src/routes/index.js';
import authRoutes       from './src/routes/auth.js';
import cachesRoutes     from './src/routes/caches.js';
import userRoutes       from './src/routes/user.js';
import mapsRoutes       from './src/routes/maps.js';
import geocodeRoutes    from './src/routes/geocode.js';
import siteRoutes       from './src/routes/site.js';
import backofficeRoutes from './src/routes/backoffice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  req.cookies = {};
  const h = req.headers.cookie;
  if (h) h.split(';').forEach(c => { const [k,v] = c.trim().split('='); req.cookies[k] = decodeURIComponent(v||''); });
  next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static assets — served directly from public/
app.use('/js',      express.static(path.join(__dirname, 'public/js')));
app.use('/css',     express.static(path.join(__dirname, 'public/css')));
app.use('/vendor',  express.static(path.join(__dirname, 'public/vendor')));
app.use('/images',  express.static(path.join(__dirname, 'public/images')));
app.use('/shared',  express.static(path.join(__dirname, 'public/shared')));
app.use('/docs',    express.static(path.join(__dirname, 'public/docs')));
app.get('/favicon.ico', (req, res) => res.sendFile(path.join(__dirname, 'public/favicon.ico')));

const nunjucksEnv = nunjucks.configure(path.join(__dirname, 'views'), {
  autoescape: true, express: app, noCache: true,
});
// Add Twig-compatible filters and globals
nunjucksEnv.addFilter('format', (fmt, ...args) => {
  // Handle sprintf-style: '%.1f' | format(value) or '%02d' | format(num)
  if (typeof fmt !== 'string') return String(fmt);
  let i = 0;
  return fmt.replace(/%[0-9.]*[sdif]/g, (spec) => {
    const val = args[i++];
    if (val === undefined) return spec;
    if (spec.includes('f')) return Number(val).toFixed((spec.match(/\.(\d+)/)?.[1] || 0) | 0);
    if (spec.includes('d') || spec.includes('i')) return String(Math.floor(Number(val))).padStart((spec.match(/%(\d+)/)?.[1] || 1) | 0, '0');
    return String(val);
  });
});
nunjucksEnv.addFilter('number_format', (num, decimals = 0, decSep = '.', thouSep = ',') => {
  const fixed = Number(num).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thouSep) + (decimals > 0 ? decSep + decPart : '');
});
nunjucksEnv.addGlobal('range', (start, end) => { const a = []; for (let i = start; i <= end; i++) a.push(i); return a; });

// ── i18n: load translations once at startup ──
import { readFileSync, readdirSync } from 'fs';
import { load } from 'js-yaml';
const i18n_data = {};
try {
  for (const f of readdirSync(path.join(__dirname, 'i18n'))) {
    const m = f.match(/messages\+intl-icu\.(\w+)\.yaml/);
    if (!m) continue;
    const content = readFileSync(path.join(__dirname, 'i18n', f), 'utf8');
    i18n_data[m[1]] = load(content) || {};
  }
} catch (e) { console.error('i18n load error:', e.message); }

app.use(auth);

// HTTP flight recorder — record every request
import { record } from './src/flightrecorder.js';
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    record('http', 'R', { method: req.method, path: req.originalUrl, status: res.statusCode, ms: Date.now() - start });
  });
  next();
});

// Per-request view locals: locale, translations, current user
app.use((req, res, next) => {
  res.locals.locale = req.cookies?.oc_locale || 'en';
  const t = i18n_data[res.locals.locale] || i18n_data['en'] || {};
  res.locals.i18n = t;
  res.locals.i18n_json = JSON.stringify(t);
  res.locals.user = req.user;
  next();
});

// ── Routes ──────────────────────────────────────────────────────────────
// One line per feature module. Every route lives inside its module; this file
// never declares a handler. To add an endpoint, edit the feature file (see
// CONVENTIONS.md), not this list.

app.use(indexRoutes);
app.use(authRoutes);
app.use(cachesRoutes);
app.use(userRoutes);
app.use(mapsRoutes);
app.use(geocodeRoutes);
app.use(siteRoutes);
app.use(backofficeRoutes);

// ── 404 catch-all ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error/404.njk');
});

// ── Error handler ────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  // Dump flight recorders on error — file + console
  const dump = dumpOnError(err);
  if (dump.timeline.length) {
    dumpToFile(err, dump.timeline);
    console.error(`Flight recorder dump (${dump.timeline.length} entries):`);
    for (const e of dump.timeline.slice(-20)) {
      console.error(' ', formatEntry(e));
    }
  }
  // Delegate to structured error handler
  errorHandler(err, req, res, _next);
});
app.use((err, req, res, _next) => {  // fallback for non-API errors
  console.error('Server error:', err.stack || err.message);
  res.status(err.status || 500).render('error/500.njk');
});

// ── Start ──────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`oc5 running on http://localhost:${PORT}`));
