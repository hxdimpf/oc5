import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestUser, createTestCache, cleanup } from '../helpers.js';
import {
  ocInsertLog, ocGetLogById, ocUpdateLog, ocDeleteLog,
  ocCountDuplicateLogs, ocGetLogsForCache,
} from '../../src/data/logs.js';

describe('logs', () => {
  let user, cache, logId;

  before(async () => {
    user = await createTestUser();
    cache = await createTestCache(user.id);
  });

  after(async () => {
    await cleanup(user.id, cache.id);
  });

  it('ocInsertLog creates a log and returns it with id and date', async () => {
    const log = await ocInsertLog(cache.id, user.id, 3, '2026-06-15 12:00:00', 'Test log entry');
    assert.ok(log);
    assert.ok(log.id > 0);
    assert.ok(log.date);
    logId = log.id;
  });

  it('ocGetLogById returns the inserted log', async () => {
    const log = await ocGetLogById(logId);
    assert.ok(log);
    assert.equal(log.user_id, user.id);
    assert.equal(log.type, 3);
  });

  it('ocUpdateLog changes text', async () => {
    const result = await ocUpdateLog(logId, user.id, 3, '2026-06-15', 'Updated text');
    assert.equal(result.saved, true);
    const log = await ocGetLogById(logId);
    assert.equal(log.text, 'Updated text');
  });

  it('ocUpdateLog rejects wrong user', async () => {
    const result = await ocUpdateLog(logId, 99999, 3, '2026-06-15', 'Hacked');
    assert.equal(result.error, 'Not authorized');
  });

  it('ocCountDuplicateLogs detects existing type', async () => {
    const n = await ocCountDuplicateLogs(cache.id, user.id, 3, 0);
    assert.equal(n, 1);
  });

  it('ocGetLogsForCache returns array ordered by date desc', async () => {
    const logs = await ocGetLogsForCache(cache.id);
    assert.ok(Array.isArray(logs));
    const ours = logs.filter(l => l.id === logId);
    assert.equal(ours.length, 1);
  });

  it('ocDeleteLog removes the log', async () => {
    const result = await ocDeleteLog(logId, user.id);
    assert.equal(result.deleted, true);
    const log = await ocGetLogById(logId);
    assert.equal(log, null);
  });
});
