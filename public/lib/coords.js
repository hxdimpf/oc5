/***************************************************************************
 * for license information see LICENSE.md
 * Author: hxdimpf
 ***************************************************************************/

/**
 * Shared coordinate conversion utilities — pure functions, no DOM, no Node APIs.
 * Importable from browser (ESM) AND Node.js backend. Single source of truth.
 *
 * Used by: cache.js, newcache.js, mapRouting.js (frontend)
 *           data/shared.js, data/caches.js, routes/caches.js (backend)
 */

/** Zero-pad an integer to the given width. */
export function pad(n, width) {
  const s = n.toString();
  return s.length >= width ? s : '0'.repeat(width - s.length) + s;
}

/** Format decimal lat/lon as "N49 01.012 E008 22.444". */
export function coords2Dm(lat, lon) {
  const latOut = lat < 0 ? 'S' : 'N';
  const lonOut = lon < 0 ? 'W' : 'E';
  lat = Math.abs(lat);
  lon = Math.abs(lon);

  let latDeg = Math.trunc(lat);
  let lonDeg = Math.trunc(lon);

  let latDegFrac = Number((lat - latDeg).toFixed(14));
  let lonDegFrac = Number((lon - lonDeg).toFixed(14));

  let latMin = 60 * latDegFrac;
  let lonMin = 60 * lonDegFrac;

  let latMinInt = Math.trunc(latMin);
  let lonMinInt = Math.trunc(lonMin);

  let latMinFrac = Number((latMin - latMinInt).toFixed(3));
  let lonMinFrac = Number((lonMin - lonMinInt).toFixed(3));

  if (latMinFrac === 1) {
    latMinFrac = 0;
    latMinInt++;
    if (latMinInt === 60) { latMinInt = 0; latDeg++; }
  }
  if (lonMinFrac === 1) {
    lonMinFrac = 0;
    lonMinInt++;
    if (lonMinInt === 60) { lonMinInt = 0; lonDeg++; }
  }

  return `${latOut}${pad(latDeg, 2)} ${pad(latMinInt, 2)}.${pad(1000 * latMinFrac, 3)} ` +
         `${lonOut}${pad(lonDeg, 3)} ${pad(lonMinInt, 2)}.${pad(1000 * lonMinFrac, 3)}`;
}

/**
 * Parse a DM coordinate string back to decimal {lat, lon}.
 * Handles both "N52 20.171 E009 36.865" and "N 52 20.171 E 009 36.865".
 * Returns null if the string cannot be parsed.
 */
export function coords2LatLon(coords) {
  if (!coords) return null;
  const m = coords.match(/^([NS])\s*(\d+)\s+(\d+\.\d+)\s+([EW])\s*(\d+)\s+(\d+\.\d+)$/);
  if (!m) return null;
  let lat = parseInt(m[2]) + parseFloat(m[3]) / 60;
  let lon = parseInt(m[5]) + parseFloat(m[6]) / 60;
  if (m[1] === 'S') lat = -lat;
  if (m[4] === 'W') lon = -lon;
  return { lat, lon };
}
