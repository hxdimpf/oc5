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

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

nunjucks.configure(path.join(__dirname, 'views'), {
  autoescape: true, express: app, noCache: true,
});

app.use(auth);
app.use((req, res, next) => { res.locals.user = req.user; next(); });

// ── Routes ──────────────────────────────────────────────────────────

app.get('/', indexRoute.home);
app.get('/login', (req, res) => res.render('login.njk'));
app.post('/login', (req, res) => res.redirect('/'));
app.get('/logout', (req, res) => { res.clearCookie('ocdevelopmentdata'); res.redirect('/login'); });
app.get('/livemap', (req, res) => res.render('maps/livemap.njk'));

app.get('/caches', cachesRoute.searchPage);
app.get('/cache/new', cachesRoute.newCachePage);
app.post('/cache/new', cachesRoute.newCacheSubmit);
app.get('/cache/:wp', cachesRoute.detail);
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
