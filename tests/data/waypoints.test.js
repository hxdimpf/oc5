import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestUser, createTestCache, cleanup, closePool } from '../helpers.js';
import {
  ocGetWaypointsByCacheId, ocReplaceWaypoints,
  ocSaveUserCoords, ocSaveLogPassword, ocGetUserNote, ocSaveUserNoteText,
} from '../../src/data/waypoints.js';

describe('waypoints', () => {
  let user, cache;

  before(async () => {
    user = await createTestUser();
    cache = await createTestCache(user.id);
  });

  after(async () => {
    await cleanup(user.id, cache.id);
    await closePool();
  });

  it('ocGetWaypointsByCacheId returns empty array for cache with no waypoints', async () => {
    const wpts = await ocGetWaypointsByCacheId(cache.id);
    assert.ok(Array.isArray(wpts));
    assert.equal(wpts.length, 0);
  });

  it('ocReplaceWaypoints inserts and ocGetWaypointsByCacheId returns them', async () => {
    await ocReplaceWaypoints(cache.id, [
      { subtype: 1, latitude: 51.16, longitude: 10.44, description: 'Parking here' },
      { subtype: 4, latitude: 51.17, longitude: 10.45, description: 'Final location' },
    ]);
    const wpts = await ocGetWaypointsByCacheId(cache.id);
    assert.equal(wpts.length, 2);
    assert.equal(wpts[0].typeId, 1);
    assert.ok(wpts[0].icon.includes('wp_parking'));
    assert.equal(wpts[0].myCoords.length > 0, true);
    assert.equal(wpts[1].typeId, 4);
    assert.ok(wpts[1].icon.includes('wp_final'));
  });

  it('ocReplaceWaypoints replaces existing waypoints', async () => {
    await ocReplaceWaypoints(cache.id, [
      { subtype: 2, latitude: 51.18, longitude: 10.46, description: 'Ref point' },
    ]);
    const wpts = await ocGetWaypointsByCacheId(cache.id);
    assert.equal(wpts.length, 1);
    assert.equal(wpts[0].typeId, 2);
  });

  it('ocSaveUserCoords creates coordinate record', async () => {
    await ocSaveUserCoords(cache.id, user.id, 52.0, 9.5);
    const note = await ocGetUserNote(cache.id, user.id);
    assert.ok(note);
    assert.equal(note.latitude, 52.0);
    assert.equal(note.longitude, 9.5);
  });

  it('ocSaveLogPassword sets password on same note record', async () => {
    await ocSaveLogPassword(cache.id, user.id, 'secret123');
    const note = await ocGetUserNote(cache.id, user.id);
    assert.equal(note.logpw, 'secret123');
  });

  it('ocSaveUserNoteText saves note text', async () => {
    await ocSaveUserNoteText(cache.id, user.id, 'My personal note');
    const note = await ocGetUserNote(cache.id, user.id);
    assert.equal(note.description, 'My personal note');
  });

  it('ocSaveUserNoteText with empty text deletes the note', async () => {
    await ocSaveUserNoteText(cache.id, user.id, '');
    const note = await ocGetUserNote(cache.id, user.id);
    assert.equal(note, null);
  });
});
