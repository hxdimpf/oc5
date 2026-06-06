import pool from './db.js';

function decimalToDm(lat, lon) {
  const ns = lat < 0 ? 'S' : 'N', ew = lon < 0 ? 'W' : 'E';
  const alat = Math.abs(lat), alon = Math.abs(lon);
  const latDeg = Math.floor(alat), lonDeg = Math.floor(alon);
  const latMin = (alat - latDeg) * 60, lonMin = (alon - lonDeg) * 60;
  return `${ns}${String(latDeg).padStart(2,'0')} ${latMin.toFixed(3).padStart(6,'0')} ${ew}${String(lonDeg).padStart(3,'0')} ${lonMin.toFixed(3).padStart(6,'0')}`;
}

function fmtDate(d) { return d ? new Date(d).toISOString().slice(0, 10) : ''; }
function fmtTime(hours) { const h = Math.floor(hours), m = Math.round((hours - h) * 60); return `${h}:${String(m).padStart(2,'0')}`; }

// ── Homepage ──────────────────────────────────────────────────────────

export async function ocGetCacheCounts() {
  const [cacheRow, logRow, userRow] = await Promise.all([
    pool.query('SELECT COUNT(*) as count FROM caches WHERE status = 1'),
    pool.query('SELECT COUNT(*) as count FROM cache_logs'),
    pool.query("SELECT COUNT(*) as count FROM user WHERE is_active_flag = 1"),
  ]);
  return {
    cacheCount: Number(cacheRow[0].count),
    logCount: Number(logRow[0].count),
    userCount: Number(userRow[0].count),
  };
}

// ── Cache search (bounding box) ───────────────────────────────────────

export async function ocCountCachesInBounds(lat1, lat2, lon1, lon2, minDiff, maxDiff) {
  const [row] = await pool.query(
    `SELECT COUNT(*) as count FROM caches
     WHERE latitude > ? AND latitude < ?
       AND longitude > ? AND longitude < ?
       AND status IN (1, 2)
       AND difficulty >= ? AND difficulty <= ?`,
    [lat1, lat2, lon1, lon2, minDiff, maxDiff]
  );
  return Number(row.count);
}

export async function ocSearchCachesByBox(lat1, lat2, lon1, lon2, minDiff, maxDiff, userId, maxItems) {
  return pool.query(
    `SELECT
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
      IF(pcn.id IS NOT NULL AND pcn.latitude != 0 AND pcn.longitude != 0, 1, 0) AS hasCC,
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
     LEFT JOIN coordinates pcn ON pcn.cache_id = c.cache_id AND pcn.user_id = ? AND pcn.type = 2
     WHERE c.latitude > ? AND c.latitude < ?
       AND c.longitude > ? AND c.longitude < ?
       AND c.status IN (1, 2)
       AND c.difficulty >= ? AND c.difficulty <= ?
     GROUP BY c.cache_id ORDER BY c.cache_id
     LIMIT ?`,
    [userId, userId, userId, lat1, lat2, lon1, lon2, minDiff, maxDiff, maxItems]
  );
}

