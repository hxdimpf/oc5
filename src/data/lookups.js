import pool from '../db.js';

// ── Static / lookup data (rarely changes — cache in middleware) ────────

export async function ocGetCacheTypes(lang = 'EN') {
  return pool.query(
    `SELECT ct.id, IFNULL(stt.text, ct.en) AS name
     FROM cache_type ct
     LEFT JOIN sys_trans st ON ct.trans_id = st.id
     LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
     ORDER BY ct.ordinal`, [lang]
  );
}

export async function ocGetCacheSizes(lang = 'EN') {
  return pool.query(
    `SELECT cs.id, IFNULL(stt.text, cs.name) AS name
     FROM cache_size cs
     LEFT JOIN sys_trans st ON cs.trans_id = st.id
     LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
     ORDER BY cs.ordinal`, [lang]
  );
}

export async function ocGetCountries(lang = 'EN') {
  return pool.query(
    `SELECT c.short, IFNULL(stt.text, c.name) AS name
     FROM countries c
     LEFT JOIN sys_trans st ON c.trans_id = st.id
     LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
     ORDER BY name`, [lang]
  );
}

export async function ocGetLanguages(lang = 'EN') {
  return pool.query(
    `SELECT l.short, IFNULL(stt.text, l.name) AS name
     FROM languages l
     LEFT JOIN sys_trans st ON l.trans_id = st.id
     LEFT JOIN sys_trans_text stt ON st.id = stt.trans_id AND stt.lang = ?
     ORDER BY name`, [lang]
  );
}

export async function ocGetAllAttributes() {
  return (await pool.query(
    `SELECT ca.id, ca.name, ca.icon_undef, ca.icon_large, ca.group_id, ag.name AS group_name
     FROM cache_attrib ca
     JOIN attribute_groups ag ON ca.group_id = ag.id
     WHERE NOT IFNULL(ca.hidden, 0) AND ca.selectable != 0
     ORDER BY ag.category_id, ca.group_id, ca.id`
  )).map(a => ({
    ...a,
    icon_undef: a.icon_undef?.split('/').pop() || '',
    icon_large: a.icon_large?.split('/').pop() || '',
  }));
}

export async function ocGetWaypointTypes() {
  return pool.query('SELECT id, name FROM coordinates_type ORDER BY id');
}
