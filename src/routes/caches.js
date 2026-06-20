import { ocGetCacheTypes, ocGetCacheSizes, ocGetCountries, ocGetLanguages, ocGetAllAttributes, ocGetWaypointTypes,
  ocGetCacheForEdit, ocInsertCache, ocUpdateCache, ocSaveCacheNote, ocInsertLog,
  ocGetCacheDetail, ocGetCacheWaypoints, ocGetCacheIdByWp, ocSearchCachesByKeyword } from '../ocapi.js';

function decimalToDm(lat, lon) {
  const ns = lat < 0 ? 'S' : 'N', ew = lon < 0 ? 'W' : 'E';
  const alat = Math.abs(lat), alon = Math.abs(lon);
  const latDeg = Math.floor(alat), lonDeg = Math.floor(alon);
  const latMin = (alat - latDeg) * 60, lonMin = (alon - lonDeg) * 60;
  return `${ns}${String(latDeg).padStart(2,'0')} ${latMin.toFixed(3).padStart(6,'0')} ${ew}${String(lonDeg).padStart(3,'0')} ${lonMin.toFixed(3).padStart(6,'0')}`;
}

export async function searchPage(req, res) {
  const types = await ocGetCacheTypes();
  res.render('caches/search.njk', { types });
}

export async function newCachePage(req, res) {
  const locale = 'EN';
  const [types, sizes, countries] = await Promise.all([ocGetCacheTypes(locale), ocGetCacheSizes(locale), ocGetCountries(locale)]);
  const [attrs, wptTypes, languages] = await Promise.all([ocGetAllAttributes(), ocGetWaypointTypes(), ocGetLanguages(locale)]);

  const editWp = (req.query.edit || '').toUpperCase();
  let editCache = null, editDesc = null, editAttribs = [], editNote = null, editWpts = [];
  let editCoords = '', editDateHidden = '';

  if (editWp) {
    const editData = await ocGetCacheForEdit(editWp, req.user.id);
    if (editData) {
      editCache = editData.cache; editDesc = editData.desc; editAttribs = editData.attribIds;
      editNote = editData.note; editWpts = editData.wpts;
      editCoords = decimalToDm(Number(editCache.latitude), Number(editCache.longitude));
      editDateHidden = editCache.date_hidden ? new Date(editCache.date_hidden).toISOString().slice(0,10) : '';
    }
  }

  const fromLat = (req.query.lat || ''), fromLon = (req.query.lon || '');
  const fromCoords = fromLat && fromLon ? decimalToDm(parseFloat(fromLat), parseFloat(fromLon)) : '';

  const form = {
    name: editCache?.name || '', type: editCache?.type ? String(editCache.type) : '',
    size: editCache?.size ? String(editCache.size) : '', difficulty: editCache?.difficulty ? String(editCache.difficulty) : '',
    terrain: editCache?.terrain ? String(editCache.terrain) : '', coords: editCoords || fromCoords || '',
    country: editCache?.country || 'DE', search_time: editCache?.search_time || '', way_length: editCache?.way_length || '',
    wp_gc: editCache?.wp_gc || '', desc_lang: editDesc?.language || 'EN',
    short_desc: editDesc?.short_desc || '', desc: editDesc?.desc || '', hints: editDesc?.hint || '',
    hidden_date: editDateHidden, log_pw: editCache?.logpw || '',
    cache_note: editNote?.description || '',
    user_coords: editNote?.latitude ? decimalToDm(Number(editNote.latitude), Number(editNote.longitude)) : '',
    waypoints_json: editWpts?.length ? JSON.stringify(editWpts.map(w => ({id:w.id,type:w.subtype,coords:decimalToDm(Number(w.latitude),Number(w.longitude)),desc:w.description}))) : '[]',
    tos: true, selected_attribs: editAttribs?.length ? editAttribs : [],
    publish: editCache ? 'notnow' : 'now2', activate_date: '', activate_hour: '',
  };

  res.render('caches/new.njk', { types, sizes, countries, languages, attrs, wptTypes, editCache, editDesc, editAttribs, editNote, editWpts, editCoords: editCoords||fromCoords, editDateHidden, form, errors: {}, is_edit: !!editCache, edit_cache_id: editCache?.cache_id||0 });
}

