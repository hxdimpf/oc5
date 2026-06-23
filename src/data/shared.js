import pool from '../db.js';

// ── Coordinate helpers (shared with frontend via public/shared/coords.js) ──

import { coords2Dm } from '../../public/shared/coords.js';
export { coords2Dm };

// ── Date helpers ─────────────────────────────────────────────────────

export function fmtDate(d) {
  return d ? new Date(d).toISOString().slice(0, 10) : '';
}

export function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function rhex(n) {
  return Array.from({length: n}, () => '0123456789abcdef'[Math.floor(Math.random()*16)]).join('');
}

// ── Waypoint icon mapping (centralized; used by both server and cache.js) ──

export const WAYPOINT_ICONS = {
  1: 'wp_parking.png',
  2: 'wp_reference.png',
  3: 'wp_path.png',
  4: 'wp_final.png',
  5: 'wp_poi.png',
};

export function waypointIcon(typeId) {
  const png = WAYPOINT_ICONS[typeId];
  return png ? `/images/waypoints/${png}` : '';
}

export function buildWaypointRow(w) {
  const lat = Number(w.latitude), lon = Number(w.longitude);
  const typeName = w.type_name || 'Waypoint';
  return {
    latitude: lat, longitude: lon,
    location: `${lat}|${lon}`,
    myCoords: coords2Dm(lat, lon),
    prefix: typeName.substring(0, 2).toUpperCase(),
    typeId: w.type_id,
    type: typeName,
    typeName: typeName,
    type_name: typeName,
    name: typeName,
    description: w.description || '',
    icon: waypointIcon(w.type_id),
  };
}

// ── Log type names ─────────────────────────────────────────────────────

export const LOG_TYPES = {
  1: 'Found it', 2: "Didn't find it", 3: 'Comment',
  7: 'Attended', 8: 'Will attend',
  9: 'Archived', 10: 'Ready to search', 11: 'Temporarily unavailable',
};

export function allowedLogTypes(cacheTypeId, isOwner, currentStatusId) {
  const isEvent = cacheTypeId === 6;
  const types = isEvent ? [7, 8, 3] : [1, 2, 3];
  if (isOwner) {
    types.push(currentStatusId === 2 ? 10 : 11); // Ready to search or Temp unavailable
    types.push(9); // Archive
  }
  return types;
}

// ── Flight recorder wrapper for data layer functions ──────────────────

import { record } from '../flightrecorder.js';

/**
 * Wrap a data layer function with flight recorder tracing.
 * Records enter (>) and exit (<) events with elapsed time.
 * Usage: export const ocGetFoo = traced('ocGetFoo', async (arg) => { ... });
 */
export function traced(name, fn) {
  return async (...args) => {
    const start = Date.now();
    record('data', '>', name, args.length);
    try {
      const result = await fn(...args);
      record('data', '<', name, `${Date.now() - start}ms`);
      return result;
    } catch (e) {
      record('data', '!', name, e.code || e.message);
      throw e;
    }
  };
}
