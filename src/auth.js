export default function auth(req, res, next) {
  req.user = { id: 170300, username: 'hxdimpf' };
  next();
}
