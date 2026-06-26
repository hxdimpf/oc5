/**
 * Cache routes — HTML pages and JSON API endpoints.
 *
 * Each handler is a thin glue layer:
 *   parse input → call data function(s) → render/respond.
 *
 * All data access lives in src/data/ (caches.js, logs.js, waypoints.js, lookups.js).
 * Coordinate utilities are shared with the frontend via public/lib/coords.js.
 *
 * Route table (registered in app.js):
 *
 *   HTML pages:
 *     GET  /caches              → searchPage
 *     GET  /cache/new           → newForm
 *     POST /cache/new           → upsert
 *     GET  /cache/:wp           → detail
 *
 *   JSON API — cache data:
 *     GET  /api/cache/:wp        → get
 *     GET  /api/caches/search    → search
 *     GET  /api/caches/live      → live
 *     GET  /api/caches/waypoints → waypoints
 *
 *   JSON API — logs:
 *     POST   /api/cache/:wp/log          → createLog
 *     PUT    /api/cache/:wp/log/:logId   → updateLog
 *     DELETE /api/cache/:wp/log/:logId   → deleteLog
 *
 *   JSON API — user data:
 *     POST /api/cache/:wp/note   → saveNote
 *     POST /api/cache/:wp/coords → saveCoords
 *     POST /api/cache/:wp/logpw  → saveLogpw
 */

import { Router } from 'express';
import { ocGetCacheTypes, ocGetCacheSizes, ocGetCountries, ocGetLanguages, ocGetAllAttributes, ocGetWaypointTypes } from '../data/lookups.js';
import { ocGetCacheDetail, ocGetCacheForEdit, ocInsertCache, ocUpdateCache, ocGetCacheIdByWp, ocSearchCachesByKeyword, ocIsCacheOwner, ocGetCacheLogpw, ocUpdateCacheStatus, ocSearchCachesByBounds, ocCountCachesInBounds } from '../data/caches.js';
import { ocInsertLog, ocGetLogById, ocUpdateLog, ocDeleteLog, ocCountDuplicateLogs } from '../data/logs.js';
import { ocGetWaypointsByWp, ocReplaceWaypoints, ocSaveUserNoteText, ocSaveUserCoords, ocSaveLogPassword } from '../data/waypoints.js';
import { coords2Dm, coords2LatLon } from '../../public/lib/coords.js';
import { validate } from '../validate.js';
import { fail } from '../errors.js';

// ── Private helpers ─────────────────────────────────────────────────────

/**
 * Parse a waypoints JSON string from the new-cache form into the format
 * expected by ocReplaceWaypoints().
 *
 * @param {string|null} json  Serialized waypoint array from form POST
 * @returns {{ subtype: number, latitude: number, longitude: number, description: string }[]}
 */
function parseWaypoints(json) {
  if (!json) return [];
  try {
    return JSON.parse(json).map(w => {
      const c = coords2LatLon(w.coords || '');
      return { subtype: parseInt(w.type) || 1, latitude: c ? c.lat : 0, longitude: c ? c.lon : 0, description: (w.desc || '').substring(0, 80) };
    });
  } catch { return []; }
}

/**
 * Auth guard for JSON endpoints. Returns 401 if req.user is not logged in,
 * otherwise executes the provided handler block.
 */
function requireAuth(req, res, block) {
  if (!req.user.id) return res.status(401).json({ error: 'Login required' });
  return block();
}

/**
 * Shared log validation: password check, owner-only types, duplicate prevention.
 * Returns an error response object if validation fails, or null if OK.
 *
 * @param {number} cacheId       Cache internal ID
 * @param {string} logpw         Cache log password (or log row's cached copy)
 * @param {number} logType       Log type ID
 * @param {string} password      User-submitted password
 * @param {number} userId        Current user ID
 * @param {number} excludeLogId  Log ID to exclude from duplicate check (0 for new)
 * @returns {{ status, error } | null}
 */
async function validateLog({ cacheId, logpw, logType, password, userId, excludeLogId }) {
  if (logType === 1 || logType === 7) {
    if (logpw && logpw !== (password || '')) {
      return { status: 403, error: 'Log password required', requirePassword: true };
    }
  }
  if (logType === 9 || logType === 10 || logType === 11) {
    if (!await ocIsCacheOwner(cacheId, userId)) return { status: 403, error: 'Only the cache owner can perform this action' };
    await ocUpdateCacheStatus(cacheId, { 9: 3, 10: 1, 11: 2 }[logType]);
  }
  if (logType === 1 || logType === 7) {
    if (await ocCountDuplicateLogs(cacheId, userId, logType, excludeLogId) > 0) {
      return { status: 409, error: 'You have already logged this type for this cache' };
    }
  }
  return null;
}

