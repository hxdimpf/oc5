const pool = require('../db');

module.exports = {
  searchPage: (req, res) => res.render('user/search.njk'),

  apiSearch: async function (req, res) {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ items: [] });

    const rows = await pool.query(
      `SELECT u.user_id, u.username,
        IFNULL(s.found, 0) AS find_count,
        IFNULL(s.hidden, 0) AS hide_count
       FROM user u
       LEFT JOIN stat_user s ON u.user_id = s.user_id
       WHERE u.username LIKE ?
       ORDER BY u.username ASC LIMIT 20`,
      [`%${q}%`]
    );

    const items = rows.map(r => ({
      userId: r.user_id,
      username: r.username,
      findCount: r.find_count,
      hideCount: r.hide_count,
      profileUrl: `/user/profile/${r.user_id}`,
    }));

    res.json({ items });
  },

  profile: async function (req, res) {
    const [user] = await pool.query(
      'SELECT * FROM user WHERE user_id = ?', [req.params.id]
    );
    if (!user) return res.status(404).send('User not found');

    const [[stats]] = await pool.query(
      'SELECT IFNULL(found, 0) AS findCount, IFNULL(hidden, 0) AS hideCount FROM stat_user WHERE user_id = ?',
      [req.params.id]
    );
    if (stats) {
      user.findCount = stats.findCount;
      user.hideCount = stats.hideCount;
    }

    res.render('user/detailview.njk', { profile: user });
  },
};
