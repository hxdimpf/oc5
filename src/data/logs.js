import pool from '../db.js';

// ── Log CRUD ──────────────────────────────────────────────────────────

export async function ocGetLogById(logId) {
  const [log] = await pool.query(
    `SELECT cl.*, c.logpw AS cache_logpw, c.user_id AS cache_owner_id, c.wp_oc
     FROM cache_logs cl
     JOIN caches c ON cl.cache_id = c.cache_id
     WHERE cl.id = ?`,
    [logId]
  );
  return log || null;
}

export async function ocInsertLog(cacheId, userId, type, date, text) {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO cache_logs (uuid, node, cache_id, user_id, type, date, text,
        text_html, text_htmledit, picture, needs_maintenance, listing_outdated,
        date_created, entry_last_modified, last_modified, log_last_modified, order_date)
       VALUES (UUID(), 4, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, NOW(), NOW(), NOW(), NOW(), NOW())`,
      [cacheId, userId, type || 3, date, text || '']
    );
    const [r] = await conn.query('SELECT LAST_INSERT_ID() as id');
    const [log] = await conn.query(
      "SELECT id, type, DATE_FORMAT(date, '%Y-%m-%d') AS date, text FROM cache_logs WHERE id = ?",
      [r.id]
    );
    return log;
  } finally {
    conn.release();
  }
}

export async function ocUpdateLog(logId, userId, type, date, text) {
  const [log] = await pool.query('SELECT user_id FROM cache_logs WHERE id = ?', [logId]);
  if (!log || log.user_id !== userId) return { error: 'Not authorized', status: 403 };

  await pool.query(
    'UPDATE cache_logs SET type = ?, date = ?, text = ? WHERE id = ?',
    [type || 3, date, text || '', logId]
  );
  return { saved: true };
}

export async function ocDeleteLog(logId, userId) {
  const [log] = await pool.query('SELECT user_id FROM cache_logs WHERE id = ?', [logId]);
  if (!log || log.user_id !== userId) return { error: 'Not authorized', status: 403 };

  await pool.query('DELETE FROM cache_logs WHERE id = ?', [logId]);
  return { deleted: true };
}

export async function ocCountDuplicateLogs(cacheId, userId, type, excludeLogId) {
  const [row] = await pool.query(
    'SELECT COUNT(*) AS cnt FROM cache_logs WHERE cache_id = ? AND user_id = ? AND type = ? AND id != ?',
    [cacheId, userId, type, excludeLogId || 0]
  );
  return Number(row.cnt);
}

// ── Log list for cache detail ─────────────────────────────────────────

export async function ocGetLogsForCache(cacheId, limit = 30) {
  return pool.query(
    `SELECT cl.id, cl.uuid, cl.type, cl.text_html, DATE_FORMAT(cl.date, '%Y-%m-%d') AS date,
            cl.text, u.username, u.user_id AS userId
     FROM cache_logs cl
     JOIN user u ON cl.user_id = u.user_id
     WHERE cl.cache_id = ? AND cl.gdpr_deletion = 0
     ORDER BY cl.date DESC LIMIT ?`,
    [cacheId, limit]
  );
}
