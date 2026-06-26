/**
 * Auth & account routes — login/logout, registration, password reset, locale.
 *
 * Session creation/validation lives in src/data/sessions.js; account queries in
 * src/data/users.js. Handlers here are thin glue: parse the form → call data →
 * render the same template with an error/success, or redirect.
 */

import { Router } from 'express';
import { ocLogin } from '../data/sessions.js';
import { ocCheckUsername, ocCheckEmail, ocCreateUser, ocCreateActivationCode,
  ocActivateUser, ocSetPasswordResetToken, ocResetPassword } from '../data/users.js';

const YEAR_MS = 365 * 86400 * 1000;

// ── Login / logout ──────────────────────────────────────────────────────

/** GET /login — render the login form. */
export function loginForm(req, res) {
  res.render('login.njk');
}

/** POST /login — validate credentials, set the session cookie, redirect home. */
export async function login(req, res) {
  const { username, password } = req.body;
  const last_username = username || '';
  if (!username || !password) {
    return res.render('login.njk', { error: 'Username and password are required.', last_username });
  }
  const result = await ocLogin(username, password);
  if (!result) {
    return res.render('login.njk', { error: 'Invalid username or password.', last_username });
  }
  res.cookie('oc5_session', result.cookie, { maxAge: YEAR_MS, path: '/', httpOnly: true });
  res.redirect('/');
}

/** GET /logout — clear the session cookie. */
export function logout(req, res) {
  res.clearCookie('oc5_session');
  res.redirect('/login');
}

/** GET /set-locale/:locale — persist the UI language cookie, bounce back. */
export function setLocale(req, res) {
  res.cookie('oc_locale', req.params.locale, { maxAge: YEAR_MS, path: '/' });
  res.redirect(req.get('referer') || '/');
}

// ── Registration ────────────────────────────────────────────────────────

/** GET /register — render the registration form. */
export function registerForm(req, res) {
  res.render('register.njk');
}

/** POST /register — validate, create the account, send the activation code. */
export async function register(req, res) {
  const { username, email, password, password2 } = req.body;
  if (!username || !email || !password) {
    return res.render('register.njk', { error: 'All fields are required.', form: req.body });
  }
  if (password !== password2) {
    return res.render('register.njk', { error: 'Passwords do not match.', form: req.body });
  }
  if (username.length < 3 || username.length > 60) {
    return res.render('register.njk', { error: 'Username must be between 3 and 60 characters.', form: req.body });
  }
  if (await ocCheckUsername(username)) {
    return res.render('register.njk', { error: 'Username is already taken.', form: req.body });
  }
  if (await ocCheckEmail(email)) {
    return res.render('register.njk', { error: 'Email is already registered.', form: req.body });
  }
  const user = await ocCreateUser({ username, email, password });
  await ocCreateActivationCode(user.user_id);
  res.render('register.njk', { success: 'Account created! Please check your email for the activation link.' });
}

/** GET /register/activate/:code — activate a pending account. */
export async function activate(req, res) {
  const user = await ocActivateUser(req.params.code);
  if (!user) return res.status(400).send('Invalid or expired activation code.');
  res.redirect('/login');
}

// ── Password reset ────────────────────────────────────────────────────────

/** GET /password-reset — render the "request a reset" form. */
export function passwordResetForm(req, res) {
  res.render('password-reset.njk');
}

/** POST /password-reset — issue a reset token for the given email. */
export async function requestPasswordReset(req, res) {
  const { email } = req.body;
  if (!email) return res.render('password-reset.njk', { error: 'Email is required.' });
  const result = await ocSetPasswordResetToken(email);
  if (!result) return res.render('password-reset.njk', { error: 'No account found with that email.' });
  // In production, send email with token. For now, just show success.
  res.render('password-reset.njk', { success: 'If the email is registered, a reset link has been sent.' });
}

/** GET /password-reset/:token — render the "set a new password" form. */
export function passwordResetTokenForm(req, res) {
  res.render('password-reset.njk', { token: req.params.token });
}

/** POST /password-reset/:token — set the new password and redirect to login. */
export async function resetPassword(req, res) {
  const { password, password2 } = req.body;
  if (password !== password2) {
    return res.render('password-reset.njk', { token: req.params.token, error: 'Passwords do not match.' });
  }
  const user = await ocResetPassword(req.params.token, password);
  if (!user) return res.render('password-reset.njk', { token: req.params.token, error: 'Invalid or expired token.' });
  res.redirect('/login');
}

// ── Routes ────────────────────────────────────────────────────────────────

const router = Router();

router.get ('/login',  loginForm);
router.post('/login',  login);
router.get ('/logout', logout);
router.get ('/set-locale/:locale', setLocale);

router.get ('/register', registerForm);
router.post('/register', register);
router.get ('/register/activate/:code', activate);

router.get ('/password-reset',         passwordResetForm);
router.post('/password-reset',         requestPasswordReset);
router.get ('/password-reset/:token',  passwordResetTokenForm);
router.post('/password-reset/:token',  resetPassword);

export default router;
