import { createPool } from 'mariadb';
import 'dotenv/config';

const url = new URL(process.env.DATABASE_URL);

const pool = createPool({
  host: url.hostname,
  port: url.port || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.replace('/', ''),
  connectionLimit: 10,
  acquireTimeout: 5000,   // fail fast instead of hanging forever
  connectTimeout: 5000,
});

export default pool;
