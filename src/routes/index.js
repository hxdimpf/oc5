import { ocGetCacheCounts } from '../data/caches.js';

export async function home(req, res) {
  const data = await ocGetCacheCounts();
  res.render('index/index.njk', data);
}
