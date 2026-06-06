import { ocSearchCachesByBox, ocCountCachesInBounds } from '../ocapi.js';

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

  const count = await ocCountCachesInBounds(lat1, lat2, lon1, lon2, minDiff, maxDiff);
  if (count > maxItems) return res.json({ count, items: [] });

  const rows = await ocSearchCachesByBox(lat1, lat2, lon1, lon2, minDiff, maxDiff, userId, maxItems);
  const items = rows.map(r => {
    const hasCC = !!r.hasCC;
    return {
      _id: r.referenceCode, referenceCode: r.referenceCode, platform: 'OC', name: r.name,
      lat: hasCC ? r.ccLat : r.listingLat, lon: hasCC ? r.ccLon : r.listingLon,
      listingLat: r.listingLat, listingLon: r.listingLon,
      geocacheType: { id: r.typeId, name: r.typeName }, geocacheSize: { id: r.sizeId, name: r.sizeName },
      difficulty: r.difficulty, terrain: r.terrain, isArchived: false, isDisabled: r.status===2,
      isFound: !!r.isFound, foundDate: r.foundDate ? new Date(r.foundDate).toISOString().slice(0,10) : '',
      isOwned: !!r.isOwned, isSelected: false, ownerAlias: r.ownerAlias, ownerCode: String(r.ownerCode),
      publishedDate: new Date(r.publishedDate).toISOString().slice(0,10),
      favoritePoints: r.favoritePoints, findCount: r.findCount,
      shortName: r.name.length > 25 ? r.name.slice(0,25)+'…' : r.name,
      hasPCN: !!r.hasPCN, hasCC, pcn: r.pcnText||'', isOcOnly: !!r.isOcOnly,
    };
  });
  res.json({ count, items });
}
