import { ocCreateUser } from '../src/data/users.js';
import { ocInsertCache, ocGetCacheIdByWp } from '../src/data/caches.js';
import pool from '../src/db.js';

let _counter = 0;

export async function createTestUser() {
  const suffix = `_t${Date.now()}_${++_counter}`;
  const username = `testuser${suffix}`;
  const result = await ocCreateUser({
    username,
    email: `${username}@test.local`,
    password: 'testpw',
  });
  // Activate the user (ocCreateUser sets is_active_flag=0)
  await pool.query('UPDATE user SET is_active_flag = 1 WHERE user_id = ?', [Number(result.user_id)]);
  return { id: result.user_id, username: result.username };
}

export async function createTestCache(ownerId) {
  const result = await ocInsertCache({
    user_id: ownerId,
    name: `Test Cache _t${Date.now()}_${++_counter}`,
    lon: 9.7320 + Math.random() * 0.1,
    lat: 52.3759 + Math.random() * 0.1,
    type: 1, country: 'DE', date_hidden: '2026-06-01',
    size: 1, difficulty: 2, terrain: 2,
    desc: 'Test description', hint: 'Test hint', short_desc: 'Test short',
  });
  const cacheId = await ocGetCacheIdByWp(result.wp_oc);
  return { id: cacheId, wp: result.wp_oc, lat: 52.4, lon: 9.7 };
}

export async function cleanup(userId, cacheId) {
  if (cacheId) {
    await pool.query('DELETE FROM cache_logs WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM coordinates WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM caches_attributes WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM cache_desc WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM caches WHERE cache_id = ?', [cacheId]);
  }
  if (userId) {
    await pool.query('DELETE FROM sys_sessions WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM user WHERE user_id = ?', [userId]);
  }
}
