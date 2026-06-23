// ── ocapi barrel — re-exports all data functions from domain modules ──
// Import from here for backward-compat, or import directly from src/data/<domain>.js
//
// Domain layout:
//   src/data/caches.js    — cache CRUD, search, counts, ownership
//   src/data/logs.js      — log CRUD, duplicates, log list
//   src/data/waypoints.js — owner waypoints, user notes/coords/logpw
//   src/data/users.js     — profile, search, registration, password reset
//   src/data/sessions.js  — login, logout, session validation
//   src/data/lookups.js   — static data: types, sizes, countries, attributes
//   src/data/shared.js    — helpers: coordinate conversion, dates, waypoint icons

export { ocGetCacheCounts, ocCountCachesInBounds, ocSearchCachesByBounds, ocSearchCachesByKeyword,
         ocGetCacheDetail, ocGetCacheForEdit, ocInsertCache, ocUpdateCache,
         ocGetCacheIdByWp, ocIsCacheOwner, ocGetCacheLogpw, ocUpdateCacheStatus }
  from './data/caches.js';

export { ocGetLogById, ocInsertLog, ocUpdateLog, ocDeleteLog,
         ocCountDuplicateLogs, ocGetLogsForCache }
  from './data/logs.js';

export { ocGetWaypointsByCacheId, ocGetWaypointsByWp, ocGetWaypointsForEdit,
         ocReplaceWaypoints, ocGetUserNote, ocSaveUserNoteText,
         ocSaveUserCoords, ocSaveLogPassword }
  from './data/waypoints.js';

export { ocSearchUsers, ocGetUserProfile, ocCheckUsername, ocCheckEmail,
         ocGetUserByEmail, ocCreateUser, ocCreateActivationCode, ocActivateUser,
         ocSetPasswordResetToken, ocResetPassword }
  from './data/users.js';

export { ocLogin, ocLogout, ocValidateSession } from './data/sessions.js';

export { ocGetCacheTypes, ocGetCacheSizes, ocGetCountries,
         ocGetLanguages, ocGetAllAttributes, ocGetWaypointTypes }
  from './data/lookups.js';
