const jwt = require('jsonwebtoken');

const configuredSecret = (process.env.JWT_SECRET || '').trim();
if (process.env.NODE_ENV === 'production') {
  if (configuredSecret.length < 32 || /^(dev-secret|your-)|change-in-production/i.test(configuredSecret)) {
    throw new Error('JWT_SECRET must be a non-example secret of at least 32 characters in production');
  }
  if (process.env.WECHAT_LOGIN_DEV_MODE === 'true') {
    throw new Error('WECHAT_LOGIN_DEV_MODE must be disabled in production');
  }
}
const JWT_SECRET = configuredSecret || 'dev-secret';

function sign(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function verify(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    return Number.isSafeInteger(decoded.userId) && decoded.userId > 0 ? decoded.userId : null;
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
