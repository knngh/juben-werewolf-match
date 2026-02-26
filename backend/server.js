const express = require('express');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { sign, middleware, requireAuth } = require('./auth');

require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(middleware);

// 游戏类型/风格等选项（前端可复用）
const GAME_TYPES = ['剧本杀', '狼人杀', '血染钟楼', '其他桌游'];
const PLAY_STYLES = ['推理型', '欢乐型', '沉浸型', '竞技型', '社交型'];
const PREFERRED_ROLES = ['侦探', '凶手', '平民', '狼人', '神职', '无所谓'];

app.get('/api/options', (req, res) => {
  res.json({
    code: 0,
    data: { gameTypes: GAME_TYPES, playStyles: PLAY_STYLES, preferredRoles: PREFERRED_ROLES },
  });
});

// 注册
app.post(
  '/api/register',
  [
    body('nickname').trim().isLength({ min: 1, max: 20 }).withMessage('昵称 1-20 字'),
    body('password').isLength({ min: 6 }).withMessage('密码至少 6 位'),
    body('phone').optional().trim(),
    body('wechat').optional().trim(),
  ],
  async (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
      return res.status(400).json({ code: 400, message: err.array()[0].msg });
    }
    const { nickname, password, phone, wechat } = req.body;
    if (!phone && !wechat) {
      return res.status(400).json({ code: 400, message: '请填写手机号或微信号' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    try {
      const r = db.prepare(
        'INSERT INTO users (nickname, password_hash, phone, wechat) VALUES (?, ?, ?, ?)'
      ).run(nickname, password_hash, phone || null, wechat || null);
      const userId = r.lastInsertRowid;
      db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(userId);
      const token = sign(userId);
      res.json({ code: 0, data: { token, userId, nickname } });
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        return res.status(400).json({ code: 400, message: '手机号或微信号已注册' });
      }
      throw e;
    }
  }
);

// 登录（手机或微信号 + 密码）
app.post(
  '/api/login',
  [
    body('phone').optional().trim(),
    body('wechat').optional().trim(),
    body('password').notEmpty().withMessage('请输入密码'),
  ],
  async (req, res) => {
    const { phone, wechat, password } = req.body;
    if (!phone && !wechat) {
      return res.status(400).json({ code: 400, message: '请填写手机号或微信号' });
    }
    const user = db.prepare(
      'SELECT id, nickname, password_hash FROM users WHERE phone = ? OR wechat = ?'
    ).get(phone || null, wechat || null);
    if (!user) {
      return res.status(401).json({ code: 401, message: '用户不存在' });
    }
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ code: 401, message: '密码错误' });
    }
    const token = sign(user.id);
    res.json({ code: 0, data: { token, userId: user.id, nickname: user.nickname } });
  }
);

// 当前用户信息 + 资料（偏好）
app.get('/api/me', requireAuth, (req, res) => {
  const u = db.prepare('SELECT id, nickname, avatar, gender, phone, wechat, created_at FROM users WHERE id = ?').get(req.userId);
  if (!u) return res.status(404).json({ code: 404, message: '用户不存在' });
  const p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId);
  const profile = p ? {
    gameTypes: JSON.parse(p.game_types || '[]'),
    playStyles: JSON.parse(p.play_styles || '[]'),
    preferredRoles: JSON.parse(p.preferred_roles || '[]'),
    playFreq: p.play_freq,
    intro: p.intro,
    city: p.city,
  } : {};
  res.json({ code: 0, data: { ...u, profile } });
});

// 更新资料（偏好 / 简介 / 城市等）
app.post(
  '/api/profile',
  requireAuth,
  [
    body('gameTypes').optional().isArray(),
    body('playStyles').optional().isArray(),
    body('preferredRoles').optional().isArray(),
    body('playFreq').optional().trim(),
    body('intro').optional().trim(),
    body('city').optional().trim(),
  ],
  (req, res) => {
    const { gameTypes, playStyles, preferredRoles, playFreq, intro, city } = req.body;
    db.prepare(
      `UPDATE profiles SET game_types=?, play_styles=?, preferred_roles=?, play_freq=?, intro=?, city=?, updated_at=datetime('now') WHERE user_id=?`
    ).run(
      JSON.stringify(gameTypes || []),
      JSON.stringify(playStyles || []),
      JSON.stringify(preferredRoles || []),
      playFreq || '',
      intro || '',
      city || '',
      req.userId
    );
    res.json({ code: 0, message: '保存成功' });
  }
);

