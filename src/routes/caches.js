import { ocGetCacheTypes, ocGetCacheSizes, ocGetCountries, ocGetLanguages, ocGetAllAttributes, ocGetWaypointTypes } from '../data/lookups.js';
import { ocGetCacheDetail, ocGetCacheForEdit, ocInsertCache, ocUpdateCache, ocGetCacheIdByWp, ocSearchCachesByKeyword, ocIsCacheOwner, ocGetCacheLogpw, ocUpdateCacheStatus, ocSearchCachesByBounds, ocCountCachesInBounds } from '../data/caches.js';
import { ocInsertLog, ocGetLogById, ocUpdateLog, ocDeleteLog, ocCountDuplicateLogs } from '../data/logs.js';
import { ocGetWaypointsByWp, ocReplaceWaypoints, ocSaveUserNoteText, ocSaveUserCoords, ocSaveLogPassword } from '../data/waypoints.js';
import { decimalToDm } from '../data/shared.js';

// ── Private helpers ─────────────────────────────────────────────────────

function parseCoords(str) {
  if (!str) return null;
  const m = str.match(/^([NS])\s*(\d+)\s+(\d+\.\d+)\s+([EW])\s*(\d+)\s+(\d+\.\d+)$/);
  if (!m) return null;
  let lat = parseInt(m[2]) + parseFloat(m[3]) / 60;
  let lon = parseInt(m[5]) + parseFloat(m[6]) / 60;
  if (m[1] === 'S') lat = -lat;
  if (m[4] === 'W') lon = -lon;
  return { lat, lon };
}

function parseWaypoints(json) {
  if (!json) return [];
  try {
    return JSON.parse(json).map(w => {
      const c = parseCoords(w.coords || '');
      return { subtype: parseInt(w.type) || 1, latitude: c ? c.lat : 0, longitude: c ? c.lon : 0, description: (w.desc || '').substring(0, 80) };
    });
  } catch { return []; }
}

function optionalAuth(req, res, block) {
  if (!req.user.id) return res.status(401).json({ error: 'Login required' });
  return block();
}

// ── HTML pages ──────────────────────────────────────────────────────────

export async function searchPage(req, res) {
  const types = await ocGetCacheTypes();
  res.render('caches/search.njk', { types });
}

export async function newForm(req, res) {
  const locale = 'EN';
  const [types, sizes, countries] = await Promise.all([ocGetCacheTypes(locale), ocGetCacheSizes(locale), ocGetCountries(locale)]);
  const [attrs, wptTypes, languages] = await Promise.all([ocGetAllAttributes(), ocGetWaypointTypes(), ocGetLanguages(locale)]);

  const editWp = (req.query.edit || '').toUpperCase();
  let editCache = null, editDesc = null, editAttribs = [], editNote = null, editWpts = [];
  let editCoords = '', editDateHidden = '';

  if (editWp) {
    const data = await ocGetCacheForEdit(editWp, req.user.id);
    if (data) {
      editCache = data.cache; editDesc = data.desc; editAttribs = data.attribIds;
      editNote = data.note; editWpts = data.wpts;
      editCoords = decimalToDm(Number(editCache.latitude), Number(editCache.longitude));
      editDateHidden = editCache.date_hidden ? new Date(editCache.date_hidden).toISOString().slice(0, 10) : '';
    }
  }

  const fromCoords = req.query.lat && req.query.lon
    ? decimalToDm(parseFloat(req.query.lat), parseFloat(req.query.lon)) : '';

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
    waypoints_json: editWpts?.length ? JSON.stringify(editWpts.map(w => ({ id: w.id, type: w.subtype, coords: decimalToDm(Number(w.latitude), Number(w.longitude)), desc: w.description }))) : '[]',
    tos: true, selected_attribs: editAttribs?.length ? editAttribs : [],
    publish: editCache ? 'notnow' : 'now2', activate_date: '', activate_hour: '',
  };

  res.render('caches/new.njk', { types, sizes, countries, languages, attrs, wptTypes, editCache, editDesc, editAttribs, editNote, editWpts, editCoords: editCoords || fromCoords, editDateHidden, form, errors: {}, is_edit: !!editCache, edit_cache_id: editCache?.cache_id || 0 });
}

export async function detail(req, res) {
  const cache = await ocGetCacheDetail(req.params.wp.toUpperCase(), req.user.id);
  res.render('caches/detail.njk', { wp: req.params.wp, cache, cache_json: cache ? JSON.stringify(cache) : null });
}

