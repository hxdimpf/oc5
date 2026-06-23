import pool from '../src/db.js';

const SUFFIX = `_t${Date.now()}`;

export async function createTestUser() {
  const username = `testuser${SUFFIX}`;
  const email = `testuser${SUFFIX}@test.local`;
  const crypto = await import('crypto');
  const passwordHash = crypto.createHash('md5').update('testpw').digest('hex');
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await pool.query(
    `INSERT INTO user (uuid, username, email, password, date_created, last_modified, last_login,
      is_active_flag, latitude, longitude, last_name, first_name, pmr_flag, permanent_login_flag,
      activation_code, description, node)
     VALUES (UUID(), ?, ?, ?, ?, ?, ?, 1, 0, 0, '', '', 0, 0, '', '', 4)`,
    [username, email, passwordHash, now, now, now]
  );

  const [[r]] = await pool.query('SELECT user_id, username FROM user WHERE username = ?', [username]);
  return { id: r.user_id, username: r.username, email };
}

export async function createTestCache(ownerId) {
  const wp = `OC${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}T`;
  const name = `Test Cache ${SUFFIX}`;
  const lat = 52.3759 + Math.random() * 0.1;
  const lon = 9.7320 + Math.random() * 0.1;

  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO caches (uuid, user_id, name, longitude, latitude, type, status, country,
        date_hidden, size, difficulty, terrain, node, date_created, last_modified,
        listing_last_modified, meta_last_modified, wp_gc, wp_gc_maintained, wp_nc,
        desc_languages, default_desclang, need_npa_recalc, flags_last_modified)
       VALUES (UUID(), ?, ?, ?, ?, 1, 1, 'DE', CURDATE(), 1, 2, 2, 4, NOW(), NOW(), NOW(), NOW(),
        '', '', '', '', '', 0, NOW())`,
      [ownerId, name, lon, lat]
    );
    const [[r]] = await conn.query('SELECT LAST_INSERT_ID() as id, wp_oc FROM caches WHERE cache_id=LAST_INSERT_ID()');

    await conn.query(
      `INSERT INTO cache_desc (uuid, cache_id, language, \`desc\`, hint, short_desc,
        date_created, last_modified, node)
       VALUES (UUID(), ?, 'EN', 'Test description', 'Test hint', 'Test short', NOW(), NOW(), 4)`,
      [r.id]
    );
    return { id: r.id, wp: r.wp_oc, lat, lon };
  } finally {
    conn.release();
  }
}

export async function cleanup(userId, cacheId) {
  if (cacheId) {
    await pool.query('DELETE FROM cache_logs WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM coordinates WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM caches_attributes WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM cache_desc WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM stat_caches WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM cache_location WHERE cache_id = ?', [cacheId]);
    await pool.query('DELETE FROM caches WHERE cache_id = ?', [cacheId]);
  }
  if (userId) {
    await pool.query('DELETE FROM sys_sessions WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM stat_user WHERE user_id = ?', [userId]);
    await pool.query('DELETE FROM user WHERE user_id = ?', [userId]);
  }
}

// Close the pool after all tests complete
export async function closePool() {
  await pool.end();
}
