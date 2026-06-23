import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createTestUser, cleanup, closePool } from '../helpers.js';
import { ocLogin, ocLogout, ocValidateSession } from '../../src/data/sessions.js';

describe('sessions', () => {
  let user;

  before(async () => {
    user = await createTestUser();
  });

  after(async () => {
    await cleanup(user.id, null);
    await closePool();
  });

  it('ocLogin with wrong password returns null', async () => {
    const result = await ocLogin(user.username, 'wrongpassword');
    assert.equal(result, null);
  });

  it('ocLogin with nonexistent user returns null', async () => {
    assert.equal(await ocLogin('nouser_xyz_123', 'testpw'), null);
  });

  it('ocLogin with correct credentials returns user and cookie', async () => {
    // Reset: our test user was created with MD5 hash of 'testpw'
    const result = await ocLogin(user.username, 'testpw');
    assert.ok(result);
    assert.ok(result.user);
    assert.equal(result.user.username, user.username);
    assert.ok(result.cookie && result.cookie.length > 0);
  });

  it('ocValidateSession returns user for valid session', async () => {
    // Login to create a session
    const { cookie } = await ocLogin(user.username, 'testpw');
    const decoded = JSON.parse(Buffer.from(cookie, 'base64').toString());
    const session = await ocValidateSession(decoded.sessionid);
    assert.ok(session);
    assert.equal(session.userId, user.id);
  });

  it('ocValidateSession returns null for invalid UUID', async () => {
    assert.equal(await ocValidateSession('00000000-0000-0000-0000-000000000000'), null);
  });

  it('ocLogout removes session', async () => {
    const { cookie } = await ocLogin(user.username, 'testpw');
    const decoded = JSON.parse(Buffer.from(cookie, 'base64').toString());
    await ocLogout(decoded.sessionid);
    assert.equal(await ocValidateSession(decoded.sessionid), null);
  });
});
