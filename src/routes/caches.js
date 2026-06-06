const pool = require('../db');

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

    res.render('caches/new.njk', {
      types, sizes, countries, languages, attrs, wptTypes,
      editCache, editDesc, editAttribs, editNote, editWpts,
      form: {},
      errors: {},
    });
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
    const [cache] = await pool.query(
      `SELECT c.cache_id, c.wp_oc, c.name, c.latitude, c.longitude,
        c.difficulty / 2 AS difficulty, c.terrain / 2 AS terrain,
        c.country, c.date_hidden, c.date_created, c.wp_gc,
        c.type AS type_id, c.size AS size_id, c.status AS status_id,
        c.search_time, c.way_length,
        IF(c.logpw != '', 1, 0) AS logpw, c.logpw AS cache_logpw,
        ct.en AS type_name, cs.name AS size_name,
        u.user_id AS owner_id, u.username AS owner_name,
        IFNULL(sc.found, 0) AS find_count, IFNULL(sc.toprating, 0) AS rating_count
       FROM caches c
       JOIN cache_type ct ON c.type = ct.id
       JOIN cache_size cs ON c.size = cs.id
       JOIN user u ON c.user_id = u.user_id
       LEFT JOIN stat_caches sc ON c.cache_id = sc.cache_id
       WHERE c.wp_oc = ?`, [wp]
    );
    if (!cache) return res.status(404).json({ error: 'Cache not found' });

    const desc = await pool.query(
      `SELECT cd.desc, cd.hint, cd.short_desc FROM cache_desc cd
       WHERE cd.cache_id = ? ORDER BY cd.language = ? DESC LIMIT 1`,
      [cache.cache_id, 'EN']
    );

    const wpts = await pool.query(
      `SELECT co.latitude, co.longitude, co.description, ct.name AS type_name
       FROM coordinates co LEFT JOIN coordinates_type ct ON co.subtype = ct.id
       WHERE co.cache_id = ? AND co.type = 1 AND co.user_id IS NULL ORDER BY co.id`,
      [cache.cache_id]
    );

    const attrs = await pool.query(
      `SELECT ca.id, ca.name, ca.icon FROM caches_attributes cxa
       JOIN cache_attrib ca ON cxa.attrib_id = ca.id
       WHERE cxa.cache_id = ? ORDER BY ca.id`, [cache.cache_id]
    );

    const logs = await pool.query(
      `SELECT cl.id, cl.type, DATE_FORMAT(cl.date, '%Y-%m-%d') AS date, cl.text, u.username
       FROM cache_logs cl JOIN user u ON cl.user_id = u.user_id
       WHERE cl.cache_id = ? AND cl.gdpr_deletion = 0
       ORDER BY cl.date DESC LIMIT 30`, [cache.cache_id]
    );

    const userId = req.user.id;
    const [note] = userId ? await pool.query(
      'SELECT description, latitude, longitude, logpw FROM coordinates WHERE cache_id=? AND user_id=? AND type=2 ORDER BY id DESC LIMIT 1',
      [cache.cache_id, userId]
    ) : [null];

    res.json({
      cache, desc: desc[0] || null, waypoints: wpts, attributes: attrs,
      logs, noteRow: note || null,
      userId, userName: req.user.username,
      isOwner: userId > 0 && cache.owner_id === userId,
    });
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
