import { Router } from 'express';

// ── Handlers ──────────────────────────────────────────────────────────────

/** GET /api/geocode/city?q= — proxy city search to OSM Nominatim. */
export async function ocGetGeocodeCity(req, res) {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const data = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=10&q=${encodeURIComponent(q)}`,
      { headers: { 'User-Agent': 'oc5/1.0' } });
    res.json(await data.json());
  } catch { res.json([]); }
}

// ── Routes ────────────────────────────────────────────────────────────────

const router = Router();
router.get('/api/geocode/city', ocGetGeocodeCity);

export default router;
