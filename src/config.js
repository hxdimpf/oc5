/**
 * Validated application config — reads from environment at startup.
 * Crashes immediately if required vars are missing (fail fast).
 * Import once in app.js, pass to middleware as res.locals.config if needed.
 */

const REQUIRED = ['DATABASE_URL'];
const DEFAULTS = {
  PORT: '3000',
  LOCALE: 'en',
};

/**
 * Parse and validate config from process.env. Throws on missing required vars.
 * @returns {{ dbUrl: string, port: number, locale: string }}
 */
export function loadConfig(env = process.env) {
  const missing = REQUIRED.filter(k => !env[k]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}. ` +
      'Set DATABASE_URL=mysql://user:pass@host:port/db');
  }

  const dbUrl = new URL(env.DATABASE_URL);
  const port = parseInt(env.PORT || DEFAULTS.PORT, 10);
  const locale = env.LOCALE || DEFAULTS.LOCALE;

  return {
    db: {
      host: dbUrl.hostname,
      port: dbUrl.port || '3306',
      user: dbUrl.username,
      password: dbUrl.password,
      database: dbUrl.pathname.replace('/', ''),
    },
    port,
    locale,
  };
}

export default loadConfig;
