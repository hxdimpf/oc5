import { Router } from 'express';
import { requireLogin } from '../middleware/auth.js';
import { ocSearchUsers, ocGetUserProfile } from '../data/users.js';

// ── Handlers ──────────────────────────────────────────────────────────────

/** GET /api/users/search?q= — typeahead user search (JSON). */
export async function apiSearch(req, res) {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ items: [] });
  const rows = await ocSearchUsers(q);
  res.json({ items: rows.map(r => ({ userId: r.user_id, username: r.username, findCount: r.find_count, hideCount: r.hide_count, profileUrl: `/user/profile/${r.user_id}` })) });
}

/** GET /user/profile/:id — public user profile page. */
export async function profile(req, res) {
  const user = await ocGetUserProfile(req.params.id);
  if (!user) return res.status(404).send('User not found');
  res.render('user/detailview.njk', { profile: user });
}

/** GET /user — user search page. */
export function searchPage(req, res) {
  res.render('user/search.njk');
}

/** GET /myhome — logged-in user dashboard. */
export function myhome(req, res) {
  res.render('user/myhome.njk', { stats: {} });
}

/** GET /mywatches — logged-in user's watchlist. */
export function mywatches(req, res) {
  res.render('user/mywatches.njk');
}

/** GET /myignores — logged-in user's ignore list (reuses watches template for now). */
export function myignores(req, res) {
  res.render('user/mywatches.njk');
}

// ── Routes ────────────────────────────────────────────────────────────────

const router = Router();

// Public
router.get('/user',              searchPage);
router.get('/api/users/search',  apiSearch);
router.get('/user/profile/:id',  profile);

// Logged-in dashboard
router.get('/myhome',    requireLogin, myhome);
router.get('/mywatches', requireLogin, mywatches);
router.get('/myignores', requireLogin, myignores);

export default router;
