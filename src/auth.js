export default function auth(req, res, next) {
  // Default anonymous user
  req.user = { id: 0, username: null };

  try {
    const raw = req.cookies?.ocdevelopmentdata;
    if (raw) {
      const data = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
      if (data.userid && data.sessionid) {
        req.user = { id: data.userid, username: data.username || null };
      }
    }
  } catch (e) {
    // Invalid cookie — remain anonymous
  }

  next();
}
