import pool from './db.js';

/**
 * Auth middleware — reads the legacy ocdevelopmentdata cookie,
 * validates against sys_sessions, loads the user. No ORM, no firewall.
 *
 * Sets req.user = { id: number, username: string|null, roles: string[] }
 * Anonymous users get id=0.
 */
export default async function auth(req, res, next) {
  // Default anonymous user
  req.user = { id: 0, username: null, roles: [] };

  try {
    const raw = req.cookies?.ocdevelopmentdata;
    if (!raw) return next();

    const data = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    if (!data.userid || !data.sessionid) return next();

    const userId = parseInt(data.userid, 10);
    const sessionId = data.sessionid;

    // Validate session exists and user is active
    const [row] = await pool.query(
      `SELECT s.user_id FROM sys_sessions s
       JOIN user u ON s.user_id = u.user_id
       WHERE s.uuid = ? AND u.is_active_flag = 1`,
      [sessionId]
    );

    if (!row) return next();

    // Load full user
    const [user] = await pool.query(
      'SELECT * FROM user WHERE user_id = ?',
      [userId]
    );

    if (user) {
      // Load roles
      const roles = await pool.query(
        `SELECT sr.role FROM user_roles ur
         JOIN security_roles sr ON ur.role_id = sr.id
         WHERE ur.user_id = ?`,
        [userId]
      );

      req.user = {
        id: user.user_id,
        username: user.username,
        roles: roles.map(r => r.role),
      };
    }
  } catch (e) {
    // Invalid cookie or DB error — remain anonymous
  }

  next();
}
