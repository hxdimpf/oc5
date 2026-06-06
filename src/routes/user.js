import { ocSearchUsers, ocGetUserProfile } from '../ocapi.js';

export async function apiSearch(req, res) {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ items: [] });
  const rows = await ocSearchUsers(q);
  res.json({ items: rows.map(r => ({ userId: r.user_id, username: r.username, findCount: r.find_count, hideCount: r.hide_count, profileUrl: `/user/profile/${r.user_id}` })) });
}

export async function profile(req, res) {
  const user = await ocGetUserProfile(req.params.id);
  if (!user) return res.status(404).send('User not found');
  res.render('user/detailview.njk', { profile: user });
}
