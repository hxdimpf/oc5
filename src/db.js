const mariadb = require('mariadb');
require('dotenv').config();

const url = new URL(process.env.DATABASE_URL);

const pool = mariadb.createPool({
  host: url.hostname,
  port: url.port || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  connectionLimit: 10,
});

module.exports = pool;