export async function upsert(req, res) {
  const { name, type, size, coords, country, difficulty, terrain, date_hidden, short_desc, desc, hint, cache_note, user_coords, waypoints_json, cache_attribs, edit_id } = req.body;
  const editId = parseInt(edit_id) || 0;
  const parsed = parseCoords(coords);

  if (editId) {
    const wp = await ocUpdateCache(editId, req.user.id, { name, type, size, country, difficulty, terrain, date_hidden, desc, hint, short_desc, latitude: parsed?.lat, longitude: parsed?.lon });
    if (!wp) return res.status(403).send('Not authorized');

    const cacheId = await ocGetCacheIdByWp(wp);
    if (!cacheId) return res.status(404).send('Cache not found');

    if (cache_note !== undefined) await ocSaveUserNoteText(cacheId, req.user.id, (cache_note || '').trim());
    const uc = parseCoords(user_coords);
    if (uc) await ocSaveUserCoords(cacheId, req.user.id, uc.lat, uc.lon);
    const wpts = parseWaypoints(waypoints_json);
    if (wpts.length) await ocReplaceWaypoints(cacheId, wpts);

    res.redirect(`/cache/${wp}`);
  } else {
    if (!parsed) return res.status(400).send('Invalid coordinates');
    const result = await ocInsertCache({ user_id: req.user.id, name, lon: parsed.lon, lat: parsed.lat, type, country, date_hidden, size, difficulty, terrain, desc, hint, short_desc });
    if (cache_note) await ocSaveUserNoteText(result.id, req.user.id, cache_note.trim());
    const wpts = parseWaypoints(waypoints_json);
    if (wpts.length) await ocReplaceWaypoints(result.id, wpts);

    res.redirect(`/cache/${result.wp_oc}`);
  }
}

// ── JSON API (browser → cache detail, search, livemap) ──────────────────

export async function get(req, res) {
  const data = await ocGetCacheDetail(req.params.wp.toUpperCase(), req.user.id);
  if (!data) return res.status(404).json({ error: 'Cache not found' });
  res.json(data);
}

export async function search(req, res) {
  const q = (req.query.q || '').trim(), type = parseInt(req.query.type) || 0;
  const minDiff = Math.round((parseFloat(req.query.minDiff) || 1) * 2), maxDiff = Math.round((parseFloat(req.query.maxDiff) || 5) * 2);
  const activeOnly = req.query.activeOnly !== '0';
  const rows = await ocSearchCachesByKeyword(q, type, minDiff, maxDiff, activeOnly, req.user.id);
  const items = rows.map(r => ({
    referenceCode: r.wp_oc, name: r.name, shortName: r.name.length > 25 ? r.name.slice(0, 25) + '…' : r.name,
    lat: r.latitude, lon: r.longitude, geocacheType: { id: r.type_id, name: r.type_name || '' },
    difficulty: r.difficulty, terrain: r.terrain, ownerAlias: r.username, ownerCode: String(r.username),
    publishedDate: r.date_created ? new Date(r.date_created).toISOString().slice(0, 10) : '',
    platform: 'OC', isOwned: req.user.id > 0 && r.owner_id === req.user.id,
    isFound: false, isDNF: false, isCached: false, isDisabled: r.status === 2, isArchived: r.status === 3,
    hasCC: false, hasPCN: false, pcn: '', isOcOnly: false, isGuessable: false, isPartial: false, isSelected: false,
    favoritePoints: 0, status: r.status,
  }));
  res.json({ items });
}

export async function live(req, res) {
  const lat1 = parseFloat(req.query.lat1) || 0, lat2 = parseFloat(req.query.lat2) || 0;
  const lon1 = parseFloat(req.query.lon1) || 0, lon2 = parseFloat(req.query.lon2) || 0;
  const minDiff = parseInt(req.query.minDiff) || 2, maxDiff = parseInt(req.query.maxDiff) || 10;
  if (lat1 >= lat2 || lon1 >= lon2) return res.json({ count: 0, items: [] });

  const sLat = Math.min(lat1, lat2), nLat = Math.max(lat1, lat2);
  const wLon = Math.min(lon1, lon2), eLon = Math.max(lon1, lon2);
  const userId = (req.user?.id) || 0;

  const [count, rows] = await Promise.all([
    ocCountCachesInBounds(sLat, nLat, wLon, eLon, minDiff, maxDiff),
    ocSearchCachesByBounds({ sLat, nLat, wLon, eLon, minDiff, maxDiff, maxItems: 5000 }, userId),
  ]);

  const items = rows.map(r => ({
    _id: r.referenceCode, referenceCode: r.referenceCode, name: r.name,
    lat: r.hasCC ? Number(r.ccLat) : Number(r.listingLat),
    lon: r.hasCC ? Number(r.ccLon) : Number(r.listingLon),
    listingLat: Number(r.listingLat), listingLon: Number(r.listingLon),
    geocacheType: { id: Number(r.typeId), name: r.typeName },
    geocacheSize: { id: Number(r.sizeId), name: r.sizeName },
    difficulty: r.difficulty, terrain: r.terrain,
    isArchived: false, isDisabled: Number(r.status) === 2,
    isFound: !!r.isFound, foundDate: r.foundDate || '',
    hasCC: !!r.hasCC, hasPCN: !!r.hasPCN,
    ownerAlias: r.ownerAlias, ownerCode: String(r.ownerCode),
    publishedDate: r.publishedDate ? new Date(r.publishedDate).toISOString().slice(0, 10) : '',
    favoritePoints: Number(r.favoritePoints), findCount: Number(r.findCount),
    shortName: (r.name || '').length > 25 ? r.name.slice(0, 25) + '…' : r.name,
    platform: 'OC', isOwned: !!r.isOwned, isSelected: false,
    isOcOnly: !!r.isOcOnly, pcn: r.pcnText || '',
  }));
  res.json({ count, items });
}

