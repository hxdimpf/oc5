import pool from '../db.js';
import { fmtDate, decimalToDm, buildWaypointRow, LOG_TYPES, allowedLogTypes } from './shared.js';
import { ocGetLogsForCache } from './logs.js';
import { ocGetWaypointsByCacheId } from './waypoints.js';

// ── Shared cache summary SELECT (used by both search endpoints) ────────

const CACHE_SUMMARY_SELECT = `
  c.cache_id, c.wp_oc AS referenceCode, c.name,
  c.latitude AS listingLat, c.longitude AS listingLon,
  c.type AS typeId, ct.en AS typeName,
  c.size AS sizeId, cs.name AS sizeName,
  c.difficulty / 2 AS difficulty, c.terrain / 2 AS terrain,
  c.status, u.username AS ownerAlias, u.username AS ownerCode,
  c.user_id AS userId, c.date_created AS publishedDate,
  IFNULL(sc.toprating, 0) AS favoritePoints,
  IFNULL(sc.found, 0) AS findCount,
  IF(c.user_id = ?, 1, 0) AS isOwned,
  IF(fl.id IS NOT NULL, 1, 0) AS isFound,
  MAX(fl.date) AS foundDate,
  IF(pcn.id IS NOT NULL, 1, 0) AS hasPCN,
  IF(pcn.id IS NOT NULL AND (pcn.latitude != 0 OR pcn.longitude != 0), 1, 0) AS hasCC,
  pcn.latitude AS ccLat, pcn.longitude AS ccLon,
  pcn.description AS pcnText,
  IF(oc_only.cache_id IS NOT NULL, 1, 0) AS isOcOnly
  FROM caches c
  INNER JOIN cache_type ct ON c.type = ct.id
  INNER JOIN cache_size cs ON c.size = cs.id
  INNER JOIN user u ON c.user_id = u.user_id
  LEFT JOIN stat_caches sc ON c.cache_id = sc.cache_id
  LEFT JOIN caches_attributes oc_only ON oc_only.cache_id = c.cache_id AND oc_only.attrib_id = 6
  LEFT JOIN cache_logs fl ON fl.cache_id = c.cache_id AND fl.user_id = ? AND fl.type IN (1, 7)
  LEFT JOIN coordinates pcn ON pcn.cache_id = c.cache_id AND pcn.user_id = ? AND pcn.type = 2`;

const CACHE_BOUNDS_WHERE = `c.latitude > ? AND c.latitude < ?
        AND c.longitude > ? AND c.longitude < ?
        AND c.status IN (1, 2)
        AND c.difficulty >= ? AND c.difficulty <= ?`;

// ── Homepage counts ───────────────────────────────────────────────────

export async function ocGetCacheCounts() {
  const [[cacheRow], [logRow], [userRow]] = await Promise.all([
    pool.query('SELECT COUNT(*) as count FROM caches WHERE status = 1'),
    pool.query('SELECT COUNT(*) as count FROM cache_logs'),
    pool.query("SELECT COUNT(*) as count FROM user WHERE is_active_flag = 1"),
  ]);
  return {
    cacheCount: Number(cacheRow.count),
    logCount: Number(logRow.count),
    userCount: Number(userRow.count),
  };
}

// ── Search ────────────────────────────────────────────────────────────

export async function ocCountCachesInBounds(lat1, lat2, lon1, lon2, minDiff, maxDiff) {
  const [[row]] = await pool.query(
    `SELECT COUNT(*) as count FROM caches WHERE ${CACHE_BOUNDS_WHERE}`,
    [lat1, lat2, lon1, lon2, minDiff, maxDiff]
  );
  return Number(row.count);
}

export async function ocSearchCachesByBounds(bounds, userId = 0) {
  const { sLat, nLat, wLon, eLon, minDiff = 2, maxDiff = 10, maxItems = 5000 } = bounds;
  return pool.query(
    `SELECT ${CACHE_SUMMARY_SELECT}
     WHERE ${CACHE_BOUNDS_WHERE}
     GROUP BY c.cache_id ORDER BY c.cache_id LIMIT ?`,
    [userId, userId, userId, sLat, nLat, wLon, eLon, minDiff, maxDiff, maxItems]
  );
}

