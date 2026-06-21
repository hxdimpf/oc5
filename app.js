import express from 'express';
import nunjucks from 'nunjucks';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

import auth from './src/auth.js';
import * as indexRoute from './src/routes/index.js';
import * as searchRoute from './src/routes/search.js';
import * as userRoute from './src/routes/user.js';
import * as cachesRoute from './src/routes/caches.js';
import { ocGetGeocodeCity } from './src/routes/geocode.js';
import { ocLogin } from './src/ocapi.js';

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
app.use(helmet({
  // Dev environment — disable HSTS and auto-HTTPS upgrades (self-signed cert)
  strictTransportSecurity: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],  // theme flash + Nunjucks inline scripts
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://wiki.opencaching.de", "*.tile.openstreetmap.org"],
      connectSrc: ["'self'", "*.tile.openstreetmap.org", "nominatim.openstreetmap.org"],
      upgradeInsecureRequests: null,  // don't auto-upgrade HTTP→HTTPS (dev with self-signed cert)
    },
  },
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
}));

// Rate limit auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many attempts, please try again later.' });

// Static assets — submodule content at /_frontend and root (for loader.js root-relative paths)
app.use('/_frontend', express.static(path.join(__dirname, 'public/_frontend/public')));
app.use(express.static(path.join(__dirname, 'public/_frontend/public')));   // /js/*, /css/*, /vendor/*
app.use('/images', express.static(path.join(__dirname, 'public/images')));   // /images/*

nunjucks.configure(path.join(__dirname, 'public/templates/nunjucks'), {
  autoescape: true, express: app, noCache: true,
});

// ── i18n: load translations once at startup ──
import { readFileSync, readdirSync } from 'fs';
import { load } from 'js-yaml';
const i18n_data = {};
try {
  for (const f of readdirSync(path.join(__dirname, 'public/translations'))) {
    const m = f.match(/messages\+intl-icu\.(\w+)\.yaml/);
    if (!m) continue;
    const content = readFileSync(path.join(__dirname, 'public/translations', f), 'utf8');
    i18n_data[m[1]] = load(content) || {};
  }
} catch (e) { console.error('i18n load error:', e.message); }

app.use(auth);
app.use((req, res, next) => {
  res.locals.locale = req.cookies?.oc_locale || 'en';
  const t = i18n_data[res.locals.locale] || i18n_data['en'] || {};
  res.locals.i18n = t;
  res.locals.i18n_json = JSON.stringify(t);
  res.locals.user = req.user;
  next();
});

// Backoffice auth guard — user must be logged in and have at least one admin role
function backofficeGuard(req, res, next) {
  if (!req.user.id) return res.redirect('/login');
  if (!req.user.roles || req.user.roles.length === 0) return res.status(403).send('Access denied');
  next();
}

// ── Routes ──────────────────────────────────────────────────────────

app.get('/', indexRoute.home);
app.get('/login', (req, res) => res.render('login.njk'));
app.post('/login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.render('login.njk', { error: 'Username and password are required.' });
  }
  const result = await ocLogin(username, password);
  if (!result) {
    return res.render('login.njk', { error: 'Invalid username or password.' });
  }
  res.cookie('ocdevelopmentdata', result.cookie, { maxAge: 365*86400*1000, path: '/', httpOnly: true });
  res.redirect('/');
});
app.get('/set-locale/:locale', (req, res) => {
  res.cookie('oc_locale', req.params.locale, { maxAge: 365*86400*1000, path: '/' });
  res.redirect(req.get('referer') || '/');
});
app.get('/logout', (req, res) => {
  res.clearCookie('ocdevelopmentdata');
  res.redirect('/login');
});
app.get('/livemap', async (req, res) => {
  // Use user's home coordinates if logged in, otherwise default to Hannover
  let initLat = 52.3759, initLon = 9.7320, initZoom = 13;
  if (req.user.id) {
    try {
      const pool = (await import('./src/db.js')).default;
      const [user] = await pool.query('SELECT latitude, longitude FROM user WHERE user_id = ?', [req.user.id]);
      if (user && user.latitude !== 0 && user.longitude !== 0) {
        initLat = user.latitude;
        initLon = user.longitude;
      }
    } catch (e) { /* fall back to defaults */ }
  }
  res.render('maps/livemap.njk', { initLat, initLon, initZoom });
});

app.get('/caches', cachesRoute.searchPage);
app.get('/cache/new', cachesRoute.newCachePage);
app.post('/cache/new', cachesRoute.newCacheSubmit);
app.get('/cache/:wp', cachesRoute.detail);
app.get('/api/caches/live', cachesRoute.apiLive);
app.get('/api/caches/search', cachesRoute.apiSearch);
app.get('/api/caches/waypoints', cachesRoute.waypoints);
app.get('/api/cache/:wp', cachesRoute.apiDetail);
app.post('/api/cache/:wp/note', cachesRoute.saveNote);
app.post('/api/cache/:wp/log', cachesRoute.createLog);
app.put('/api/cache/:wp/log/:logId', cachesRoute.updateLog);
app.delete('/api/cache/:wp/log/:logId', cachesRoute.deleteLog);
app.post('/api/cache/:wp/coords', cachesRoute.saveCoords);
app.post('/api/cache/:wp/logpw', cachesRoute.saveLogpw);

