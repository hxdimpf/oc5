const pool = require('../db');

module.exports = async function index(req, res) {
  const [cacheRow, logRow, userRow] = await Promise.all([
    pool.query('SELECT COUNT(*) as count FROM caches WHERE status = 1'),
    pool.query('SELECT COUNT(*) as count FROM cache_logs'),
    pool.query("SELECT COUNT(*) as count FROM user WHERE is_active_flag = 1"),
  ]);

  res.render('index/index.njk', {
    cacheCount: cacheRow[0].count,
    logCount: logRow[0].count,
    userCount: userRow[0].count,
  });
};