export async function ocSearchCachesByKeyword(q, type, minDiff, maxDiff, activeOnly, userId) {
  let sql = `SELECT c.wp_oc, c.name, c.type AS type_id, c.status,
      c.user_id AS owner_id, c.difficulty / 2 AS difficulty,
      c.terrain / 2 AS terrain, c.latitude, c.longitude,
      ct.name AS type_name, u.username, c.date_created
    FROM caches c
    INNER JOIN user u ON c.user_id = u.user_id
    LEFT JOIN cache_type ct ON c.type = ct.id
    WHERE c.difficulty >= ? AND c.difficulty <= ?`;
  const params = [minDiff, maxDiff];

  if (activeOnly) { sql += ' AND c.status = 1'; }
  if (type > 0) { sql += ' AND c.type = ?'; params.push(type); }
  if (q) {
    sql += ' AND (c.wp_oc = ? OR c.wp_gc = ? OR c.name LIKE ? OR u.username LIKE ?)';
    params.push(q, q, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY c.wp_oc ASC LIMIT 1000';
  return pool.query(sql, params);
}

// ── Cache detail (the big one — assembles cache + desc + attrs + logs + waypoints) ──

export async function ocGetCacheDetail(wp, userId) {
  const [c] = await pool.query(
    `SELECT c.cache_id, c.wp_oc, c.name, c.latitude, c.longitude,
      c.difficulty / 2 AS difficulty, c.terrain / 2 AS terrain,
      c.country, c.date_hidden, c.date_created, c.wp_gc,
      c.type AS type_id, c.size AS size_id, c.status AS status_id,
      c.search_time, c.way_length, c.needs_maintenance, c.listing_outdated,
      IF(c.logpw != '', 1, 0) AS logpw, c.logpw AS cache_logpw,
      ct.en AS type_name, ct.svg_name, cs.name AS size_name,
      cst.en AS status_name, co_name.name AS country_name,
      u.user_id AS owner_id, u.username AS owner_name,
      u.date_created AS owner_joined,
      IFNULL(sc.found, 0) AS find_count,
      IFNULL(sc.toprating, 0) AS rating_count,
      IF(c.user_id = ?, 1, 0) AS is_owned,
      IF(fl.id IS NOT NULL, 1, 0) AS is_found,
      MAX(fl.date) AS found_date,
      IF(pcn.id IS NOT NULL, 1, 0) AS has_pcn,
      IF(pcn.id IS NOT NULL AND (pcn.latitude != 0 OR pcn.longitude != 0), 1, 0) AS has_cc,
      pcn.latitude AS cc_lat, pcn.longitude AS cc_lon,
      IF(oc_only.cache_id IS NOT NULL, 1, 0) AS is_oc_only
     FROM caches c
     JOIN cache_type ct ON c.type = ct.id
     JOIN cache_size cs ON c.size = cs.id
     JOIN cache_status cst ON c.status = cst.id
     JOIN user u ON c.user_id = u.user_id
     LEFT JOIN stat_caches sc ON c.cache_id = sc.cache_id
     LEFT JOIN cache_logs fl ON fl.cache_id = c.cache_id AND fl.user_id = ? AND fl.type IN (1,7)
     LEFT JOIN coordinates pcn ON pcn.cache_id = c.cache_id AND pcn.user_id = ? AND pcn.type = 2
     LEFT JOIN caches_attributes oc_only ON oc_only.cache_id = c.cache_id AND oc_only.attrib_id = 6
     LEFT JOIN countries co_name ON c.country = co_name.short
     WHERE c.wp_oc = ? GROUP BY c.cache_id`,
    [userId, userId, userId, wp]
  );
  if (!c) return null;

  // Fetch related data in parallel
  const [desc, wptRows, attrs, logs, noteRows] = await Promise.all([
    pool.query(`SELECT * FROM cache_desc WHERE cache_id = ? ORDER BY id LIMIT 1`, [c.cache_id]),
    ocGetWaypointsByCacheId(c.cache_id),
    pool.query(
      `SELECT ca.id, ca.name, ca.icon FROM caches_attributes cxa
       JOIN cache_attrib ca ON cxa.attrib_id = ca.id
       WHERE cxa.cache_id = ? ORDER BY ca.id`,
      [c.cache_id]
    ),
    ocGetLogsForCache(c.cache_id),
    userId
      ? pool.query(
          `SELECT description, latitude, longitude, logpw FROM coordinates
           WHERE cache_id = ? AND user_id = ? AND type = 2 ORDER BY id DESC LIMIT 1`,
          [c.cache_id, userId]
        )
      : Promise.resolve([]),
  ]);

  const [[ownerStats]] = await pool.query(
    'SELECT IFNULL(found,0) AS found, IFNULL(hidden,0) AS hidden FROM stat_user WHERE user_id = ?',
    [c.owner_id]
  );
  const [[regionRow]] = await pool.query(
    'SELECT adm1 FROM cache_location WHERE cache_id = ?', [c.cache_id]
  );

  // Render description (markdown or HTML/BBCode)
  const d = desc[0];
  const shortHtml = d?.short_desc ? `<p><b>${d.short_desc}</b></p>` : '';
  let descriptionHtml = shortHtml + (d?.desc || '');
  if (d?.desc && !/<[a-z][\s\S]*>/i.test(d.desc) && !/\[(\/?(b|i|u|url|img|quote|color|size|list|table|center|font|code))[^\]]*\]/i.test(d.desc)) {
    try {
      const { marked } = await import('marked');
      descriptionHtml = shortHtml + marked.parse(d.desc, { html: false });
    } catch {}
  } else {
    try {
      const { sanitizeDescription: sd } = await import('../sanitize.mjs');
      descriptionHtml = sd('', shortHtml + (d?.desc || ''), c.wp_oc);
    } catch {}
  }

  // Compute DNF state from logs
  let isNotFound = false, dnfDateVal = null;
  if (userId) {
    for (const l of logs) {
      if (Number(l.userId) !== userId) continue;
      if (Number(l.type) === 2) { isNotFound = true; if (!dnfDateVal) dnfDateVal = l.date; break; }
    }
  }

  return {
    referenceCode: c.wp_oc, name: c.name,
    shortName: (c.name || '').length > 25 ? (c.name || '').slice(0, 25) + '…' : (c.name || ''),
    geocacheType: { id: c.type_id, name: c.type_name, svgName: c.svg_name },
    geocacheSize: { id: c.size_id, name: c.size_name },
    difficulty: Number(c.difficulty), terrain: Number(c.terrain),
    status: c.status_name || 'Active',
    lat: c.has_cc ? Number(c.cc_lat) : Number(c.latitude),
    lon: c.has_cc ? Number(c.cc_lon) : Number(c.longitude),
    wpGc: c.wp_gc || '', ownerCode: c.owner_name || '',
    logpw: c.cache_logpw || (noteRows[0]?.logpw) || '', requiresPasswd: !!c.logpw,
    searchTime: Number(c.search_time) || 0,
    owner: {
      userId: c.owner_id, username: c.owner_name,
      joinedDateFmt: fmtDate(c.owner_joined),
      findCount: ownerStats ? Number(ownerStats.found) : 0,
      hideCount: ownerStats ? Number(ownerStats.hidden) : 0,
      profileUrl: `/user/profile/${c.owner_id}`,
    },
    hints: d?.hint || '', descDarkUnsafe: d?.desc_dark_unsafe || false,
    sanitizedDescription: descriptionHtml,
    additionalWaypoints: wptRows,
    attributes: attrs.map(a => ({ ...a, imageUrl: a.icon ? `/images/attributes/${a.icon}.png` : '' })),
    logs: logs.map(l => ({
      id: Number(l.id), uuid: l.uuid, type: Number(l.type),
      typeName: LOG_TYPES[Number(l.type)] || String(l.type),
      date: l.date, username: l.username,
      text: l.text || '', textHtml: !!(l.text_html),
      itsMine: userId > 0 && Number(l.userId) === userId,
    })),
    _context: { userId, userName: 'hxdimpf', isOwner: !!c.is_owned },
    isOwned: !!c.is_owned, isFound: !!c.is_found,
    isDNF: !c.is_found && isNotFound,
    foundDate: c.found_date ? fmtDate(c.found_date) : null,
    foundDateFmt: c.found_date ? fmtDate(c.found_date) : '',
    dnfDate: dnfDateVal !== 'DNF' ? dnfDateVal : null,
    dnfDateFmt: dnfDateVal !== 'DNF' ? (dnfDateVal || '') : '',
    hasCC: !!c.has_cc, hasPCN: !!c.has_pcn,
    pcn: noteRows[0]?.description || null,
    findCount: Number(c.find_count), favoritePoints: Number(c.rating_count),
    isWatched: false, isCached: false, isGuessable: false, isPartial: false, isSelected: false,
    isFavorited: false, listingOutdated: !!(c.listing_outdated), needsMaintenance: !!(c.needs_maintenance),
    location: {
      country: c.country_name || c.country || '',
      state: regionRow?.adm1 || '',
      countryCode: c.country || '',
    },
    postedCoordinates: { latitude: Number(c.latitude), longitude: Number(c.longitude) },
    postedCoordsFmt: decimalToDm(Number(c.latitude), Number(c.longitude)),
    correctedCoordinates: c.has_cc ? { latitude: Number(c.cc_lat || 0), longitude: Number(c.cc_lon || 0) } : null,
    correctedCoordsFmt: c.has_cc ? decimalToDm(Number(c.cc_lat), Number(c.cc_lon)) : '',
    placedDateFmt: fmtDate(c.date_hidden),
    publishedDate: fmtDate(c.date_created), publishedDateFmt: fmtDate(c.date_created),
    isOcOnly: !!c.is_oc_only, isArchived: c.status_id === 3, isDisabled: c.status_id === 2,
    ianaTimezoneId: 'Europe/Berlin',
    logTypes: allowedLogTypes(c.type_id, userId > 0 && c.user_id === userId ? true : false, c.status_id),
  };
}

// ── Cache edit / write ────────────────────────────────────────────────

export async function ocGetCacheForEdit(wp, userId) {
  const [cache] = await pool.query('SELECT * FROM caches WHERE wp_oc = ?', [wp]);
  if (!cache || cache.user_id !== userId) return null;

  const [[desc], attrRows, [note], wpts] = await Promise.all([
    pool.query('SELECT * FROM cache_desc WHERE cache_id = ? ORDER BY id LIMIT 1', [cache.cache_id]),
    pool.query('SELECT attrib_id FROM caches_attributes WHERE cache_id = ?', [cache.cache_id]),
    pool.query(
      'SELECT description, latitude, longitude FROM coordinates WHERE cache_id = ? AND user_id = ? AND type = 2 ORDER BY id DESC LIMIT 1',
      [cache.cache_id, userId]
    ),
    pool.query(
      'SELECT id, subtype, latitude, longitude, description FROM coordinates WHERE cache_id = ? AND type = 1 AND user_id IS NULL ORDER BY id',
      [cache.cache_id]
    ),
  ]);

  return {
    cache,
    desc: desc || null,
    attribIds: attrRows.map(r => r.attrib_id),
    note: note || null,
    wpts,
  };
}

export async function ocInsertCache(data) {
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO caches (uuid, user_id, name, longitude, latitude, type, status, country,
        date_hidden, size, difficulty, terrain, node, date_created, last_modified,
        listing_last_modified, meta_last_modified, wp_gc, wp_gc_maintained, wp_nc,
        desc_languages, default_desclang, need_npa_recalc, flags_last_modified)
       VALUES (UUID(), ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 4, NOW(), NOW(), NOW(), NOW(),
        '', '', '', '', '', 0, NOW())`,
      [data.user_id, data.name, data.lon, data.lat, data.type || 1, data.country || 'DE',
       data.date_hidden || new Date().toISOString().slice(0, 10), data.size || 1,
       data.difficulty || 2, data.terrain || 2]
    );
    const [[r]] = await conn.query(
      'SELECT LAST_INSERT_ID() as id, (SELECT wp_oc FROM caches WHERE cache_id=LAST_INSERT_ID()) as wp_oc'
    );
    await conn.query(
      `INSERT INTO cache_desc (uuid, cache_id, language, \`desc\`, hint, short_desc, date_created, last_modified, node)
       VALUES (UUID(), ?, 'EN', ?, ?, ?, ?, ?, 4)`,
      [r.id, data.desc || '', data.hint || '', data.short_desc || '',
       new Date().toISOString().slice(0, 19).replace('T', ' ')]
    );
    return { id: r.id, wp_oc: r.wp_oc };
  } finally {
    conn.release();
  }
}

