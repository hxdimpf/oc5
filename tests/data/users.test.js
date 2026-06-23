import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { closePool } from '../helpers.js';
import {
  ocCheckUsername, ocCheckEmail, ocCreateUser, ocGetUserProfile,
  ocSearchUsers, ocGetUserByEmail,
} from '../../src/data/users.js';
import pool from '../../src/db.js';

const SUFFIX = `_ut${Date.now()}`;

describe('users', () => {
  let userId;

  after(async () => {
    if (userId) {
      await pool.query('DELETE FROM user WHERE user_id = ?', [userId]);
    }
    await closePool();
  });

  it('ocCheckUsername returns false for unique name', async () => {
    assert.equal(await ocCheckUsername(`nonexistent${SUFFIX}`), false);
  });

  it('ocCheckEmail returns false for unique email', async () => {
    assert.equal(await ocCheckEmail(`noone${SUFFIX}@test.local`), false);
  });

  it('ocCreateUser inserts and returns user_id', async () => {
    const result = await ocCreateUser({
      username: `testreg${SUFFIX}`,
      email: `testreg${SUFFIX}@test.local`,
      password: 'testpass123',
    });
    assert.ok(result.user_id > 0);
    assert.equal(result.username, `testreg${SUFFIX}`);
    userId = result.user_id;
  });

  it('ocCheckUsername returns true for taken name', async () => {
    assert.equal(await ocCheckUsername(`testreg${SUFFIX}`), true);
  });

  it('ocGetUserProfile returns user with stats', async () => {
    const user = await ocGetUserProfile(userId);
    assert.ok(user);
    assert.equal(user.username, `testreg${SUFFIX}`);
    assert.equal(typeof user.findCount, 'number');
  });

  it('ocSearchUsers finds created user', async () => {
    const users = await ocSearchUsers(`testreg${SUFFIX}`);
    assert.ok(users.some(u => u.user_id === userId));
  });

  it('ocGetUserByEmail finds user by email', async () => {
    const user = await ocGetUserByEmail(`testreg${SUFFIX}@test.local`);
    assert.ok(user);
    assert.equal(user.user_id, userId);
  });
});
