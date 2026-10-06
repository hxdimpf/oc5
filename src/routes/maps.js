/**
 * Map routes — the live map page. The initial view (URL params, the user's
 * home coordinates, or Hannover) is worked out client-side by livemap.js.
 */

import { Router } from 'express';

// ── Handlers ──────────────────────────────────────────────────────────────

/** GET /livemap — render the live map page. */
export function livemap(req, res) {
  res.render('maps/livemap.njk');
}

// ── Routes ────────────────────────────────────────────────────────────────

const router = Router();
router.get('/livemap', livemap);

export default router;
