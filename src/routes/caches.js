const pool = require('../db');
const sanitizeDescription = null; // lazy-loaded from gcxm

function decimalToDm(lat, lon) {
  const ns = lat < 0 ? 'S' : 'N', ew = lon < 0 ? 'W' : 'E';
  const alat = Math.abs(lat), alon = Math.abs(lon);
  const latDeg = Math.floor(alat), lonDeg = Math.floor(alon);
  const latMin = (alat - latDeg) * 60, lonMin = (alon - lonDeg) * 60;
  return `${ns}${String(latDeg).padStart(2,'0')} ${latMin.toFixed(3).padStart(6,'0')} ${ew}${String(lonDeg).padStart(3,'0')} ${lonMin.toFixed(3).padStart(6,'0')}`;
}
function fmtDate(d) { return d ? new Date(d).toISOString().slice(0, 10) : ''; }
function fmtTime(hours) { const h = Math.floor(hours), m = Math.round((hours - h) * 60); return `${h}:${String(m).padStart(2,'0')}`; }

module.exports = {
  searchPage: async function (req, res) {
    const types = await pool.query(
      `SELECT ct.id, IFNULL(stt.text, ct.en) AS name
       FROM cache_type ct
       LEFT JOIN sys_trans st ON ct.trans_id = st.id
       LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
       ORDER BY ct.ordinal`,
      ['EN']
    );
    res.render('caches/search.njk', { types });
  },

  newCachePage: async function (req, res) {
    const locale = 'EN';
    const [types, sizes, countries] = await Promise.all([
      pool.query(
        `SELECT ct.id, IFNULL(stt.text, ct.en) AS name
         FROM cache_type ct LEFT JOIN sys_trans st ON ct.trans_id = st.id
         LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
         ORDER BY ct.ordinal`, [locale]),
      pool.query(
        `SELECT cs.id, IFNULL(stt.text, cs.name) AS name
         FROM cache_size cs LEFT JOIN sys_trans st ON cs.trans_id = st.id
         LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
         ORDER BY cs.ordinal`, [locale]),
      pool.query(
        `SELECT c.short, IFNULL(stt.text, c.name) AS name
         FROM countries c LEFT JOIN sys_trans st ON c.trans_id = st.id
         LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
         ORDER BY name`, [locale]),
    ]);

    const attrs = await pool.query(
      `SELECT ca.id, ca.name, ca.icon_undef, ca.icon_large, ca.group_id, ag.name AS group_name
       FROM cache_attrib ca JOIN attribute_groups ag ON ca.group_id = ag.id
       WHERE NOT IFNULL(ca.hidden, 0) AND ca.selectable != 0
       ORDER BY ag.category_id, ca.group_id, ca.id`
    );

    const wptTypes = await pool.query('SELECT id, name FROM coordinates_type ORDER BY id');
    const languages = await pool.query(
      `SELECT l.short, IFNULL(stt.text, l.name) AS name
       FROM languages l LEFT JOIN sys_trans st ON l.trans_id = st.id
       LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
       ORDER BY name`, [locale]
    );

    // Edit mode
    const editWp = (req.query.edit || '').toUpperCase();
    let editCache = null, editDesc = null, editAttribs = [], editNote = null, editWpts = [];
    if (editWp) {
      const [cache] = await pool.query('SELECT * FROM caches WHERE wp_oc = ?', [editWp]);
      if (cache && cache.user_id === req.user.id) {
        editCache = cache;
        [editDesc] = await pool.query('SELECT * FROM cache_desc WHERE cache_id = ? ORDER BY id LIMIT 1', [cache.cache_id]);
        const attrRows = await pool.query('SELECT attrib_id FROM caches_attributes WHERE cache_id = ?', [cache.cache_id]);
        editAttribs = attrRows.map(r => r.attrib_id);
        [editNote] = await pool.query(
          'SELECT description, latitude, longitude FROM coordinates WHERE cache_id = ? AND user_id = ? AND type = 2 ORDER BY id DESC LIMIT 1',
          [cache.cache_id, req.user.id]
        );
        editWpts = await pool.query(
          'SELECT id, subtype, latitude, longitude, description FROM coordinates WHERE cache_id = ? AND type = 1 AND user_id IS NULL ORDER BY id',
          [cache.cache_id]
        );
      } else {
        editCache = null;
      }
    }

    const editCoords = editCache ? decimalToDm(Number(editCache.latitude), Number(editCache.longitude)) : '';
    const editDateHidden = editCache && editCache.date_hidden ? fmtDate(editCache.date_hidden) : '';
    const fromLat = (req.query.lat || '').toString();
    const fromLon = (req.query.lon || '').toString();
    const fromCoords = fromLat && fromLon ? decimalToDm(parseFloat(fromLat), parseFloat(fromLon)) : '';

    const form = {
      name: editCache?.name || '',
      type: editCache?.type ? String(editCache.type) : '',
      size: editCache?.size ? String(editCache.size) : '',
      difficulty: editCache?.difficulty ? String(editCache.difficulty) : '',
      terrain: editCache?.terrain ? String(editCache.terrain) : '',
      coords: editCoords || fromCoords || '',
      country: editCache?.country || 'DE',
      search_time: editCache?.search_time || '',
      way_length: editCache?.way_length || '',
      wp_gc: editCache?.wp_gc || '',
      desc_lang: editDesc?.language || 'EN',
      short_desc: editDesc?.short_desc || '',
      desc: editDesc?.desc || '',
      hints: editDesc?.hint || '',
      hidden_date: editDateHidden || '',
      log_pw: editCache?.logpw || '',
      cache_note: editNote?.description || '',
      user_coords: editNote?.latitude ? decimalToDm(Number(editNote.latitude), Number(editNote.longitude)) : '',
      waypoints_json: editWpts?.length ? JSON.stringify(editWpts.map(w => ({id:w.id,type:w.subtype,coords:decimalToDm(Number(w.latitude),Number(w.longitude)),desc:w.description}))) : '[]',
      tos: true,
      selected_attribs: editAttribs?.length ? editAttribs : [],
      publish: editCache ? 'notnow' : 'now2',
      activate_date: '',
      activate_hour: '',
    };

    res.render('caches/new.njk', {
      types, sizes, countries, languages, attrs, wptTypes,
      editCache, editDesc, editAttribs, editNote, editWpts,
      editCoords: editCoords || fromCoords,
      editDateHidden,
      form: form || {},
      errors: {},
      is_edit: !!editCache,
      edit_cache_id: editCache?.cache_id || 0,
    });
  },

  newCacheSubmit: async function (req, res) {
    const { name, type, size, coords, country, difficulty, terrain, date_hidden, short_desc, desc, hint, edit_id } = req.body;
    const editId = parseInt(edit_id) || 0;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    let lat = null, lon = null;
    if (coords && coords.trim()) {
      const m = coords.match(/^([NS])\s*(\d+)\s+(\d+\.\d+)\s+([EW])\s*(\d+)\s+(\d+\.\d+)$/);
      if (m) {
        lat = parseInt(m[2]) + parseFloat(m[3]) / 60;
        lon = parseInt(m[5]) + parseFloat(m[6]) / 60;
        if (m[1] === 'S') lat = -lat;
        if (m[4] === 'W') lon = -lon;
      }
    }

    if (editId > 0) {
      // Edit existing cache
      const [existing] = await pool.query('SELECT user_id, wp_oc FROM caches WHERE cache_id=?', [editId]);
      if (!existing || existing.user_id !== req.user.id) return res.status(403).send('Not authorized');
      const fields = ['name', 'type', 'size', 'country', 'difficulty', 'terrain', 'logpw', 'search_time', 'way_length', 'wp_gc'];
      const sets = [], vals = [];
      for (const f of fields) if (req.body[f] !== undefined) { sets.push(`${f}=?`); vals.push(req.body[f]); }
      if (lat !== null) { sets.push('latitude=?'); vals.push(lat); sets.push('longitude=?'); vals.push(lon); }
      if (date_hidden) { sets.push('date_hidden=?'); vals.push(date_hidden); }
      vals.push(editId);
      if (sets.length) await pool.query(`UPDATE caches SET ${sets.join(',')} WHERE cache_id=?`, vals);
      if (desc || hint || short_desc) {
        await pool.query(`UPDATE cache_desc SET \`desc\`=?, hint=?, short_desc=?, last_modified=? WHERE cache_id=?`,
          [desc||'', hint||'', short_desc||'', now, editId]);
      }
      res.redirect(`/cache/${existing.wp_oc}`);
    } else {
      // New cache — coordinates required
      if (lat === null) return res.status(400).send('Invalid coordinates');
      await pool.query(
        `INSERT INTO caches (user_id, name, longitude, latitude, type, status, country, date_hidden, size, difficulty, terrain, node)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 4)`,
        [req.user.id, name, lon, lat, type||1, country||'DE', date_hidden||now.slice(0,10), size||1, difficulty||2, terrain||2]
      );
      const id = (await pool.query('SELECT LAST_INSERT_ID() as id'))[0].id;
      await pool.query(`INSERT INTO cache_desc (cache_id, language, \`desc\`, hint, short_desc, last_modified, node) VALUES (?,'EN',?,?,?,?,4)`,
        [id, desc||'', hint||'', short_desc||'', now]);
      const [wp] = await pool.query('SELECT wp_oc FROM caches WHERE cache_id=?', [id]);
      res.redirect(`/cache/${wp.wp_oc}`);
    }
  },

  detail: (req, res) => {
    res.render('caches/detail.njk', { wp: req.params.wp.toUpperCase() });
  },

  apiSearch: async function (req, res) {
    const q = (req.query.q || '').trim();
    const type = parseInt(req.query.type) || 0;
    const minDiff = Math.round((parseFloat(req.query.minDiff) || 1.0) * 2);
    const maxDiff = Math.round((parseFloat(req.query.maxDiff) || 5.0) * 2);
    const activeOnly = req.query.activeOnly !== '0';
    const userId = req.user.id;

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

    const rows = await pool.query(sql, params);

    const items = rows.map(r => ({
      referenceCode: r.wp_oc,
      name: r.name,
      shortName: r.name.length > 25 ? r.name.slice(0, 25) + '…' : r.name,
      lat: r.latitude, lon: r.longitude,
      geocacheType: { id: r.type_id, name: r.type_name || '' },
      difficulty: r.difficulty, terrain: r.terrain,
      ownerAlias: r.username,
      publishedDate: r.date_created ? new Date(r.date_created).toISOString().slice(0, 10) : '',
      platform: 'OC',
      isOwned: userId > 0 && r.owner_id === userId,
      isFound: false, isDNF: false, isCached: false,
      isDisabled: r.status === 2, isArchived: r.status === 3,
      hasCC: false, hasPCN: false, pcn: '',
      isOcOnly: false, isGuessable: false, isPartial: false, isSelected: false,
      favoritePoints: 0, status: r.status,
    }));

    res.json({ items });
  },

  waypoints: async function (req, res) {
    const wp = (req.query.wp || '').trim();
    if (!wp) return res.json({ wpts: [] });

    const rows = await pool.query(
      `SELECT co.latitude, co.longitude, co.description, co.subtype, ct.name AS type_name
       FROM coordinates co JOIN caches c ON co.cache_id = c.cache_id
       LEFT JOIN coordinates_type ct ON co.subtype = ct.id
       WHERE c.wp_oc = ? AND co.type = 1 AND co.user_id IS NULL ORDER BY co.id`,
      [wp]
    );

    const wpts = rows.map(r => ({
      lat: r.latitude, lon: r.longitude,
      name: r.type_name || 'Waypoint',
      description: r.description || '',
      subtype: r.subtype,
    }));

    res.json({ wpts });
  },

  apiDetail: async function (req, res) {
    const wp = req.params.wp.toUpperCase();
    const userId = req.user.id;

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
    if (!c) return res.status(404).json({ error: 'Cache not found' });

    const [desc, wpts, attrs, logs, noteRows] = await Promise.all([
      pool.query(`SELECT cd.desc, cd.hint, cd.short_desc, cd.desc_html, cd.desc_dark_unsafe
        FROM cache_desc cd WHERE cd.cache_id = ? ORDER BY cd.language = 'EN' DESC LIMIT 1`, [c.cache_id]),
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
    const [regionRow] = await pool.query(
      'SELECT adm1 FROM cache_location WHERE cache_id=?', [c.cache_id]
    );

    const data = {
      referenceCode: c.wp_oc,
      name: c.name,
      shortName: (c.name || '').length > 25 ? (c.name || '').slice(0, 25) + '…' : (c.name || ''),
      geocacheType: { id: c.type_id, name: c.type_name, svgName: c.svg_name },
      geocacheSize: { id: c.size_id, name: c.size_name },
      difficulty: Number(c.difficulty),
      terrain: Number(c.terrain),
      status: c.status_id,
      statusName: c.status_name,
      lat: c.has_cc && c.cc_lat ? Number(c.cc_lat) : Number(c.latitude),
      lon: c.has_cc && c.cc_lon ? Number(c.cc_lon) : Number(c.longitude),
      _origLat: Number(c.latitude),
      _origLon: Number(c.longitude),
      listingLat: Number(c.latitude),
      listingLon: Number(c.longitude),
      dateHidden: fmtDate(c.date_hidden),
      dateCreated: fmtDate(c.date_created),
      logpw: c.cache_logpw || (noteRows?.[0]?.logpw) || '',
      requiresPasswd: !!(c.logpw),
      searchTime: Number(c.search_time),
      wayLength: Number(c.way_length),
      country: c.country,
      wpGc: c.wp_gc || '',
      ownerCode: c.owner_name || '',
      owner: {
        id: c.owner_id,
        username: c.owner_name,
        joinedDate: fmtDate(c.owner_joined),
        joinedDateFmt: fmtDate(c.owner_joined),
        findCount: ownerStats ? Number(ownerStats.found) : 0,
        hideCount: ownerStats ? Number(ownerStats.hidden) : 0,
        profileUrl: `/user/profile/${c.owner_id}`,
      },
      desc: desc[0] ? {
        desc: desc[0].desc || '',
        hint: desc[0].hint || '',
        shortDesc: desc[0].short_desc || '',
        descHtml: !!desc[0].desc_html,
        descDarkUnsafe: !!desc[0].desc_dark_unsafe,
      } : null,
      hints: desc[0]?.hint || '',
      descDarkUnsafe: desc[0]?.desc_dark_unsafe || false,
      sanitizedDescription: (() => { try { const sd = desc[0]; const shortHtml = sd?.short_desc ? `<p><b>${sd.short_desc}</b></p>` : ''; const { sanitizeDescription } = require('../sanitize'); return sanitizeDescription('', shortHtml + (sd?.desc || ''), c.wp_oc); } catch { return (desc[0]?.desc || ''); } })(),
      shortDesc: desc[0]?.short_desc || '',
      additionalWaypoints: (wpts || []).map(w => {
        const lat = Number(w.latitude), lon = Number(w.longitude);
        const subtypeToPng = {1:'wp_parking.png',2:'wp_path.png',3:'wp_poi.png',4:'wp_reference.png',5:'wp_final.png',6:'wp_note.png'};
        return {
          latitude: lat, longitude: lon,
          location: `${lat}|${lon}`,
          description: w.description || '',
          typeId: w.type_id,
          type: w.type_name || '',
          name: w.type_name || 'Waypoint',
          type_name: w.type_name || '',
          typeName: w.type_name || '',
          icon: subtypeToPng[w.type_id] ? `/images/waypoints/${subtypeToPng[w.type_id]}` : '',
          myCoords: decimalToDm(lat, lon),
          prefix: (w.type_name || 'WP').substring(0, 2).toUpperCase(),
        };
      }),
      attributes: attrs.map(a => ({ ...a, imageUrl: a.icon ? `/images/attributes/${a.icon}.png` : '' })),
      logs: logs.map(l => ({
        id: l.id, type: l.type, date: l.date, text: l.text || '',
        username: l.username, userId: l.userId,
      })),
      noteRow: noteRows[0] || null,
      _context: {
        userId,
        userName: req.user.username,
        isOwner: !!c.is_owned,
      },
      isOwner: !!c.is_owned,
      isOwned: !!c.is_owned,
      isFound: !!c.is_found,
      foundDate: c.found_date ? fmtDate(c.found_date) : '',
      foundDateFmt: c.found_date ? fmtDate(c.found_date) : '',
      hasPCN: !!c.has_pcn,
      hasCC: !!c.has_cc,
      ccLat: c.cc_lat ? Number(c.cc_lat) : null,
      ccLon: c.cc_lon ? Number(c.cc_lon) : null,
      findCount: Number(c.find_count),
      ratingCount: Number(c.rating_count),
      isWatched: false,
      isRecommended: false,
      location: { country: c.country || '', state: regionRow?.adm1 || '' },
      postedCoordsFmt: decimalToDm(Number(c.latitude), Number(c.longitude)),
      correctedCoordsFmt: c.has_cc ? decimalToDm(Number(c.cc_lat), Number(c.cc_lon)) : '',
      placedDateFmt: fmtDate(c.date_hidden),
      publishedDate: fmtDate(c.date_created),
      publishedDateFmt: fmtDate(c.date_created),
      correctedCoordinates: c.has_cc ? decimalToDm(Number(c.cc_lat), Number(c.cc_lon)) : '',
      timeRequired: Number(c.search_time) > 0 ? fmtTime(Number(c.search_time)) : '',
      isOcOnly: !!c.is_oc_only,
      isArchived: c.status_id === 3,
      isDisabled: c.status_id === 2,
      isDNF: false,
      dnfDate: '',
      dnfDateFmt: '',
      isFavorited: false,
      favoritePoints: Number(c.rating_count),
      pcn: noteRows?.[0]?.description || '',
      listingOutdated: false,
      needsMaintenance: false,
      requiresPasswd: !!c.logpw,
      postedCoordinates: decimalToDm(Number(c.latitude), Number(c.longitude)),
      ianaTimezoneId: 'Europe/Berlin',
      logTypes: [],
    };

    res.json(data);
  },

  saveNote: async function (req, res) {
    const wp = req.params.wp.toUpperCase();
    const text = (req.body.text || '').trim();
    const userId = req.user.id;

    const [cache] = await pool.query('SELECT cache_id FROM caches WHERE wp_oc = ?', [wp]);
    if (!cache) return res.status(404).json({ error: 'Cache not found' });

    const [existing] = await pool.query(
      'SELECT id FROM coordinates WHERE cache_id=? AND user_id=? AND type=2 ORDER BY id DESC LIMIT 1',
      [cache.cache_id, userId]
    );

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    if (!text) {
      if (existing) await pool.query('DELETE FROM coordinates WHERE id=?', [existing.id]);
      return res.json({ saved: false });
    }

    if (existing) {
      await pool.query('UPDATE coordinates SET description=?, last_modified=? WHERE id=?', [text, now, existing.id]);
    } else {
      await pool.query(
        'INSERT INTO coordinates (cache_id, user_id, type, subtype, latitude, longitude, description, date_created, last_modified) VALUES (?,?,2,0,0,0,?,?,?)',
        [cache.cache_id, userId, text, now, now]
      );
    }
    res.json({ saved: true });
  },

  createLog: async function (req, res) {
    const wp = req.params.wp.toUpperCase();
    const { type, date, text } = req.body;
    const userId = req.user.id;

    const [cache] = await pool.query('SELECT cache_id FROM caches WHERE wp_oc = ?', [wp]);
    if (!cache) return res.status(404).json({ error: 'Cache not found' });

    const logDate = date && date.length === 10 ? date + ' 00:00:00' : date;

    await pool.query(
      'INSERT INTO cache_logs (node, cache_id, user_id, type, date, text, text_html, text_htmledit, picture, needs_maintenance, listing_outdated) VALUES (4, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)',
      [cache.cache_id, userId, type || 3, logDate, text || '']
    );

    const id = Number((await pool.query('SELECT LAST_INSERT_ID() as id'))[0].id);
    const [log] = await pool.query(
      "SELECT id, type, DATE_FORMAT(date, '%Y-%m-%d') AS date, text FROM cache_logs WHERE id=?", [id]
    );

    res.json({ saved: true, log });
  },
};
