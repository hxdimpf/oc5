/**
 * Feature route module — TEMPLATE. Copy this file to add a new feature.
 *
 * A feature module owns every route under its area: each handler is a thin glue
 * layer (parse input → call a src/data/ function → render or respond), and the
 * router at the bottom declares the verb + path for each one. Then add a single
 * `app.use(myRoutes)` line in app.js.
 *
 * Rules:
 *   - app.js never contains a route handler.
 *   - SQL lives only in src/data/.  Business logic never lives in app.js.
 *   - Keep handlers thin; put shared logic in private helpers or src/data/.
 */

import { Router } from 'express';
// import { requireLogin } from '../middleware/auth.js';
// import { ocDoSomething } from '../data/something.js';

// ── Handlers ──────────────────────────────────────────────────────────────

/** GET /example — short description of what this renders/returns. */
export async function example(req, res) {
  res.render('example.njk', {});
}

// ── Routes ────────────────────────────────────────────────────────────────

const router = Router();
router.get('/example', example);
// router.post('/example', requireLogin, create);

export default router;