export async function newCacheSubmit(req, res) {
  const { name, type, size, coords, country, difficulty, terrain, date_hidden, short_desc, desc, hint, edit_id } = req.body;
  const editId = parseInt(edit_id) || 0;

  let lat = null, lon = null;
  if (coords && coords.trim()) {
    const m = coords.match(/^([NS])\s*(\d+)\s+(\d+\.\d+)\s+([EW])\s*(\d+)\s+(\d+\.\d+)$/);
    if (m) { lat = parseInt(m[2])+parseFloat(m[3])/60; lon = parseInt(m[5])+parseFloat(m[6])/60; if (m[1]==='S') lat=-lat; if (m[4]==='W') lon=-lon; }
  }

  if (editId) {
    const wp = await ocUpdateCache(editId, req.user.id, { name, type, size, country, difficulty, terrain, date_hidden, desc, hint, short_desc, latitude: lat, longitude: lon });
    if (!wp) return res.status(403).send('Not authorized');
    res.redirect(`/cache/${wp}`);
  } else {
    if (lat===null) return res.status(400).send('Invalid coordinates');
    const result = await ocInsertCache({ user_id: req.user.id, name, lon, lat, type, country, date_hidden, size, difficulty, terrain, desc, hint, short_desc });
    res.redirect(`/cache/${result.wp_oc}`);
  }
}

export function detail(req, res) {
  res.render('caches/detail.njk', { wp: req.params.wp.toUpperCase() });
}

export async function apiSearch(req, res) {
  const q = (req.query.q||'').trim(), type = parseInt(req.query.type)||0;
  const minDiff = Math.round((parseFloat(req.query.minDiff)||1)*2), maxDiff = Math.round((parseFloat(req.query.maxDiff)||5)*2);
  const activeOnly = req.query.activeOnly !== '0';
  const rows = await ocSearchCachesByKeyword(q, type, minDiff, maxDiff, activeOnly, req.user.id);
  const items = rows.map(r => ({
    referenceCode: r.wp_oc, name: r.name, shortName: r.name.length>25?r.name.slice(0,25)+'…':r.name,
    lat: r.latitude, lon: r.longitude, geocacheType: { id: r.type_id, name: r.type_name||'' },
    difficulty: r.difficulty, terrain: r.terrain, ownerAlias: r.username, ownerCode: String(r.username),
    publishedDate: r.date_created?new Date(r.date_created).toISOString().slice(0,10):'',
    platform: 'OC', isOwned: req.user.id>0&&r.owner_id===req.user.id,
    isFound: false, isDNF: false, isCached: false, isDisabled: r.status===2, isArchived: r.status===3,
    hasCC: false, hasPCN: false, pcn: '', isOcOnly: false, isGuessable: false, isPartial: false, isSelected: false,
    favoritePoints: 0, status: r.status,
  }));
  res.json({ items });
}

export async function waypoints(req, res) {
  const wp = (req.query.wp||'').trim();
  if (!wp) return res.json({ wpts: [] });
  const rows = await ocGetCacheWaypoints(wp);
  res.json({ wpts: rows.map(r => ({ lat: r.latitude, lon: r.longitude, name: r.type_name||'Waypoint', description: r.description||'', subtype: r.subtype })) });
}

export async function apiDetail(req, res) {
  const data = await ocGetCacheDetail(req.params.wp.toUpperCase(), req.user.id);
  if (!data) return res.status(404).json({ error: 'Cache not found' });
  res.json(data);
}

export async function saveNote(req, res) {
  const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
  if (!cacheId) return res.status(404).json({ error: 'Cache not found' });
  const result = await ocSaveCacheNote(cacheId, req.user.id, (req.body.text||'').trim());
  res.json(result);
}

export async function createLog(req, res) {
  const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
  if (!cacheId) return res.status(404).json({ error: 'Cache not found' });
  const { type, date, text } = req.body;
  const logDate = date && date.length===10 ? date+' 00:00:00' : date;
  const log = await ocInsertLog(cacheId, req.user.id, type, logDate, text);
  res.json({ saved: true, log });
}

