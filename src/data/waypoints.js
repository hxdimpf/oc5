import pool from '../db.js';
import { buildWaypointRow, waypointIcon, now } from './shared.js';

// ── Owner waypoints (type=1) ──────────────────────────────────────────

export async function ocGetWaypointsByCacheId(cacheId) {
  const rows = await pool.query(
    `SELECT co.latitude, co.longitude, co.description, co.subtype AS type_id,
            ct.name AS type_name
     FROM coordinates co
     LEFT JOIN coordinates_type ct ON co.subtype = ct.id
     WHERE co.cache_id = ? AND co.type = 1 AND co.user_id IS NULL
     ORDER BY co.id`,
    [cacheId]
  );
  return rows.map(buildWaypointRow);
}

export async function ocGetWaypointsByWp(wp) {
  const rows = await pool.query(
    `SELECT co.latitude, co.longitude, co.description, co.subtype AS type_id,
            ct.name AS type_name
     FROM coordinates co
     JOIN caches c ON co.cache_id = c.cache_id
     LEFT JOIN coordinates_type ct ON co.subtype = ct.id
     WHERE c.wp_oc = ? AND co.type = 1 AND co.user_id IS NULL
     ORDER BY co.id`,
    [wp]
  );
  return rows.map(buildWaypointRow);
}

export async function ocGetWaypointsForEdit(cacheId) {
  return pool.query(
    `SELECT id, subtype, latitude, longitude, description
     FROM coordinates
     WHERE cache_id = ? AND type = 1 AND user_id IS NULL
     ORDER BY id`,
    [cacheId]
  );
}

// Replace all owner waypoints (DELETE + INSERT in transaction-safe order)
export async function ocReplaceWaypoints(cacheId, waypoints) {
  await pool.query(
    'DELETE FROM coordinates WHERE cache_id = ? AND type = 1 AND user_id IS NULL',
    [cacheId]
  );
  for (const w of waypoints) {
    await pool.query(
      `INSERT INTO coordinates (date_created, last_modified, type, subtype, latitude, longitude, cache_id, description)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [now(), now(), w.subtype || 1, w.latitude || 0, w.longitude || 0, cacheId, (w.description || '').substring(0, 80)]
    );
  }
}

// ── User notes, coords & log passwords (type=2) ───────────────────────

export async function ocGetUserNote(cacheId, userId) {
  const [row] = await pool.query(
    `SELECT id, description, latitude, longitude, logpw
     FROM coordinates
     WHERE cache_id = ? AND user_id = ? AND type = 2
     ORDER BY id DESC LIMIT 1`,
    [cacheId, userId]
  );
  return row || null;
}

export async function ocSaveUserNoteText(cacheId, userId, text) {
  const existing = await ocGetUserNote(cacheId, userId);
  if (!text) {
    if (existing) await pool.query('DELETE FROM coordinates WHERE id = ?', [existing.id]);
    return { saved: false };
  }
  if (existing) {
    await pool.query('UPDATE coordinates SET description = ?, last_modified = ? WHERE id = ?', [text, now(), existing.id]);
  } else {
    await pool.query(
      `INSERT INTO coordinates (cache_id, user_id, type, subtype, latitude, longitude, description, date_created, last_modified)
       VALUES (?, ?, 2, 0, 0, 0, ?, ?, ?)`,
      [cacheId, userId, text, now(), now()]
    );
  }
  return { saved: true };
}

export async function ocSaveUserCoords(cacheId, userId, lat, lon) {
  const existing = await ocGetUserNote(cacheId, userId);
  if (existing) {
    await pool.query(
      'UPDATE coordinates SET latitude = ?, longitude = ?, last_modified = ? WHERE id = ?',
      [lat, lon, now(), existing.id]
    );
  } else {
    await pool.query(
      `INSERT INTO coordinates (cache_id, user_id, type, subtype, latitude, longitude, description, date_created, last_modified)
       VALUES (?, ?, 2, 0, ?, ?, '', ?, ?)`,
      [cacheId, userId, lat, lon, now(), now()]
    );
  }
  return { saved: true };
}

export async function ocSaveLogPassword(cacheId, userId, logpw) {
  const existing = await ocGetUserNote(cacheId, userId);
  if (existing) {
    await pool.query('UPDATE coordinates SET logpw = ?, last_modified = ? WHERE id = ?', [logpw || '', now(), existing.id]);
  } else {
    await pool.query(
      `INSERT INTO coordinates (cache_id, user_id, type, subtype, latitude, longitude, description, logpw, date_created, last_modified)
       VALUES (?, ?, 2, 0, 0, 0, '', ?, ?, ?)`,
      [cacheId, userId, logpw || '', now(), now()]
    );
  }
  return { saved: true };
}