// ── HTML pages ──────────────────────────────────────────────────────────

/**
 * GET /caches
 * Renders the cache search page with type dropdown populated from the DB.
 * Called by: main navigation "Search" link.
 */
export async function searchPage(req, res) {
  const types = await ocGetCacheTypes();
  res.render('caches/search.njk', { types });
}

/**
 * GET /cache/new?edit=OCxxxxx
 * Renders the new-cache form. When `?edit=WP` is present and the user owns
 * that cache, the form is pre-populated for editing.
 *
 * Called by: "New Cache" button, or "Edit" link on cache detail page.
 * Pre-fills: form defaults, coordinates (from query or user home), waypoints.
 */
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
      editCoords = coords2Dm(Number(editCache.latitude), Number(editCache.longitude));
      editDateHidden = editCache.date_hidden ? new Date(editCache.date_hidden).toISOString().slice(0, 10) : '';
    }
  }

  const fromCoords = req.query.lat && req.query.lon
    ? coords2Dm(parseFloat(req.query.lat), parseFloat(req.query.lon)) : '';

  const form = {
    name: editCache?.name || '', type: editCache?.type ? String(editCache.type) : '',
    size: editCache?.size ? String(editCache.size) : '', difficulty: editCache?.difficulty ? String(editCache.difficulty) : '',
    terrain: editCache?.terrain ? String(editCache.terrain) : '', coords: editCoords || fromCoords || '',
    country: editCache?.country || 'DE', search_time: editCache?.search_time || '', way_length: editCache?.way_length || '',
    wp_gc: editCache?.wp_gc || '', desc_lang: editDesc?.language || 'EN',
    short_desc: editDesc?.short_desc || '', desc: editDesc?.desc || '', hints: editDesc?.hint || '',
    hidden_date: editDateHidden, log_pw: editCache?.logpw || '',
    cache_note: editNote?.description || '',
    user_coords: editNote?.latitude ? coords2Dm(Number(editNote.latitude), Number(editNote.longitude)) : '',
    waypoints_json: editWpts?.length ? JSON.stringify(editWpts.map(w => ({ id: w.id, type: w.subtype, coords: coords2Dm(Number(w.latitude), Number(w.longitude)), desc: w.description }))) : '[]',
    tos: true, selected_attribs: editAttribs?.length ? editAttribs : [],
    publish: editCache ? 'notnow' : 'now2', activate_date: '', activate_hour: '',
  };

  res.render('caches/new.njk', { types, sizes, countries, languages, attrs, wptTypes, editCache, editDesc, editAttribs, editNote, editWpts, editCoords: editCoords || fromCoords, editDateHidden, form, errors: {}, is_edit: !!editCache, edit_cache_id: editCache?.cache_id || 0 });
}

/**
 * GET /cache/:wp
 * Renders the cache detail page. The frontend JS (cache.js) then fetches
 * /api/cache/:wp to populate the listing data client-side.
 *
 * @param {string} req.params.wp  OC waypoint code (e.g. "OC18BB7")
 */
export async function detail(req, res) {
  const cache = await ocGetCacheDetail(req.params.wp.toUpperCase(), req.user.id);
  res.render('caches/detail.njk', { wp: req.params.wp, cache, cache_json: cache ? JSON.stringify(cache) : null });
}

/**
 * POST /cache/new
 * Creates a new cache or updates an existing one (when edit_id is set).
 * Handles waypoints, personal note, and corrected coordinates in one transaction.
 *
 * @param {object}  req.body             All form fields from newcache.njk
 * @param {number}  req.body.edit_id     If set, updates existing cache (owner-only)
 * @param {string}  req.body.coords      Coordinates in DM format
 * @param {string}  req.body.waypoints_json  Serialized additional waypoints
 * @returns {redirect} 302 to /cache/:wp on success, 400 on invalid coords, 403 on auth failure
 */
