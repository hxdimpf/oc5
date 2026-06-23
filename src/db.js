import { createPool } from 'mariadb';
import 'dotenv/config';

const url = new URL(process.env.DATABASE_URL);

const pool = createPool({
  host: url.hostname,
  port: url.port || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  connectionLimit: 10,
  acquireTimeout: 5000,
  connectTimeout: 5000,
});

// ── SQL flight recorder — wrap pool.query to capture every query ──────

const origQuery = pool.query.bind(pool);
pool.query = async function(sql, params) {
  const start = Date.now();
  let record;
  try { record = (await import('./flightrecorder.js')).record; } catch { /* recorder not loaded yet */ }

  if (record) {
    // Truncate SQL to first 120 chars, just enough to identify the query
    const short = typeof sql === 'string' ? sql.replace(/\s+/g, ' ').trim().slice(0, 120) : 'raw';
    record('sql', '?', short, params ? params.length : 0);
  }

  try {
    const result = await origQuery(sql, params);
    if (record) record('sql', 'ok', `${Date.now() - start}ms`);
    return result;
  } catch (e) {
    if (record) record('sql', '!', e.code || 'SqlError', `${Date.now() - start}ms`);
    throw e;
  }
};

export default pool;
