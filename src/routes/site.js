/**
 * Site routes — static article pages and crawler files (sitemap, robots).
 * These are content-only endpoints with no data layer.
 */

import { Router } from 'express';

// ── Static article pages ──────────────────────────────────────────────────

/** Render a static article template by name (imprint, terms, …). */
function staticPage(name) {
  return (req, res) => res.render(`static/${name}.njk`);
}

// ── Crawler files ──────────────────────────────────────────────────────────

/** GET /sitemap.xml */
export function sitemap(req, res) {
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
}

/** GET /robots.txt */
export function robots(req, res) {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /\nSitemap: https://www.opencaching.de/sitemap.xml\n');
}

// ── Routes ────────────────────────────────────────────────────────────────

const router = Router();

for (const name of ['imprint', 'terms', 'privacy', 'about', 'contact', 'donations']) {
  router.get(`/${name}`, staticPage(name));
}
router.get('/sitemap.xml', sitemap);
router.get('/robots.txt', robots);

export default router;
