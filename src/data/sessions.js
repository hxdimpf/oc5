import pool from '../db.js';
import { rhex, now } from './shared.js';

// ── Login / Logout ────────────────────────────────────────────────────

export async function ocLogin(username, password) {
  const [user] = await pool.query('SELECT * FROM user WHERE username = ?', [username]);
  if (!user) return null;

  const crypto = await import('crypto');
  if (crypto.createHash('md5').update(password).digest('hex') !== user.password) return null;

  const uuid = `${rhex(4)}-${rhex(2)}-4${rhex(3)}-${'89ab'[Math.floor(Math.random()*4)]}${rhex(3)}-${rhex(6)}`;

  await pool.query(
    'INSERT INTO sys_sessions (uuid, user_id, permanent, last_login) VALUES (?, ?, 0, ?)',
    [uuid, user.user_id, now()]
  );

  const cookieData = Buffer.from(JSON.stringify({
    userid: user.user_id,
    username: user.username,
    sessionid: uuid,
    permanent: 0,
    lastlogin: now(),
  })).toString('base64');

  return { user, cookie: cookieData };
}

export async function ocLogout(sessionId) {
  if (sessionId) {
    await pool.query('DELETE FROM sys_sessions WHERE uuid = ?', [sessionId]);
  }
}

export async function ocValidateSession(uuid) {
  const [row] = await pool.query(
    `SELECT s.user_id, u.username
     FROM sys_sessions s
     JOIN user u ON s.user_id = u.user_id
     WHERE s.uuid = ? AND u.is_active_flag = 1`,
    [uuid]
  );
  if (!row) return null;

  // Load roles
  const roles = await pool.query(
    `SELECT r.name FROM user_roles ur
     JOIN security_roles r ON ur.role_id = r.id
     WHERE ur.user_id = ?`,
    [row.user_id]
  );

  return {
    userId: row.user_id,
    username: row.username,
    roles: roles.map(r => r.name),
  };
}
