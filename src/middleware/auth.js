/**
 * Auth guards — reusable route middleware.
 *
 * The `auth` middleware (src/auth.js) runs first for every request and sets
 * `req.user = { id, username, roles }` (id=0 for anonymous). These guards build
 * on that. Use them in a feature router's route declarations:
 *
 *   router.get('/cache/new', requireLogin, newForm);
 *   router.get('/backoffice', requireRole, dashboard);
 */

/** HTML pages: bounce anonymous users to the login form. */
export function requireLogin(req, res, next) {
  if (!req.user.id) return res.redirect('/login');
  next();
}

/** Backoffice: must be logged in AND hold at least one admin role. */
export function requireRole(req, res, next) {
  if (!req.user.id) return res.redirect('/login');
  if (!req.user.roles || req.user.roles.length === 0) return res.status(403).send('Access denied');
  next();
}
