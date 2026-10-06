// ---------------------------------------------------------------
// livemap.js — page module for /livemap.
//
// loader.js has already loaded Leaflet and side-effect-imported map.js
// (which created the map and registered controls). We work out the initial
// view and hand it to handleWPs() with no static markers, which puts the
// map into live mode.
//
// Initial view: URL params (lat/lon/zoom, kept current by map.js so a
// reload restores the view) > the user's home coordinates > Hannover.
// ---------------------------------------------------------------

import { handleWPs, getMyMap, enableLiveMode } from './map.js';
import { getHomeCoords } from './mapApi.js';

const DEFAULT_VIEW = { lat: 52.3759, lon: 9.7320, zoom: 13 };

async function initialView() {
    const p    = new URLSearchParams(location.search);
    const zoom = p.has('zoom') ? parseInt(p.get('zoom'), 10) : DEFAULT_VIEW.zoom;
    if (p.has('lat') && p.has('lon')) {
        return { lat: parseFloat(p.get('lat')), lon: parseFloat(p.get('lon')), zoom };
    }
    const home = await getHomeCoords();
    return home ? { lat: home.lat, lon: home.lon, zoom } : { ...DEFAULT_VIEW, zoom };
}

export async function init() {
    await handleWPs([], await initialView());
    enableLiveMode();

    getMyMap().on('click', (e) => {
        if (e.originalEvent.shiftKey || e.originalEvent.ctrlKey) {
            const lat = e.latlng.lat.toFixed(6);
            const lon = e.latlng.lng.toFixed(6);
            window.location = `/cache/new?lat=${lat}&lon=${lon}`;
        }
    });
}
