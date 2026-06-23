import { ocSearchCachesByBounds, ocCountCachesInBounds } from '../data/caches.js';

export async function liveCaches(req, res) {
  const lat1 = parseFloat(req.query.lat1) || 0;
  const lat2 = parseFloat(req.query.lat2) || 0;
  const lon1 = parseFloat(req.query.lon1) || 0;
  const lon2 = parseFloat(req.query.lon2) || 0;
  const minDiff = parseInt(req.query.minDiff) || 2;
  const maxDiff = parseInt(req.query.maxDiff) || 10;
  const userId = req.user.id;
  const maxItems = 5000;

  if (lat1 >= lat2 || lon1 >= lon2) return res.json({ count: 0, items: [] });

  const sLat = Math.min(lat1, lat2), nLat = Math.max(lat1, lat2);
  const wLon = Math.min(lon1, lon2), eLon = Math.max(lon1, lon2);

  const count = await ocCountCachesInBounds(sLat, nLat, wLon, eLon, minDiff, maxDiff);
  if (count > maxItems) return res.json({ count, items: [] });

  const rows = await ocSearchCachesByBounds({ sLat, nLat, wLon, eLon, minDiff, maxDiff, maxItems }, userId);
  const items = rows.map(r => ({
    _id: r.referenceCode, referenceCode: r.referenceCode, platform: 'OC', name: r.name,
    lat: r.hasCC ? r.ccLat : r.listingLat, lon: r.hasCC ? r.ccLon : r.listingLon,
    listingLat: r.listingLat, listingLon: r.listingLon,
    geocacheType: { id: r.typeId, name: r.typeName }, geocacheSize: { id: r.sizeId, name: r.sizeName },
    difficulty: r.difficulty, terrain: r.terrain, isArchived: false, isDisabled: r.status === 2,
    isFound: !!r.isFound, foundDate: r.foundDate ? new Date(r.foundDate).toISOString().slice(0, 10) : '',
    isOwned: !!r.isOwned, isSelected: false, ownerAlias: r.ownerAlias, ownerCode: String(r.ownerCode),
    publishedDate: new Date(r.publishedDate).toISOString().slice(0, 10),
    favoritePoints: r.favoritePoints, findCount: r.findCount,
    shortName: r.name.length > 25 ? r.name.slice(0, 25) + '…' : r.name,
    hasPCN: !!r.hasPCN, hasCC: !!r.hasCC, pcn: r.pcnText || '', isOcOnly: !!r.isOcOnly,
  }));
  res.json({ count, items });
}
