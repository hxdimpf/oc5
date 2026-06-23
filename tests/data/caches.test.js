import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestUser, createTestCache, cleanup, closePool } from '../helpers.js';
import {
  ocGetCacheDetail, ocGetCacheCounts, ocGetCacheForEdit,
  ocSearchCachesByBounds, ocSearchCachesByKeyword,
  ocInsertCache, ocUpdateCache, ocGetCacheIdByWp,
  ocIsCacheOwner, ocUpdateCacheStatus,
  ocCountCachesInBounds,
} from '../../src/data/caches.js';

describe('caches', () => {
  let user, cache;

  before(async () => {
    user = await createTestUser();
    cache = await createTestCache(user.id);
  });

  after(async () => {
    await cleanup(user.id, cache.id);
    await closePool();
  });

  // ── Detail ──────────────────────────────────────────────────────────

  it('ocGetCacheDetail returns null for nonexistent WP', async () => {
    assert.equal(await ocGetCacheDetail('ZZZZZZ', 0), null);
  });

  it('ocGetCacheDetail returns full object for existing cache', async () => {
    const c = await ocGetCacheDetail(cache.wp, 0);
    assert.ok(c);
    assert.equal(c.referenceCode, cache.wp);
    assert.equal(typeof c.name, 'string');
    assert.equal(typeof c.difficulty, 'number');
    assert.equal(typeof c.terrain, 'number');
    assert.ok(c.geocacheType && c.geocacheType.id > 0);
    assert.ok(c.geocacheSize && c.geocacheSize.id > 0);
    assert.ok(c.owner && c.owner.userId > 0);
    assert.ok(Array.isArray(c.additionalWaypoints));
    assert.ok(Array.isArray(c.logs));
    assert.ok(Array.isArray(c.attributes));
  });

  it('ocGetCacheDetail recognizes owner', async () => {
    const c = await ocGetCacheDetail(cache.wp, user.id);
    assert.equal(c.isOwned, true);
  });

  // ── Edit ────────────────────────────────────────────────────────────

  it('ocGetCacheForEdit returns null for wrong owner', async () => {
    assert.equal(await ocGetCacheForEdit(cache.wp, 99999), null);
  });

  it('ocGetCacheForEdit returns data for owner', async () => {
    const edit = await ocGetCacheForEdit(cache.wp, user.id);
    assert.ok(edit);
    assert.ok(edit.cache);
    assert.ok(Array.isArray(edit.wpts));
  });

  // ── Update ──────────────────────────────────────────────────────────

  it('ocUpdateCache updates fields and returns wp', async () => {
    const wp = await ocUpdateCache(cache.id, user.id, { name: 'Updated Name' });
    assert.equal(wp, cache.wp);
    const updated = await ocGetCacheDetail(cache.wp, 0);
    assert.equal(updated.name, 'Updated Name');
  });

  // ── Insert ──────────────────────────────────────────────────────────

  it('ocInsertCache creates a new cache with wp_oc', async () => {
    const result = await ocInsertCache({
      user_id: user.id, name: 'New Test Cache', lon: 9.7, lat: 52.4,
      type: 1, country: 'DE', date_hidden: '2026-06-01', size: 1,
      difficulty: 2, terrain: 2, desc: 'desc', hint: 'hint', short_desc: 'short',
    });
    assert.ok(Number(result.id) > 0);
    assert.ok(result.wp_oc.startsWith('OC'));
    await poolDelete(Number(result.id));
  });

  // ── Search ──────────────────────────────────────────────────────────

  it('ocCountCachesInBounds returns a number', async () => {
    const n = await ocCountCachesInBounds(51, 53, 9, 11, 0, 10);
    assert.ok(typeof n === 'number' && n >= 0);
  });

  it('ocSearchCachesByBounds returns array with expected shape', async () => {
    const rows = await ocSearchCachesByBounds({
      sLat: cache.lat - 0.5, nLat: cache.lat + 0.5,
      wLon: cache.lon - 0.5, eLon: cache.lon + 0.5,
      minDiff: 0, maxDiff: 10, maxItems: 100,
    }, 0);
    assert.ok(Array.isArray(rows));
    if (rows.length > 0) {
      const r = rows[0];
      assert.ok(r.referenceCode);
      assert.ok(r.typeId > 0);
      assert.ok(r.typeName);
    }
  });

  it('ocSearchCachesByKeyword finds by name', async () => {
    const rows = await ocSearchCachesByKeyword(cache.wp, 0, 0, 10, false, 0);
    assert.ok(rows.some(r => r.wp_oc === cache.wp));
  });

  // ── Ownership & Status ──────────────────────────────────────────────

  it('ocIsCacheOwner returns true for owner', async () => {
    assert.equal(await ocIsCacheOwner(cache.id, user.id), true);
  });

  it('ocIsCacheOwner returns false for non-owner', async () => {
    assert.equal(await ocIsCacheOwner(cache.id, 0), false);
  });

  it('ocGetCacheIdByWp resolves wp to id', async () => {
    const id = await ocGetCacheIdByWp(cache.wp);
    assert.equal(id, cache.id);
  });

  it('ocUpdateCacheStatus changes status', async () => {
    await ocUpdateCacheStatus(cache.id, 2);
    const c = await ocGetCacheDetail(cache.wp, 0);
    assert.equal(c.isDisabled, true);
    // Restore
    await ocUpdateCacheStatus(cache.id, 1);
  });

  // ── Cache counts ───────────────────────────────────────────────────

  it('ocGetCacheCounts returns numbers', async () => {
    const counts = await ocGetCacheCounts();
    assert.ok(counts.cacheCount >= 0);
    assert.ok(counts.logCount >= 0);
    assert.ok(counts.userCount >= 0);
  });
});

// Helper to clean up caches created in insert test
import pool from '../../src/db.js';
async function poolDelete(id) {
  await pool.query('DELETE FROM cache_desc WHERE cache_id = ?', [id]);
  await pool.query('DELETE FROM caches WHERE cache_id = ?', [id]);
}