export async function ocUpdateCache(cacheId, userId, fields) {
  const [[existing]] = await pool.query('SELECT user_id, wp_oc FROM caches WHERE cache_id = ?', [cacheId]);
  if (!existing || existing.user_id !== userId) return null;

  const sets = [], vals = [];
  const fieldMap = { name: 1, type: 1, size: 1, country: 1, difficulty: 1, terrain: 1,
    logpw: 1, search_time: 1, way_length: 1, wp_gc: 1, date_hidden: 1,
    latitude: 1, longitude: 1 };

  for (const [k, v] of Object.entries(fields)) {
    if (fieldMap[k] && v !== undefined) { sets.push(`${k}=?`); vals.push(v); }
  }
  if (sets.length) { vals.push(cacheId); await pool.query(`UPDATE caches SET ${sets.join(',')} WHERE cache_id = ?`, vals); }

  if (fields.desc !== undefined || fields.hint !== undefined || fields.short_desc !== undefined) {
    const n = new Date().toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      'UPDATE cache_desc SET `desc`=?, hint=?, short_desc=?, last_modified=? WHERE cache_id=?',
      [fields.desc || '', fields.hint || '', fields.short_desc || '', n, cacheId]
    );
  }
  return existing.wp_oc;
}

// ── Ownership & status ────────────────────────────────────────────────

export async function ocGetCacheIdByWp(wp) {
  const [[r]] = await pool.query('SELECT cache_id FROM caches WHERE wp_oc = ?', [wp]);
  return r ? Number(r.cache_id) : null;
}

export async function ocIsCacheOwner(cacheId, userId) {
  const [[row]] = await pool.query('SELECT user_id FROM caches WHERE cache_id = ?', [cacheId]);
  return row && row.user_id === userId;
}

export async function ocGetCacheLogpw(cacheId) {
  const [[row]] = await pool.query('SELECT logpw FROM caches WHERE cache_id = ?', [cacheId]);
  return row ? (row.logpw || '') : '';
}

export async function ocUpdateCacheStatus(cacheId, statusId) {
  await pool.query('UPDATE caches SET status = ? WHERE cache_id = ?', [statusId, cacheId]);
}
