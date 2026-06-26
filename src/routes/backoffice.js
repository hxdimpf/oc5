/**
 * Backoffice routes — admin-only pages. Every route is guarded by requireRole
 * (logged in + at least one admin role).
 */

import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

// ── Handlers ──────────────────────────────────────────────────────────────

/** GET /backoffice — admin dashboard. */
export function dashboard(req, res) {
  res.render('backoffice/index.njk');
}

/** GET /backoffice/reported-caches — moderation queue. */
export function reportedCaches(req, res) {
  res.render('backoffice/reported-caches.njk');
}

/** GET /backoffice/users — user management (placeholder). */
export function users(req, res) {
  res.send('User management — coming soon');
}

/** GET /backoffice/roles — role management (placeholder). */
export function roles(req, res) {
  res.send('Role management — coming soon');
}

// ── Routes ────────────────────────────────────────────────────────────────

const router = Router();

router.get('/backoffice',                 requireRole, dashboard);
router.get('/backoffice/reported-caches', requireRole, reportedCaches);
router.get('/backoffice/users',           requireRole, users);
router.get('/backoffice/roles',           requireRole, roles);

export default router;
