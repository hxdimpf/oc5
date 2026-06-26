import { Router } from 'express';
import { ocGetCacheCounts } from '../data/caches.js';

// ── Handlers ──────────────────────────────────────────────────────────────

/** GET / — landing page with cache counts. */
export async function home(req, res) {
  const data = await ocGetCacheCounts();
  res.render('index/index.njk', data);
}

// ── Routes ────────────────────────────────────────────────────────────────

const router = Router();
router.get('/', home);

export default router;