export async function upsert(req, res) {
  const { name, type, size, coords, country, difficulty, terrain, date_hidden, short_desc, desc, hint, cache_note, user_coords, waypoints_json, cache_attribs, edit_id } = req.body;
  const editId = parseInt(edit_id) || 0;
  const parsed = coords2LatLon(coords);

  if (editId) {
    const wp = await ocUpdateCache(editId, req.user.id, { name, type, size, country, difficulty, terrain, date_hidden, desc, hint, short_desc, latitude: parsed?.lat, longitude: parsed?.lon });
    if (!wp) return res.status(403).send('Not authorized');

    const cacheId = await ocGetCacheIdByWp(wp);
    if (!cacheId) return res.status(404).send('Cache not found');

    if (cache_note !== undefined) await ocSaveUserNoteText(cacheId, req.user.id, (cache_note || '').trim());
    const uc = coords2LatLon(user_coords);
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

// ── JSON API — cache data ───────────────────────────────────────────────

/**
 * GET /api/cache/:wp
 * Returns the full cache detail object as JSON. Called by cache.js on page load
 * to populate the listing table, map, logs, waypoints, and attributes.
 *
 * @param {string} req.params.wp  OC waypoint code
 * @returns {object}  Cache detail (UniCache-compatible shape), or 404
 */
export async function get(req, res) {
  const data = await ocGetCacheDetail(req.params.wp.toUpperCase(), req.user.id);
  if (!data) return res.status(404).json({ error: 'Cache not found' });
  res.json(data);
}

/**
 * GET /api/caches/search?q=&type=&minDiff=&maxDiff=&activeOnly=
 * Full-text keyword search across WP codes, GC codes, cache names, and usernames.
 * Returns simplified cache summaries for the search results Tabulator table.
 *
 * @param {string}  req.query.q          Search term
 * @param {number}  req.query.type       Cache type ID filter (0 = all)
 * @param {number}  req.query.minDiff    Minimum difficulty (1-5)
 * @param {number}  req.query.maxDiff    Maximum difficulty (1-5)
 * @param {string}  req.query.activeOnly "0" to include disabled/archived
 * @returns {{ items: object[] }}  Array of cache summary objects
 */
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

/**
 * GET /api/caches/live?lat1=&lat2=&lon1=&lon2=&minDiff=&maxDiff=
 * Bounding-box cache search for the livemap. Returns count + full cache summaries.
 * Difficulty values are raw DB values (2-10), doubled from the 1-5 scale.
 *
 * @param {number} req.query.lat1,lat2,lon1,lon2  Bounding box (any corner order)
 * @param {number} req.query.minDiff,maxDiff       Difficulty range in DB units (default 2-10)
 * @returns {{ count: number, items: object[] }}
 */
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

/**
 * GET /api/caches/waypoints?wp=OCxxxxx
 * Returns the additional waypoints for a cache. Used by the standalone
 * waypoints API and the cache detail map.
 *
 * @param {string} req.query.wp  OC waypoint code
 * @returns {{ wpts: { lat, lon, name, description, subtype }[] }}
 */
export async function waypoints(req, res) {
  const wp = (req.query.wp || '').trim();
  if (!wp) return res.json({ wpts: [] });
  const wpts = await ocGetWaypointsByWp(wp);
  res.json({ wpts: wpts.map(w => ({ lat: w.latitude, lon: w.longitude, name: w.type_name || 'Waypoint', description: w.description || '', subtype: w.typeId })) });
}

// ── JSON API — logs ─────────────────────────────────────────────────────

/**
 * POST /api/cache/:wp/log
 * Creates a new log entry. Enforces:
 *   - Log password on Found (1) / Attended (7) types
 *   - Owner-only restriction on Archive (9) / Ready (10) / Disable (11)
 *   - Duplicate prevention for Found / Attended
 *
 * @param {string}  req.params.wp    OC waypoint code
 * @param {number}  req.body.type    Log type ID
 * @param {string}  req.body.date    "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
 * @param {string}  req.body.text    Log text
 * @param {string}  req.body.password  Log password (required for Found/Attended)
 * @returns {{ saved: true, log: object }}
 */
export async function createLog(req, res) {
  return requireAuth(req, res, async () => {
    const v = validate(req.body, { type: 'int', date: 'date?', text: 'text' });
    if (!v.ok) return fail(res, 'ERR_VALIDATION', v.errors);

    const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
    if (!cacheId) return fail(res, 'ERR_NOT_FOUND');

    const logType = v.values.type || 3;
    const logDate = v.values.date && v.values.date.length === 10 ? v.values.date + ' 00:00:00' : v.values.date;

    const err = await validateLog({
      cacheId, logpw: await ocGetCacheLogpw(cacheId),
      logType, password: v.values.password, userId: req.user.id, excludeLogId: 0,
    });
    if (err) return res.status(err.status).json(err);

    const log = await ocInsertLog(cacheId, req.user.id, logType, logDate, v.values.text);
    res.json({ saved: true, log });
  });
}

/**
 * PUT /api/cache/:wp/log/:logId
 * Updates an existing log entry. Same validation rules as createLog.
 * Ownership of the log is verified — only the original author can edit.
 *
 * @param {number} req.params.logId  Log ID to update
 * @returns {{ saved: true }} or error
 */
export async function updateLog(req, res) {
  return requireAuth(req, res, async () => {
    const v = validate(req.body, { type: 'int', date: 'date?', text: 'text' });
    if (!v.ok) return fail(res, 'ERR_VALIDATION', v.errors);

    const logId = parseInt(req.params.logId) || 0;
    const logType = v.values.type || 3;
    const logDate = v.values.date && v.values.date.length === 10 ? v.values.date + ' 00:00:00' : v.values.date;

    const logRow = await ocGetLogById(logId);
    if (!logRow) return res.status(404).json({ error: 'Log not found' });
    if (logRow.user_id !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const err = await validateLog({
      cacheId: logRow.cache_id, logpw: logRow.cache_logpw || '',
      logType, password: v.values.password, userId: req.user.id, excludeLogId: logId,
    });
    if (err) return res.status(err.status).json(err);

    const result = await ocUpdateLog(logId, req.user.id, logType, logDate, v.values.text);
    res.json(result);
  });
}

/**
 * DELETE /api/cache/:wp/log/:logId
 * Deletes a log entry. Only the original author can delete their own log.
 *
 * @param {number} req.params.logId  Log ID to delete
 * @returns {{ deleted: true }} or error
 */
export async function deleteLog(req, res) {
  return requireAuth(req, res, async () => {
    const result = await ocDeleteLog(parseInt(req.params.logId) || 0, req.user.id);
    res.json(result);
  });
}

// ── JSON API — user data (note, coords, log password) ──────────────────

/**
 * POST /api/cache/:wp/note
 * Saves or clears the user's personal cache note. Empty text deletes the note.
 *
 * @param {string} req.body.text  Note text (empty to delete)
 * @returns {{ saved: boolean }}
 */
export async function saveNote(req, res) {
  return requireAuth(req, res, async () => {
    const v = validate(req.body, { text: 'text' });
    const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
    if (!cacheId) return fail(res, 'ERR_NOT_FOUND');
    const result = await ocSaveUserNoteText(cacheId, req.user.id, (v.values.text || '').trim());
    res.json(result);
  });
}

/**
 * POST /api/cache/:wp/coords
 * Saves the user's corrected coordinates for a cache (personal, not public).
 *
 * @param {number} req.body.lat  Decimal latitude
 * @param {number} req.body.lon  Decimal longitude
 * @returns {{ saved: boolean }}
 */
export async function saveCoords(req, res) {
  return requireAuth(req, res, async () => {
    const v = validate(req.body, { lat: 'float', lon: 'float' });
    if (!v.ok) return fail(res, 'ERR_VALIDATION', v.errors);
    const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
    if (!cacheId) return fail(res, 'ERR_NOT_FOUND');
    res.json(await ocSaveUserCoords(cacheId, req.user.id, v.values.lat, v.values.lon));
  });
}

/**
 * POST /api/cache/:wp/logpw
 * Saves a personal log password for a cache. Used when the cache owner changes
 * the log password — each finder stores their own copy to prove they solved it.
 *
 * @param {string} req.body.logpw  Log password to store
 * @returns {{ saved: boolean }}
 */
export async function saveLogpw(req, res) {
  return requireAuth(req, res, async () => {
    const v = validate(req.body, { logpw: 'text' });
    const cacheId = await ocGetCacheIdByWp(req.params.wp.toUpperCase());
    if (!cacheId) return fail(res, 'ERR_NOT_FOUND');
    res.json(await ocSaveLogPassword(cacheId, req.user.id, v.values.logpw || ''));
  });
}

// ── Routes ──────────────────────────────────────────────────────────────

const router = Router();

// HTML pages
router.get ('/caches',                  searchPage);
router.get ('/cache/new',               newForm);    // before /cache/:wp
router.post('/cache/new',               upsert);
router.get ('/cache/:wp',               detail);

// JSON API — cache data
router.get ('/api/cache/:wp',           get);
router.get ('/api/caches/search',       search);
router.get ('/api/caches/live',         live);
router.get ('/api/caches/waypoints',    waypoints);

// JSON API — logs (auth enforced inside handlers via requireAuth)
router.post  ('/api/cache/:wp/log',         createLog);
router.put   ('/api/cache/:wp/log/:logId',  updateLog);
router.delete('/api/cache/:wp/log/:logId',  deleteLog);

// JSON API — user data
router.post('/api/cache/:wp/note',   saveNote);
router.post('/api/cache/:wp/coords', saveCoords);
router.post('/api/cache/:wp/logpw',  saveLogpw);

export default router;