export async function apiLive(req, res) {
  const lat1 = parseFloat(req.query.lat1) || 0;
  const lat2 = parseFloat(req.query.lat2) || 0;
  const lon1 = parseFloat(req.query.lon1) || 0;
  const lon2 = parseFloat(req.query.lon2) || 0;
  const minDiff = parseInt(req.query.minDiff) || 2;
  const maxDiff = parseInt(req.query.maxDiff) || 10;
  if (lat1 >= lat2 || lon1 >= lon2) return res.json({ count: 0, items: [] });

  const pool = (await import('../db.js')).default;
  const sLat = Math.min(lat1, lat2), nLat = Math.max(lat1, lat2);
  const wLon = Math.min(lon1, lon2), eLon = Math.max(lon1, lon2);

  const userId = (req.user?.id) || 0;
  const rows = await pool.query(
    `SELECT c.wp_oc, c.name, c.wp_gc, c.type, t.name AS typeName, c.size, s.name AS sizeName,
     c.difficulty, c.terrain, c.status, c.date_created, c.user_id,
     c.latitude AS listingLat, c.longitude AS listingLon,
     u.username AS ownerAlias, u.username AS ownerCode,
     (SELECT COUNT(*) FROM cache_logs WHERE cache_id=c.cache_id AND type=1) AS findCount,
     (SELECT COUNT(*) FROM cache_rating WHERE cache_id=c.cache_id) AS favoritePoints,
     IF(oc6.cache_id IS NOT NULL, 1, 0) AS isOcOnly,
     IF(fl.id IS NOT NULL, 1, 0) AS isFound,
     IF(pcn.id IS NOT NULL, 1, 0) AS hasPCN,
     IF(pcn.id IS NOT NULL AND pcn.latitude != 0 AND pcn.longitude != 0, 1, 0) AS hasCC
     FROM caches c
     JOIN cache_type t ON c.type=t.id
     JOIN cache_size s ON c.size=s.id
     LEFT JOIN user u ON c.user_id=u.user_id
     LEFT JOIN caches_attributes oc6 ON c.cache_id=oc6.cache_id AND oc6.attrib_id=6
     LEFT JOIN cache_logs fl ON c.cache_id=fl.cache_id AND fl.user_id=? AND fl.type IN (1,7)
     LEFT JOIN coordinates pcn ON c.cache_id=pcn.cache_id AND pcn.user_id=? AND pcn.type=2
     WHERE c.status IN (1,2)
     AND c.latitude BETWEEN ? AND ? AND c.longitude BETWEEN ? AND ?
     AND c.difficulty BETWEEN ? AND ?
     LIMIT 5000`,
    [userId, userId, sLat, nLat, wLon, eLon, minDiff, maxDiff]
  );

  const items = rows.map(r => ({
    _id: r.wp_oc, referenceCode: r.wp_oc, name: r.name,
    lat: Number(r.ccLat||r.listingLat), lon: Number(r.ccLon||r.listingLon),
    listingLat: Number(r.listingLat), listingLon: Number(r.listingLon),
    geocacheType: { id: Number(r.type), name: r.typeName }, geocacheSize: { id: Number(r.size), name: r.sizeName },
    difficulty: Number(r.difficulty)/2, terrain: Number(r.terrain)/2,
    isArchived: false, isDisabled: r.status === 2, isFound: !!r.isFound, foundDate: '',
    hasCC: !!r.hasCC, hasPCN: !!r.hasPCN,
    ownerAlias: r.ownerAlias, ownerCode: String(r.ownerCode),
    publishedDate: r.date_created ? new Date(r.date_created).toISOString().slice(0,10) : '',
    favoritePoints: Number(r.favoritePoints), findCount: Number(r.findCount),
    shortName: (r.name||'').length > 25 ? r.name.slice(0,25)+'…' : r.name,
    platform: 'OC', isOwned: (userId && r.user_id === userId), isSelected: false,
    isOcOnly: !!r.isOcOnly, pcn: '',
  }));
  res.json({ count: items.length, items });
}
