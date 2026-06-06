const express = require('express');
const nunjucks = require('nunjucks');
const path = require('path');
require('dotenv').config();

const auth = require('./src/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Nunjucks setup
nunjucks.configure(path.join(__dirname, 'views'), {
  autoescape: true,
  express: app,
  noCache: true,
});

// Auth — hardcoded for now
app.use(auth);

// Make user available in all templates
app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

// ── Routes ─────────────────────────────────────────────────────────

app.get('/', require('./src/routes/index'));

app.get('/login', (req, res) => res.render('login.njk'));
app.post('/login', (req, res) => res.redirect('/'));

app.get('/livemap', (req, res) => res.render('maps/livemap.njk'));

const caches = require('./src/routes/caches');
app.get('/caches', caches.searchPage);
app.get('/cache/new', caches.newCachePage);
app.get('/cache/:wp', caches.detail);
app.get('/api/caches/search', caches.apiSearch);
app.get('/api/caches/waypoints', caches.waypoints);
app.get('/api/cache/:wp', caches.apiDetail);
app.post('/api/cache/:wp/note', caches.saveNote);
app.post('/api/cache/:wp/log', caches.createLog);

app.get('/api/geocode/city', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=10&q=${encodeURIComponent(q)}`;
  try {
    const data = await fetch(url, { headers: { 'User-Agent': 'oc5/1.0' } });
    res.json(await data.json());
  } catch { res.json([]); }
});

const search = require('./src/routes/search');
app.get('/api/caches/live', search.liveCaches);

const user = require('./src/routes/user');
app.get('/user', user.searchPage);
app.get('/api/users/search', user.apiSearch);
app.get('/user/profile/:id', user.profile);

// ── Start ──────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`oc5 running on http://localhost:${PORT}`);
});