app.get('/api/caches/live', searchRoute.liveCaches);
app.get('/api/geocode/city', ocGetGeocodeCity);

app.get('/user', (req, res) => res.render('user/search.njk'));
app.get('/api/users/search', userRoute.apiSearch);
app.get('/user/profile/:id', userRoute.profile);

// User dashboard
app.get('/myhome', (req, res) => {
  if (!req.user.id) return res.redirect('/login');
  res.render('user/myhome.njk', { stats: {} });
});
app.get('/mywatches', (req, res) => {
  if (!req.user.id) return res.redirect('/login');
  res.render('user/mywatches.njk');
});
app.get('/myignores', (req, res) => {
  if (!req.user.id) return res.redirect('/login');
  res.render('user/mywatches.njk');  // reuse template for now, customize later
});

// ── Backoffice ────────────────────────────────────────────────────────
app.get('/backoffice', backofficeGuard, (req, res) => res.render('backoffice/index.njk'));
app.get('/backoffice/reported-caches', backofficeGuard, (req, res) => res.render('backoffice/reported-caches.njk'));
app.get('/backoffice/users', backofficeGuard, (req, res) => res.send('User management — coming soon'));
app.get('/backoffice/roles', backofficeGuard, (req, res) => res.send('Role management — coming soon'));

// Static article pages
app.get('/imprint', (req, res) => res.render('static/imprint.njk'));
app.get('/terms', (req, res) => res.render('static/terms.njk'));
app.get('/privacy', (req, res) => res.render('static/privacy.njk'));
app.get('/about', (req, res) => res.render('static/about.njk'));
app.get('/contact', (req, res) => res.render('static/contact.njk'));
app.get('/donations', (req, res) => res.render('static/donations.njk'));

// Registration & password reset
import { ocCheckUsername, ocCheckEmail, ocCreateUser, ocCreateActivationCode,
  ocActivateUser, ocSetPasswordResetToken, ocResetPassword, ocGetUserByEmail } from './src/ocapi.js';

app.get('/register', (req, res) => res.render('register.njk'));
app.post('/register', async (req, res) => {
  const { username, email, password, password2, tos } = req.body;
  if (!username || !email || !password) {
    return res.render('register.njk', { error: 'All fields are required.', form: req.body });
  }
  if (password !== password2) {
    return res.render('register.njk', { error: 'Passwords do not match.', form: req.body });
  }
  if (username.length < 3 || username.length > 60) {
    return res.render('register.njk', { error: 'Username must be between 3 and 60 characters.', form: req.body });
  }
  if (await ocCheckUsername(username)) {
    return res.render('register.njk', { error: 'Username is already taken.', form: req.body });
  }
  if (await ocCheckEmail(email)) {
    return res.render('register.njk', { error: 'Email is already registered.', form: req.body });
  }
  const user = await ocCreateUser({ username, email, password });
  await ocCreateActivationCode(user.user_id);
  res.render('register.njk', { success: 'Account created! Please check your email for the activation link.' });
});
app.get('/register/activate/:code', async (req, res) => {
  const user = await ocActivateUser(req.params.code);
  if (!user) return res.status(400).send('Invalid or expired activation code.');
  res.redirect('/login');
});

app.get('/password-reset', (req, res) => res.render('password-reset.njk'));
app.post('/password-reset', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.render('password-reset.njk', { error: 'Email is required.' });
  const result = await ocSetPasswordResetToken(email);
  if (!result) return res.render('password-reset.njk', { error: 'No account found with that email.' });
  // In production, send email with token. For now, just show success.
  res.render('password-reset.njk', { success: 'If the email is registered, a reset link has been sent.' });
});
app.get('/password-reset/:token', (req, res) => {
  res.render('password-reset.njk', { token: req.params.token });
});
app.post('/password-reset/:token', async (req, res) => {
  const { password, password2 } = req.body;
  if (password !== password2) {
    return res.render('password-reset.njk', { token: req.params.token, error: 'Passwords do not match.' });
  }
  const user = await ocResetPassword(req.params.token, password);
  if (!user) return res.render('password-reset.njk', { token: req.params.token, error: 'Invalid or expired token.' });
  res.redirect('/login');
});

// ── Sitemap & robots.txt ────────────────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.opencaching.de/</loc><priority>1.0</priority></url>
  <url><loc>https://www.opencaching.de/caches</loc><priority>0.8</priority></url>
  <url><loc>https://www.opencaching.de/livemap</loc><priority>0.8</priority></url>
  <url><loc>https://www.opencaching.de/about</loc><priority>0.5</priority></url>
  <url><loc>https://www.opencaching.de/privacy</loc><priority>0.5</priority></url>
  <url><loc>https://www.opencaching.de/imprint</loc><priority>0.5</priority></url>
  <url><loc>https://www.opencaching.de/contact</loc><priority>0.5</priority></url>
</urlset>`);
});
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /\nSitemap: https://www.opencaching.de/sitemap.xml\n');
});

// ── 404 catch-all ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error/404.njk');
});

// ── Error handler ────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error('Server error:', err.stack || err.message);
  res.status(err.status || 500).render('error/500.njk');
});

// ── Start ──────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`oc5 running on http://localhost:${PORT}`));
