/**
 * Map routes — the live map page. Centres on the logged-in user's home
 * coordinates when available, otherwise on a default (Hannover).
 */

import { Router } from 'express';
import { ocGetUserHomeCoords } from '../data/users.js';

// ── Handlers ──────────────────────────────────────────────────────────────

/** GET /livemap — render the live map, centred on the user's home or a default. */
export async function livemap(req, res) {
  let initLat = 52.3759, initLon = 9.7320;
  const initZoom = 13;
  if (req.user.id) {
    const home = await ocGetUserHomeCoords(req.user.id);
    if (home) { initLat = home.lat; initLon = home.lon; }
  }
  res.render('maps/livemap.njk', { initLat, initLon, initZoom });
}

// ── Routes ────────────────────────────────────────────────────────────────

const router = Router();
router.get('/livemap', livemap);

export default router;