export async function waypoints(req, res) {
  const wp = (req.query.wp || '').trim();
  if (!wp) return res.json({ wpts: [] });
  const wpts = await ocGetWaypointsByWp(wp);
  res.json({ wpts: wpts.map(w => ({ lat: w.latitude, lon: w.longitude, name: w.type_name || 'Waypoint', description: w.description || '', subtype: w.typeId })) });
}

// ── JSON API — logs ─────────────────────────────────────────────────────

export async function createLog(req, res) {
  return optionalAuth(req, res, async () => {
    const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
    if (!cacheId) return res.status(404).json({ error: 'Cache not found' });

    const { type, date, text, password } = req.body;
    const logType = parseInt(type) || 3;
    const logDate = date && date.length === 10 ? date + ' 00:00:00' : date;

    if (logType === 1 || logType === 7) {
      const logpw = await ocGetCacheLogpw(cacheId);
      if (logpw && logpw !== (password || '')) {
        return res.status(403).json({ error: 'Log password required', requirePassword: true });
      }
    }
    if (logType === 9 || logType === 10 || logType === 11) {
      if (!await ocIsCacheOwner(cacheId, req.user.id)) return res.status(403).json({ error: 'Only the cache owner can perform this action' });
      await ocUpdateCacheStatus(cacheId, { 9: 3, 10: 1, 11: 2 }[logType]);
    }
    if (logType === 1 || logType === 7) {
      if (await ocCountDuplicateLogs(cacheId, req.user.id, logType, 0) > 0) return res.status(409).json({ error: 'You have already logged this type for this cache' });
    }

    const log = await ocInsertLog(cacheId, req.user.id, logType, logDate, text);
    res.json({ saved: true, log });
  });
}

export async function updateLog(req, res) {
  return optionalAuth(req, res, async () => {
    const logId = parseInt(req.params.logId) || 0;
    const { type, date, text, password } = req.body;
    const logType = parseInt(type) || 3;
    const logDate = date && date.length === 10 ? date + ' 00:00:00' : date;

    const logRow = await ocGetLogById(logId);
    if (!logRow) return res.status(404).json({ error: 'Log not found' });
    if (logRow.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    if (logType === 1 || logType === 7) {
      if (logRow.cache_logpw && logRow.cache_logpw !== (password || '')) {
        return res.status(403).json({ error: 'Log password required', requirePassword: true });
      }
    }
    if (logType === 9 || logType === 10 || logType === 11) {
      if (!await ocIsCacheOwner(logRow.cache_id, req.user.id)) return res.status(403).json({ error: 'Only the cache owner can perform this action' });
      await ocUpdateCacheStatus(logRow.cache_id, { 9: 3, 10: 1, 11: 2 }[logType]);
    }
    if (logType === 1 || logType === 7) {
      if (await ocCountDuplicateLogs(logRow.cache_id, req.user.id, logType, logId) > 0) return res.status(409).json({ error: 'You already have a log of this type' });
    }

    const result = await ocUpdateLog(logId, req.user.id, logType, logDate, text);
    res.json(result);
  });
}

export async function deleteLog(req, res) {
  return optionalAuth(req, res, async () => {
    const result = await ocDeleteLog(parseInt(req.params.logId) || 0, req.user.id);
    res.json(result);
  });
}

// ── JSON API — user data (note, coords, log password) ──────────────────

export async function saveNote(req, res) {
  return optionalAuth(req, res, async () => {
    const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
    if (!cacheId) return res.status(404).json({ error: 'Cache not found' });
    const result = await ocSaveUserNoteText(cacheId, req.user.id, (req.body.text || '').trim());
    res.json(result);
  });
}

export async function saveCoords(req, res) {
  return optionalAuth(req, res, async () => {
    const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
    if (!cacheId) return res.status(404).json({ error: 'Cache not found' });
    const { lat, lon } = req.body;
    if (lat == null || lon == null) return res.status(400).json({ error: 'lat and lon required' });
    res.json(await ocSaveUserCoords(cacheId, req.user.id, parseFloat(lat), parseFloat(lon)));
  });
}

export async function saveLogpw(req, res) {
  return optionalAuth(req, res, async () => {
    const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
    if (!cacheId) return res.status(404).json({ error: 'Cache not found' });
    res.json(await ocSaveLogPassword(cacheId, req.user.id, req.body.logpw || ''));
  });
}
