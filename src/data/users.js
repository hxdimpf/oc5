import pool from '../db.js';
import { rhex, now } from './shared.js';

// ── User profile & search ──────────────────────────────────────────────

export async function ocSearchUsers(q) {
  return pool.query(
    `SELECT u.user_id, u.username, IFNULL(s.found,0) AS find_count, IFNULL(s.hidden,0) AS hide_count
     FROM user u
     LEFT JOIN stat_user s ON u.user_id = s.user_id
     WHERE u.username LIKE ?
     ORDER BY u.username ASC LIMIT 20`,
    [`%${q}%`]
  );
}

/** Home coordinates for a user, or null when unset (0/0) or unknown. */
export async function ocGetUserHomeCoords(userId) {
  const [user] = await pool.query('SELECT latitude, longitude FROM user WHERE user_id = ?', [userId]);
  if (!user || (user.latitude === 0 && user.longitude === 0)) return null;
  return { lat: user.latitude, lon: user.longitude };
}

export async function ocGetUserProfile(userId) {
  const [user] = await pool.query('SELECT * FROM user WHERE user_id = ?', [userId]);
  if (!user) return null;
  const [stats] = await pool.query(
    'SELECT IFNULL(found,0) AS findCount, IFNULL(hidden,0) AS hideCount FROM stat_user WHERE user_id = ?',
    [userId]
  );
  if (stats) {
    user.findCount = Number(stats.findCount);
    user.hideCount = Number(stats.hideCount);
  }
  return user;
}

// ── Registration ──────────────────────────────────────────────────────

export async function ocCheckUsername(username) {
  const [row] = await pool.query('SELECT user_id FROM user WHERE username = ?', [username]);
  return !!row;
}

export async function ocCheckEmail(email) {
  const [row] = await pool.query('SELECT user_id FROM user WHERE email = ?', [email]);
  return !!row;
}

export async function ocGetUserByEmail(email) {
  const [user] = await pool.query('SELECT * FROM user WHERE email = ?', [email]);
  return user || null;
}

export async function ocCreateUser(data) {
  const crypto = await import('crypto');
  const passwordHash = crypto.createHash('md5').update(data.password).digest('hex');
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO user (uuid, username, email, password, date_created, last_modified, last_login,
        is_active_flag, latitude, longitude, last_name, first_name, pmr_flag, permanent_login_flag,
        activation_code, description, node)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, 0, 0, 0, '', '', 0, 0, '', '', 4)`,
      [data.username, data.email, passwordHash, now(), now(), now()]
    );
    const [r] = await conn.query('SELECT LAST_INSERT_ID() as id');
    return { user_id: Number(r.id), username: data.username };
  } finally {
    conn.release();
  }
}

export async function ocCreateActivationCode(userId) {
  const code = `${rhex(4)}-${rhex(8)}`;
  await pool.query('UPDATE user SET newpw = ?, newpw_date = ? WHERE user_id = ?', [code, now(), userId]);
  return code;
}

export async function ocActivateUser(code) {
  const [user] = await pool.query(
    "SELECT user_id FROM user WHERE newpw = ? AND is_active_flag = 0", [code]
  );
  if (!user) return null;
  await pool.query("UPDATE user SET is_active_flag = 1, newpw = '', newpw_date = NULL WHERE user_id = ?", [user.user_id]);
  return user;
}

// ── Password reset ────────────────────────────────────────────────────

export async function ocSetPasswordResetToken(email) {
  const [user] = await pool.query('SELECT * FROM user WHERE email = ?', [email]);
  if (!user) return null;
  const token = `${rhex(4)}-${rhex(8)}`;
  await pool.query('UPDATE user SET newpw = ?, newpw_date = ? WHERE user_id = ?', [token, now(), user.user_id]);
  return { user, token };
}

export async function ocResetPassword(token, newPassword) {
  const [user] = await pool.query('SELECT user_id FROM user WHERE newpw = ?', [token]);
  if (!user) return null;
  const crypto = await import('crypto');
  const passwordHash = crypto.createHash('md5').update(newPassword).digest('hex');
  await pool.query("UPDATE user SET password = ?, newpw = '', newpw_date = NULL WHERE user_id = ?",
    [passwordHash, user.user_id]);
  return user;
}
