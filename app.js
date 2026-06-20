import express from 'express';
import nunjucks from 'nunjucks';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

import auth from './src/auth.js';
import * as indexRoute from './src/routes/index.js';
import * as searchRoute from './src/routes/search.js';
import * as userRoute from './src/routes/user.js';
import * as cachesRoute from './src/routes/caches.js';
import { ocGetGeocodeCity } from './src/routes/geocode.js';

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
app.use('/_frontend', express.static(path.join(__dirname, 'public/_frontend')));

nunjucks.configure(path.join(__dirname, 'public/_frontend/templates/nunjucks'), {
  autoescape: true, express: app, noCache: true,
});

// ── i18n: load translations once at startup ──
import { readFileSync, readdirSync, existsSync } from 'fs';
const i18n_data = {};
try {
  for (const f of readdirSync(path.join(__dirname, 'public/_frontend/translations'))) {
    const m = f.match(/messages\+intl-icu\.(\w+)\.yaml/);
    if (!m) continue;
    const content = readFileSync(path.join(__dirname, 'public/_frontend/translations', f), 'utf8');
    const obj = {};
    for (const line of content.split('\n')) {
      const match = line.match(/^\s*(['"])?(.+?)\1?\s*:\s*(.+)$/);
      if (match && match[2]) {
        const key = match[2];
        let val = match[3].trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"')))
          val = val.slice(1, -1);
        obj[key] = val;
      }
    }
    i18n_data[m[1]] = obj;
  }
} catch (e) {}

app.use(auth);
app.use((req, res, next) => {
  res.locals.locale = req.cookies?.oc_locale || 'en';
  const t = i18n_data[res.locals.locale] || i18n_data['en'] || {};
  res.locals.i18n = t;
  res.locals.i18n_json = JSON.stringify(t);
  res.locals.user = req.user;
  next();
});

// ── Routes ──────────────────────────────────────────────────────────

app.get('/', indexRoute.home);
app.get('/login', (req, res) => res.render('login.njk'));
app.post('/login', (req, res) => res.redirect('/'));
app.get('/set-locale/:locale', (req, res) => {
  res.cookie('oc_locale', req.params.locale, { maxAge: 365*86400*1000, path: '/' });
  res.redirect(req.get('referer') || '/');
});
app.get('/logout', (req, res) => { res.clearCookie('ocdevelopmentdata'); res.redirect('/login'); });
app.get('/livemap', (req, res) => res.render('maps/livemap.njk'));

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

app.get('/api/caches/live', searchRoute.liveCaches);
app.get('/api/geocode/city', ocGetGeocodeCity);

app.get('/user', (req, res) => res.render('user/search.njk'));
app.get('/api/users/search', userRoute.apiSearch);
app.get('/user/profile/:id', userRoute.profile);

// ── Start ──────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`oc5 running on http://localhost:${PORT}`));
