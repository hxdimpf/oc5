import { describe, it, after } from 'node:test';
import assert from 'node:assert';
import {
  ocGetCacheTypes, ocGetCacheSizes, ocGetCountries,
  ocGetLanguages, ocGetAllAttributes, ocGetWaypointTypes,
} from '../../src/data/lookups.js';

describe('lookups', () => {
  after(async () => {
  });

  it('ocGetCacheTypes returns array with id and name', async () => {
    const types = await ocGetCacheTypes('EN');
    assert.ok(Array.isArray(types));
    assert.ok(types.length >= 6);
    assert.ok(types[0].id > 0);
    assert.ok(types[0].name.length > 0);
  });

  it('ocGetCacheSizes returns array with id and name', async () => {
    const sizes = await ocGetCacheSizes('EN');
    assert.ok(Array.isArray(sizes));
    assert.ok(sizes.length >= 4);
    assert.ok(sizes[0].id > 0);
    assert.ok(sizes[0].name.length > 0);
  });

  it('ocGetCountries returns array with short and name', async () => {
    const countries = await ocGetCountries('EN');
    assert.ok(Array.isArray(countries));
    assert.ok(countries.some(c => c.short === 'DE'));
  });

  it('ocGetLanguages returns array', async () => {
    const langs = await ocGetLanguages('EN');
    assert.ok(Array.isArray(langs));
    assert.ok(langs.length > 0);
  });

  it('ocGetAllAttributes returns filtered array with parsed icons', async () => {
    const attrs = await ocGetAllAttributes();
    assert.ok(Array.isArray(attrs));
    // Icon paths should be filename only (parsed from full paths)
    if (attrs.length > 0) {
      const a = attrs[0];
      assert.ok(a.id > 0);
      assert.ok(a.name.length > 0);
      assert.ok(!(a.icon_undef || '').includes('/'));
      assert.ok(!(a.icon_large || '').includes('/'));
    }
  });

  it('ocGetWaypointTypes returns array', async () => {
    const types = await ocGetWaypointTypes();
    assert.ok(Array.isArray(types));
    assert.ok(types.length >= 5);
    const parking = types.find(t => t.name === 'Parking');
    assert.ok(parking);
  });
});
