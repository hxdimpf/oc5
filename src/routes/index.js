import { ocGetCacheCounts } from '../ocapi.js';

export async function home(req, res) {
  const data = await ocGetCacheCounts();
  res.render('index/index.njk', data);
}
