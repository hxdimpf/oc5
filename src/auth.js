/**
 * Hardcoded auth — hxdimpf always logged in.
 * Replace with real cookie/session auth later.
 */
module.exports = function auth(req, res, next) {
  req.user = { id: 170300, username: 'hxdimpf' };
  next();
};