// ── Cache search (keyword) ────────────────────────────────────────────

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

  if (activeOnly) sql += ' AND c.status = 1';
  if (type > 0) { sql += ' AND c.type = ?'; params.push(type); }
  if (q) {
    sql += ' AND (c.wp_oc = ? OR c.wp_gc = ? OR c.name LIKE ? OR u.username LIKE ?)';
    params.push(q, q, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY c.wp_oc ASC LIMIT 1000';
  return pool.query(sql, params);
}

export async function ocGetCacheTypes(lang = 'EN') {
  return pool.query(
    `SELECT ct.id, IFNULL(stt.text, ct.en) AS name
     FROM cache_type ct
     LEFT JOIN sys_trans st ON ct.trans_id = st.id
     LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
     ORDER BY ct.ordinal`, [lang]
  );
}

// ── Cache detail ──────────────────────────────────────────────────────

export async function ocGetCacheDetail(wp, userId) {
  const [c] = await pool.query(
    `SELECT c.cache_id, c.wp_oc, c.name, c.latitude, c.longitude,
      c.difficulty / 2 AS difficulty, c.terrain / 2 AS terrain,
      c.country, c.date_hidden, c.date_created, c.wp_gc,
      c.type AS type_id, c.size AS size_id, c.status AS status_id,
      c.search_time, c.way_length,
      IF(c.logpw != '', 1, 0) AS logpw, c.logpw AS cache_logpw,
      ct.en AS type_name, ct.svg_name, cs.name AS size_name,
      cst.en AS status_name,
      u.user_id AS owner_id, u.username AS owner_name,
      u.date_created AS owner_joined,
      IFNULL(sc.found, 0) AS find_count,
      IFNULL(sc.toprating, 0) AS rating_count,
      IF(c.user_id = ?, 1, 0) AS is_owned,
      IF(fl.id IS NOT NULL, 1, 0) AS is_found,
      MAX(fl.date) AS found_date,
      IF(pcn.id IS NOT NULL, 1, 0) AS has_pcn,
      IF(pcn.id IS NOT NULL AND pcn.latitude != 0 AND pcn.longitude != 0, 1, 0) AS has_cc,
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
     WHERE c.wp_oc = ? GROUP BY c.cache_id`,
    [userId, userId, userId, wp]
  );
  if (!c) return null;

  const [desc, wpts, attrs, logs, noteRows] = await Promise.all([
    pool.query(`SELECT * FROM cache_desc WHERE cache_id = ? ORDER BY id LIMIT 1`, [c.cache_id]),
    pool.query(`SELECT co.latitude, co.longitude, co.description, co.subtype AS type_id,
      ct.name AS type_name FROM coordinates co
      LEFT JOIN coordinates_type ct ON co.subtype = ct.id
      WHERE co.cache_id = ? AND co.type = 1 AND co.user_id IS NULL ORDER BY co.id`, [c.cache_id]),
    pool.query(`SELECT ca.id, ca.name, ca.icon FROM caches_attributes cxa
      JOIN cache_attrib ca ON cxa.attrib_id = ca.id
      WHERE cxa.cache_id = ? ORDER BY ca.id`, [c.cache_id]),
    pool.query(`SELECT cl.id, cl.type, DATE_FORMAT(cl.date, '%Y-%m-%d') AS date,
      cl.text, u.username, u.user_id AS userId
      FROM cache_logs cl JOIN user u ON cl.user_id = u.user_id
      WHERE cl.cache_id = ? AND cl.gdpr_deletion = 0
      ORDER BY cl.date DESC LIMIT 30`, [c.cache_id]),
    userId ? pool.query(`SELECT description, latitude, longitude, logpw FROM coordinates
      WHERE cache_id=? AND user_id=? AND type=2 ORDER BY id DESC LIMIT 1`, [c.cache_id, userId]) : Promise.resolve([]),
  ]);

  const [ownerStats] = await pool.query(
    'SELECT IFNULL(found,0) AS found, IFNULL(hidden,0) AS hidden FROM stat_user WHERE user_id=?', [c.owner_id]
  );
  const [regionRow] = await pool.query('SELECT adm1 FROM cache_location WHERE cache_id=?', [c.cache_id]);

  const wpArr = (wpts || []).map(w => ({ latitude: Number(w.latitude), longitude: Number(w.longitude), description: w.description||'', typeId: w.type_id, type: w.type_name||'', name: w.type_name||'Waypoint', type_name: w.type_name||'', typeName: w.type_name||'', location: `${w.latitude}|${w.longitude}`,
    icon: ({1:'wp_parking.png',2:'wp_path.png',3:'wp_poi.png',4:'wp_reference.png',5:'wp_final.png',6:'wp_note.png'})[w.type_id] ? `/images/waypoints/${({1:'wp_parking.png',2:'wp_path.png',3:'wp_poi.png',4:'wp_reference.png',5:'wp_final.png',6:'wp_note.png'})[w.type_id]}` : '',
    myCoords: decimalToDm(Number(w.latitude), Number(w.longitude)),
    prefix: (w.type_name||'WP').substring(0,2).toUpperCase() }));

  const d = desc[0];
  const shortHtml = d?.short_desc ? `<p><b>${d.short_desc}</b></p>` : '';
  let sanitizedDescription = shortHtml + (d?.desc || '');
  try { const { sanitizeDescription: sd } = await import('../sanitize.mjs'); sanitizedDescription = sd('', shortHtml + (d?.desc||''), c.wp_oc); } catch {}

  return {
    referenceCode: c.wp_oc, name: c.name,
    shortName: (c.name||'').length > 25 ? (c.name||'').slice(0,25)+'…' : (c.name||''),
    geocacheType: { id: c.type_id, name: c.type_name, svgName: c.svg_name },
    geocacheSize: { id: c.size_id, name: c.size_name },
    difficulty: Number(c.difficulty), terrain: Number(c.terrain),
    status: c.status_id, statusName: c.status_name,
    lat: c.has_cc && c.cc_lat ? Number(c.cc_lat) : Number(c.latitude),
    lon: c.has_cc && c.cc_lon ? Number(c.cc_lon) : Number(c.longitude),
    _origLat: Number(c.latitude), _origLon: Number(c.longitude),
    listingLat: Number(c.latitude), listingLon: Number(c.longitude),
    dateHidden: fmtDate(c.date_hidden), dateCreated: fmtDate(c.date_created),
    logpw: c.cache_logpw || (noteRows[0]?.logpw) || '', requiresPasswd: !!c.logpw,
    searchTime: Number(c.search_time), wayLength: Number(c.way_length),
    country: c.country, wpGc: c.wp_gc || '',
    ownerCode: c.owner_name || '',
    owner: { id: c.owner_id, username: c.owner_name, joinedDate: fmtDate(c.owner_joined), joinedDateFmt: fmtDate(c.owner_joined),
      findCount: ownerStats ? Number(ownerStats.found) : 0, hideCount: ownerStats ? Number(ownerStats.hidden) : 0, profileUrl: `/user/profile/${c.owner_id}` },
    desc: d ? { desc: d.desc||'', hint: d.hint||'', shortDesc: d.short_desc||'', descHtml: !!d.desc_html, descDarkUnsafe: !!d.desc_dark_unsafe } : null,
    hints: d?.hint || '', descDarkUnsafe: d?.desc_dark_unsafe || false,
    sanitizedDescription, shortDesc: d?.short_desc || '',
    waypoints: wpArr, additionalWaypoints: wpArr,
    attributes: attrs.map(a => ({ ...a, imageUrl: a.icon ? `/images/attributes/${a.icon}.png` : '' })),
    logs: logs.map(l => ({ id: l.id, type: l.type, date: l.date, text: l.text||'', username: l.username, userId: l.userId })),
    noteRow: noteRows[0] || null,
    _context: { userId, userName: 'hxdimpf', isOwner: !!c.is_owned },
    isOwner: !!c.is_owned, isOwned: !!c.is_owned, isFound: !!c.is_found,
    foundDate: c.found_date ? fmtDate(c.found_date) : '', foundDateFmt: c.found_date ? fmtDate(c.found_date) : '',
    hasPCN: !!c.has_pcn, hasCC: !!c.has_cc,
    ccLat: c.cc_lat ? Number(c.cc_lat) : null, ccLon: c.cc_lon ? Number(c.cc_lon) : null,
    findCount: Number(c.find_count), ratingCount: Number(c.rating_count),
    isWatched: false, isRecommended: false,
    location: { country: c.country||'', state: regionRow?.adm1||'' },
    postedCoordsFmt: decimalToDm(Number(c.latitude), Number(c.longitude)),
    correctedCoordsFmt: c.has_cc ? decimalToDm(Number(c.cc_lat), Number(c.cc_lon)) : '',
    placedDateFmt: fmtDate(c.date_hidden), publishedDate: fmtDate(c.date_created), publishedDateFmt: fmtDate(c.date_created),
    correctedCoordinates: c.has_cc ? decimalToDm(Number(c.cc_lat), Number(c.cc_lon)) : '',
    timeRequired: Number(c.search_time)>0 ? fmtTime(Number(c.search_time)) : '',
    isOcOnly: !!c.is_oc_only, isArchived: c.status_id===3, isDisabled: c.status_id===2,
    isDNF: false, dnfDate: '', dnfDateFmt: '', isFavorited: false,
    favoritePoints: Number(c.rating_count), pcn: noteRows[0]?.description||'',
    listingOutdated: false, needsMaintenance: false,
    postedCoordinates: decimalToDm(Number(c.latitude), Number(c.longitude)),
    ianaTimezoneId: 'Europe/Berlin', logTypes: [],
  };
}

// ── Cache write ───────────────────────────────────────────────────────

export async function ocGetCacheForEdit(wp, userId) {
  const [cache] = await pool.query('SELECT * FROM caches WHERE wp_oc = ?', [wp]);
  if (!cache || cache.user_id !== userId) return null;
  const [desc] = await pool.query('SELECT * FROM cache_desc WHERE cache_id = ? ORDER BY id LIMIT 1', [cache.cache_id]);
  const attrRows = await pool.query('SELECT attrib_id FROM caches_attributes WHERE cache_id = ?', [cache.cache_id]);
  const [note] = await pool.query('SELECT description, latitude, longitude FROM coordinates WHERE cache_id = ? AND user_id = ? AND type = 2 ORDER BY id DESC LIMIT 1', [cache.cache_id, userId]);
  const wpts = await pool.query('SELECT id, subtype, latitude, longitude, description FROM coordinates WHERE cache_id = ? AND type = 1 AND user_id IS NULL ORDER BY id', [cache.cache_id]);
  return { cache, desc: desc || null, attribIds: attrRows.map(r => r.attrib_id), note: note || null, wpts };
}

export async function ocInsertCache(data) {
  await pool.query(`INSERT INTO caches (user_id, name, longitude, latitude, type, status, country, date_hidden, size, difficulty, terrain, node)
    VALUES (?,?,?,?,?,1,?,?,?,?,?,4)`,
    [data.user_id, data.name, data.lon, data.lat, data.type||1, data.country||'DE', data.date_hidden||new Date().toISOString().slice(0,10), data.size||1, data.difficulty||2, data.terrain||2]);
  const [r] = await pool.query('SELECT LAST_INSERT_ID() as id, (SELECT wp_oc FROM caches WHERE cache_id=LAST_INSERT_ID()) as wp_oc');
  await pool.query(`INSERT INTO cache_desc (cache_id, language, \`desc\`, hint, short_desc, last_modified, node) VALUES (?,'EN',?,?,?,?,4)`,
    [r.id, data.desc||'', data.hint||'', data.short_desc||'', new Date().toISOString().slice(0,19).replace('T',' ')]);
  return { id: r.id, wp_oc: r.wp_oc };
}

export async function ocUpdateCache(cacheId, userId, fields) {
  const [existing] = await pool.query('SELECT user_id, wp_oc FROM caches WHERE cache_id=?', [cacheId]);
  if (!existing || existing.user_id !== userId) return null;
  const sets = [], vals = [];
  const fieldMap = { name:1, type:1, size:1, country:1, difficulty:1, terrain:1, logpw:1, search_time:1, way_length:1, wp_gc:1, date_hidden:1, latitude:1, longitude:1 };
  for (const [k, v] of Object.entries(fields)) { if (fieldMap[k] && v !== undefined) { sets.push(`${k}=?`); vals.push(v); } }
  if (sets.length) { vals.push(cacheId); await pool.query(`UPDATE caches SET ${sets.join(',')} WHERE cache_id=?`, vals); }
  if (fields.desc !== undefined || fields.hint !== undefined || fields.short_desc !== undefined) {
    const now = new Date().toISOString().slice(0,19).replace('T',' ');
    await pool.query(`UPDATE cache_desc SET \`desc\`=?, hint=?, short_desc=?, last_modified=? WHERE cache_id=?`,
      [fields.desc||'', fields.hint||'', fields.short_desc||'', now, cacheId]);
  }
  return existing.wp_oc;
}

export async function ocSaveCacheNote(cacheId, userId, text) {
  const [existing] = await pool.query('SELECT id FROM coordinates WHERE cache_id=? AND user_id=? AND type=2 ORDER BY id DESC LIMIT 1', [cacheId, userId]);
  const now = new Date().toISOString().slice(0,19).replace('T',' ');
  if (!text) { if (existing) await pool.query('DELETE FROM coordinates WHERE id=?', [existing.id]); return { saved: false }; }
  if (existing) await pool.query('UPDATE coordinates SET description=?, last_modified=? WHERE id=?', [text, now, existing.id]);
  else await pool.query('INSERT INTO coordinates (cache_id, user_id, type, subtype, latitude, longitude, description, date_created, last_modified) VALUES (?,?,2,0,0,0,?,?,?)', [cacheId, userId, text, now, now]);
  return { saved: true };
}

export async function ocInsertLog(cacheId, userId, type, date, text) {
  await pool.query('INSERT INTO cache_logs (node, cache_id, user_id, type, date, text, text_html, text_htmledit, picture, needs_maintenance, listing_outdated) VALUES (4,?,?,?,?,?,0,0,0,0,0)', [cacheId, userId, type||3, date, text||'']);
  const [r] = await pool.query('SELECT LAST_INSERT_ID() as id');
  const [log] = await pool.query("SELECT id, type, DATE_FORMAT(date, '%Y-%m-%d') AS date, text FROM cache_logs WHERE id=?", [r.id]);
  return log;
}

export async function ocGetCacheWaypoints(wp) {
  return pool.query(`SELECT co.latitude, co.longitude, co.description, co.subtype, ct.name AS type_name
    FROM coordinates co JOIN caches c ON co.cache_id = c.cache_id
    LEFT JOIN coordinates_type ct ON co.subtype = ct.id
    WHERE c.wp_oc = ? AND co.type = 1 AND co.user_id IS NULL ORDER BY co.id`, [wp]);
}

export async function ocGetCacheIdByWp(wp) {
  const [r] = await pool.query('SELECT cache_id FROM caches WHERE wp_oc = ?', [wp]);
  return r ? Number(r.cache_id) : null;
}

// ── Cache lookup tables ───────────────────────────────────────────────

export async function ocGetCacheSizes(locale) {
  return pool.query(`SELECT cs.id, IFNULL(stt.text, cs.name) AS name FROM cache_size cs LEFT JOIN sys_trans st ON cs.trans_id = st.id LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ? ORDER BY cs.ordinal`, [locale]);
}

export async function ocGetCountries(locale) {
  return pool.query(`SELECT c.short, IFNULL(stt.text, c.name) AS name FROM countries c LEFT JOIN sys_trans st ON c.trans_id = st.id LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ? ORDER BY name`, [locale]);
}

export async function ocGetLanguages(locale) {
  return pool.query(`SELECT l.short, IFNULL(stt.text, l.name) AS name FROM languages l LEFT JOIN sys_trans st ON l.trans_id = st.id LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ? ORDER BY name`, [locale]);
}

export async function ocGetAllAttributes() {
  return (await pool.query(`SELECT ca.id, ca.name, ca.icon_undef, ca.icon_large, ca.group_id, ag.name AS group_name
    FROM cache_attrib ca JOIN attribute_groups ag ON ca.group_id = ag.id
    WHERE NOT IFNULL(ca.hidden, 0) AND ca.selectable != 0
    ORDER BY ag.category_id, ca.group_id, ca.id`)).map(a => ({ ...a, icon_undef: a.icon_undef?.split('/').pop()||'', icon_large: a.icon_large?.split('/').pop()||'' }));
}

export async function ocGetWaypointTypes() {
  return pool.query('SELECT id, name FROM coordinates_type ORDER BY id');
}

// ── User ──────────────────────────────────────────────────────────────

export async function ocSearchUsers(q) {
  return pool.query(`SELECT u.user_id, u.username, IFNULL(s.found,0) AS find_count, IFNULL(s.hidden,0) AS hide_count
    FROM user u LEFT JOIN stat_user s ON u.user_id = s.user_id
    WHERE u.username LIKE ? ORDER BY u.username ASC LIMIT 20`, [`%${q}%`]);
}

export async function ocGetUserProfile(userId) {
  const [user] = await pool.query('SELECT * FROM user WHERE user_id = ?', [userId]);
  if (!user) return null;
  const [stats] = await pool.query('SELECT IFNULL(found,0) AS findCount, IFNULL(hidden,0) AS hideCount FROM stat_user WHERE user_id = ?', [userId]);
  if (stats) { user.findCount = Number(stats.findCount); user.hideCount = Number(stats.hideCount); }
  return user;
}