// 发现页：推荐用户（排除自己、已点赞、已匹配），按偏好相似度简单排序
app.get('/api/discover', requireAuth, (req, res) => {
  const me = req.userId;
  const myProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(me);
  const myGameTypes = myProfile ? JSON.parse(myProfile.game_types || '[]') : [];
  const myStyles = myProfile ? JSON.parse(myProfile.play_styles || '[]') : [];

  const liked = db.prepare('SELECT to_user_id FROM likes WHERE from_user_id = ?').all(me).map(r => r.to_user_id);
  const whoLikedMe = db.prepare('SELECT from_user_id FROM likes WHERE to_user_id = ?').all(me).map(r => r.from_user_id);
  const matched = [...new Set([...liked, ...whoLikedMe])];
  const exclude = [me, ...matched];
  const placeholders = exclude.map(() => '?').join(',');

  let users = db.prepare(`
    SELECT u.id, u.nickname, u.avatar, u.gender, p.game_types, p.play_styles, p.intro, p.city
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id NOT IN (${placeholders})
  `).all(...exclude);

  users = users.map(u => ({
    ...u,
    gameTypes: JSON.parse(u.game_types || '[]'),
    playStyles: JSON.parse(u.play_styles || '[]'),
    game_types: undefined,
    play_styles: undefined,
  }));

  // 简单相似度：共同 gameTypes + playStyles 数量
  users.forEach(u => {
    const g = (u.gameTypes || []).filter(x => myGameTypes.includes(x)).length;
    const s = (u.playStyles || []).filter(x => myStyles.includes(x)).length;
    u._score = g + s;
  });
  users.sort((a, b) => (b._score || 0) - (a._score || 0));
  const list = users.slice(0, 20).map(({ _score, ...u }) => u);

  res.json({ code: 0, data: list });
});

// 点赞
app.post('/api/like/:userId', requireAuth, (req, res) => {
  const toUserId = parseInt(req.params.userId, 10);
  if (!toUserId || toUserId === req.userId) {
    return res.status(400).json({ code: 400, message: '无效用户' });
  }
  try {
    db.prepare('INSERT INTO likes (from_user_id, to_user_id) VALUES (?, ?)').run(req.userId, toUserId);
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.json({ code: 0, data: { matched: false }, message: '已经点过赞' });
    }
    throw e;
  }
  const mutual = db.prepare('SELECT 1 FROM likes WHERE from_user_id = ? AND to_user_id = ?').get(toUserId, req.userId);
  res.json({ code: 0, data: { matched: !!mutual }, message: mutual ? '匹配成功！' : '已点赞' });
});

// 匹配列表（互相点赞的人）
app.get('/api/matches', requireAuth, (req, res) => {
  const me = req.userId;
  const myLikes = db.prepare('SELECT to_user_id FROM likes WHERE from_user_id = ?').all(me).map(r => r.to_user_id);
  const theirLikes = db.prepare('SELECT from_user_id FROM likes WHERE to_user_id = ?').all(me).map(r => r.from_user_id);
  const matchIds = myLikes.filter(id => theirLikes.includes(id));
  if (matchIds.length === 0) {
    return res.json({ code: 0, data: [] });
  }
  const placeholders = matchIds.map(() => '?').join(',');
  const users = db.prepare(`
    SELECT u.id, u.nickname, u.avatar, u.gender, u.wechat, p.intro, p.city
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id IN (${placeholders})
  `).all(...matchIds);
  res.json({ code: 0, data: users });
});

app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
});
