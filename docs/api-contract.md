# OC5 API Contract — UniCache Shape

The frontend (`cache.js`, `map.js`) expects these shapes from the API. This document is the contract — if a property changes here, the frontend must change too.

---

## `GET /api/cache/:wp` → Cache Detail

Returned by `ocGetCacheDetail(wp, userId)` in `data/caches.js`.

| Property | Type | Description |
|----------|------|-------------|
| `referenceCode` | string | OC waypoint, e.g. `"OC18BB7"` |
| `name` | string | Cache name |
| `shortName` | string | Truncated to 25 chars |
| `geocacheType` | `{id, name, svgName}` | Cache type |
| `geocacheSize` | `{id, name}` | Cache size |
| `difficulty` | number | 1.0–5.0 |
| `terrain` | number | 1.0–5.0 |
| `status` | string | e.g. `"Active"`, `"Disabled"` |
| `lat` | number | Decimal latitude (corrected if hasCC) |
| `lon` | number | Decimal longitude (corrected if hasCC) |
| `postedCoordinates` | `{latitude, longitude}` | Original listing coords |
| `postedCoordsFmt` | string | DM format, e.g. `"N52 20.171 E009 36.865"` |
| `correctedCoordinates` | `{latitude, longitude} \| null` | User's corrected coords |
| `correctedCoordsFmt` | string | DM format or empty |
| `wpGc` | string | GC waypoint if cross-listed |
| `ownerCode` | string | Owner username |
| `logpw` | string | Log password (empty if none) |
| `requiresPasswd` | boolean | Whether log password is required |
| `owner` | `{userId, username, joinedDateFmt, findCount, hideCount, profileUrl}` | Owner info |
| `hints` | string | Cache hint |
| `sanitizedDescription` | string | HTML-safe description |
| `descDarkUnsafe` | boolean | Whether description needs light island in dark mode |
| `additionalWaypoints` | `Waypoint[]` | Additional waypoints |
| `attributes` | `Attribute[]` | Cache attributes |
| `logs` | `Log[]` | Last 30 log entries |
| `isOwned` | boolean | Current user is owner |
| `isFound` | boolean | Current user has logged a find |
| `isDNF` | boolean | Current user has logged a DNF (and not found since) |
| `foundDate` | string \| null | Date of last find by current user |
| `foundDateFmt` | string | Formatted or empty |
| `dnfDate` | string \| null | Date of DNF |
| `dnfDateFmt` | string | Formatted or empty |
| `hasCC` | boolean | Has corrected coordinates |
| `hasPCN` | boolean | Has personal cache note |
| `pcn` | string \| null | Personal cache note text |
| `findCount` | number | Total finds |
| `favoritePoints` | number | Total recommendations |
| `isWatched`, `isCached`, `isGuessable`, `isPartial`, `isSelected` | boolean | User-specific flags (not yet implemented) |
| `listingOutdated` | boolean | Listing needs update |
| `needsMaintenance` | boolean | Cache needs maintenance |
| `location` | `{country, state, countryCode}` | Location info |
| `placedDateFmt` | string | Date hidden |
| `publishedDate` | string | Date published (ISO format) |
| `publishedDateFmt` | string | Date published (formatted) |
| `isOcOnly` | boolean | Not cross-listed |
| `isArchived` | boolean | Status = Archived |
| `isDisabled` | boolean | Status = Temporarily unavailable |
| `ianaTimezoneId` | string | Timezone, default `"Europe/Berlin"` |
| `logTypes` | number[] | Allowed log type IDs for current user |

### Waypoint

| Property | Type | Description |
|----------|------|-------------|
| `latitude` | number | Decimal |
| `longitude` | number | Decimal |
| `location` | string | `"lat\|lon"` |
| `myCoords` | string | DM format |
| `prefix` | string | Two-letter abbreviation |
| `typeId` | number | Subtype ID (1–5) |
| `type` | string | Type name |
| `typeName` | string | Type name (redundant, legacy) |
| `type_name` | string | Type name (redundant, legacy) |
| `name` | string | Same as type name |
| `description` | string | User-provided note |
| `icon` | string | Icon path, e.g. `"/images/waypoints/wp_parking.png"` |

### Log

| Property | Type | Description |
|----------|------|-------------|
| `id` | number | Log ID |
| `uuid` | string | Log UUID |
| `type` | number | Log type ID |
| `typeName` | string | Human-readable type name |
| `date` | string | `"YYYY-MM-DD"` |
| `username` | string | Author username |
| `text` | string | Log text |
| `textHtml` | boolean | Whether text contains HTML |
| `itsMine` | boolean | Whether current user authored this log |

---

## `GET /api/caches/search?q=&type=&minDiff=&maxDiff=` → Search Results

| Property | Type |
|----------|------|
| `items` | `CacheSummary[]` |

### CacheSummary

| Property | Type |
|----------|------|
| `referenceCode` | string |
| `name` | string |
| `shortName` | string |
| `lat` | number |
| `lon` | number |
| `geocacheType` | `{id, name}` |
| `difficulty` | number |
| `terrain` | number |
| `ownerAlias` | string |
| `ownerCode` | string |
| `publishedDate` | string |
| `status` | number |
| `isDisabled` | boolean |
| `isArchived` | boolean |
| `isOwned` | boolean |

---

## `GET /api/caches/live?lat1=&lat2=&lon1=&lon2=` → Livemap Data

| Property | Type |
|----------|------|
| `count` | number |
| `items` | `LiveCacheSummary[]` |

### LiveCacheSummary

Same as CacheSummary plus: `listingLat`, `listingLon`, `geocacheSize`, `isFound`, `foundDate`, `hasCC`, `hasPCN`, `favoritePoints`, `findCount`, `isOcOnly`, `pcn`.

---

## `POST /api/cache/:wp/log` → Log Creation

**Request:** `{ type: number, date: string, text: string, password?: string }`

**Response:** `{ saved: true, log: { id, type, date, text } }`

**Errors:** `LOG_PASSWORD` (403), `OWNER_ONLY` (403), `DUPLICATE_LOG` (409), `LOGIN_REQUIRED` (401)

---

## Error Shape (all endpoints)

```json
{
  "error": {
    "code": "LOG_PASSWORD",
    "status": 403,
    "message": "Log password required"
  }
}
```
