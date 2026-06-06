const pool = require('../db');

module.exports = {
  liveCaches: async function (req, res) {
    const lat1 = parseFloat(req.query.lat1) || 0;
    const lat2 = parseFloat(req.query.lat2) || 0;
    const lon1 = parseFloat(req.query.lon1) || 0;
    const lon2 = parseFloat(req.query.lon2) || 0;
    const minDiff = parseInt(req.query.minDiff) || 2;
    const maxDiff = parseInt(req.query.maxDiff) || 10;
    const userId = req.user.id;
    const maxItems = 5000;

    if (lat1 >= lat2 || lon1 >= lon2) {
      return res.json({ count: 0, items: [] });
    }

    const [countRow] = await pool.query(
      `SELECT COUNT(*) as count FROM caches
       WHERE latitude > ? AND latitude < ?
         AND longitude > ? AND longitude < ?
         AND status IN (1, 2)
         AND difficulty >= ? AND difficulty <= ?`,
      [lat1, lat2, lon1, lon2, minDiff, maxDiff]
    );

    const count = countRow ? Number(countRow.count) : 0;
    if (count > maxItems) {
      return res.json({ count, items: [] });
    }

    const rows = await pool.query(
      `SELECT
        c.cache_id, c.wp_oc AS referenceCode, c.name,
        c.latitude AS listingLat, c.longitude AS listingLon,
        c.type AS typeId, ct.en AS typeName,
        c.size AS sizeId, cs.name AS sizeName,
        c.difficulty / 2 AS difficulty, c.terrain / 2 AS terrain,
        c.status, u.username AS ownerAlias, u.username AS ownerCode,
        c.user_id AS userId, c.date_created AS publishedDate,
        IFNULL(sc.toprating, 0) AS favoritePoints,
        IFNULL(sc.found, 0) AS findCount,
        IF(c.user_id = ?, 1, 0) AS isOwned,
        IF(fl.id IS NOT NULL, 1, 0) AS isFound,
        MAX(fl.date) AS foundDate,
        IF(pcn.id IS NOT NULL, 1, 0) AS hasPCN,
        IF(pcn.id IS NOT NULL AND pcn.latitude != 0 AND pcn.longitude != 0, 1, 0) AS hasCC,
        pcn.latitude AS ccLat, pcn.longitude AS ccLon,
        pcn.description AS pcnText,
        IF(oc_only.cache_id IS NOT NULL, 1, 0) AS isOcOnly
       FROM caches c
       INNER JOIN cache_type ct ON c.type = ct.id
       INNER JOIN cache_size cs ON c.size = cs.id
       INNER JOIN user u ON c.user_id = u.user_id
       LEFT JOIN stat_caches sc ON c.cache_id = sc.cache_id
       LEFT JOIN caches_attributes oc_only ON oc_only.cache_id = c.cache_id AND oc_only.attrib_id = 6
       LEFT JOIN cache_logs fl ON fl.cache_id = c.cache_id AND fl.user_id = ? AND fl.type IN (1, 7)
       LEFT JOIN coordinates pcn ON pcn.cache_id = c.cache_id AND pcn.user_id = ? AND pcn.type = 2
       WHERE c.latitude > ? AND c.latitude < ?
         AND c.longitude > ? AND c.longitude < ?
         AND c.status IN (1, 2)
         AND c.difficulty >= ? AND c.difficulty <= ?
       GROUP BY c.cache_id ORDER BY c.cache_id
       LIMIT ?`,
      [userId, userId, userId, lat1, lat2, lon1, lon2, minDiff, maxDiff, maxItems]
    );

    const items = rows.map(r => {
      const hasCC = !!r.hasCC;
      return {
        _id: r.referenceCode,
        referenceCode: r.referenceCode,
        platform: 'OC',
        name: r.name,
        lat: hasCC ? r.ccLat : r.listingLat,
        lon: hasCC ? r.ccLon : r.listingLon,
        listingLat: r.listingLat,
        listingLon: r.listingLon,
        geocacheType: { id: r.typeId, name: r.typeName },
        geocacheSize: { id: r.sizeId, name: r.sizeName },
        difficulty: r.difficulty,
        terrain: r.terrain,
        isArchived: false,
        isDisabled: r.status === 2,
        isFound: !!r.isFound,
        foundDate: r.foundDate ? new Date(r.foundDate).toISOString().slice(0, 10) : '',
        isOwned: !!r.isOwned,
        isSelected: false,
        ownerAlias: r.ownerAlias,
        ownerCode: String(r.ownerCode),
        publishedDate: new Date(r.publishedDate).toISOString().slice(0, 10),
        favoritePoints: r.favoritePoints,
        findCount: r.findCount,
        shortName: r.name.length > 25 ? r.name.slice(0, 25) + '…' : r.name,
        hasPCN: !!r.hasPCN,
        hasCC,
        pcn: r.pcnText || '',
        isOcOnly: !!r.isOcOnly,
      };
    });

    res.json({ count, items });
  },
};
