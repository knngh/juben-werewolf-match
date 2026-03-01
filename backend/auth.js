const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function sign(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verify(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded.userId;
  } catch {
    return null;
  }
}

function middleware(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const userId = token ? verify(token) : null;
  req.userId = userId;
  next();
}

function requireAuth(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ code: 401, message: '请先登录' });
  }
  next();
}

module.exports = { sign, verify, middleware, requireAuth };
