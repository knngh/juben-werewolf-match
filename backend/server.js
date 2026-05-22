require('./env')();

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const db = require('./db');
const { sign, middleware, requireAuth } = require('./auth');
const ai = require('./ai');

const app = express();
const PORT = process.env.PORT || 3000;
const TIANDITU_KEY = process.env.TIANDITU_KEY || '';
const TIANDITU_SEARCH_URL = process.env.TIANDITU_SEARCH_URL || 'https://api.tianditu.gov.cn/v2/search';
const WECHAT_MINIPROGRAM_APPID = process.env.WECHAT_MINIPROGRAM_APPID || '';
const WECHAT_MINIPROGRAM_SECRET = process.env.WECHAT_MINIPROGRAM_SECRET || '';
const WECHAT_CODE2SESSION_URL = process.env.WECHAT_CODE2SESSION_URL || 'https://api.weixin.qq.com/sns/jscode2session';
const WECHAT_LOGIN_DEV_MODE = process.env.WECHAT_LOGIN_DEV_MODE === 'true';
const AI_ENABLED = process.env.AI_ENABLED === 'true';
const AI_PROVIDER = process.env.AI_PROVIDER || '';
const AI_API_KEY = process.env.AI_API_KEY || '';
const AI_MODEL = process.env.AI_MODEL || '';
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 8000;
const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT) || 200;

app.use(cors());
app.use(express.json());
app.use(middleware);

// 游戏类型/风格等选项（前端可复用）
const GAME_TYPES = ['剧本杀', '狼人杀', '血染钟楼', '桌游', '跑团', '其他桌游'];
const PLAY_STYLES = ['推理型', '欢乐型', '沉浸型', '竞技型', '社交型', '阵营型', '合作型'];
const PREFERRED_ROLES = ['侦探', '凶手', '平民', '狼人', '神职', '无所谓'];
const AVAILABILITY_OPTIONS = ['工作日晚', '周五晚', '周末白天', '周末晚上', '节假日', '时间灵活'];
const BUDGET_RANGES = ['50以下', '50-100', '100-200', '200以上', '看局而定'];
const PLAYER_COUNT_RANGES = ['2-4人', '5-8人', '9人以上', '都可以'];
const PLAY_MODES = ['线下', '线上'];
const EXCLUDED_GAME_TYPES = ['麻将', '德州扑克', '象棋', '围棋', '扑克', '棋牌'];
const REQUEST_CERTAINTY = ['confirmed', 'tentative', 'chat_first'];
const REPORT_REASONS = ['骚扰', '鸽局', '虚假信息', '不合适内容', '其他'];
const AI_OPTIONS = {
  gameTypes: GAME_TYPES,
  playStyles: PLAY_STYLES,
  budgetRanges: BUDGET_RANGES,
  playModes: PLAY_MODES,
  excludedGameTypes: EXCLUDED_GAME_TYPES,
  reportReasons: REPORT_REASONS,
};

app.get('/api/options', (req, res) => {
  res.json({
    code: 0,
    data: {
      gameTypes: GAME_TYPES,
      playStyles: PLAY_STYLES,
      preferredRoles: PREFERRED_ROLES,
      availabilityOptions: AVAILABILITY_OPTIONS,
      budgetRanges: BUDGET_RANGES,
      playerCountRanges: PLAYER_COUNT_RANGES,
      playModes: PLAY_MODES,
      requestCertainty: REQUEST_CERTAINTY,
      reportReasons: REPORT_REASONS,
    },
  });
});

app.get('/api/health', (req, res) => {
  try {
    db.prepare('SELECT 1 AS ok').get();
    res.json({
      code: 0,
      data: {
        status: 'ok',
        database: 'ok',
        tiandituConfigured: !!TIANDITU_KEY,
        wechatLoginConfigured: WECHAT_LOGIN_DEV_MODE || !!(WECHAT_MINIPROGRAM_APPID && WECHAT_MINIPROGRAM_SECRET),
        wechatLoginDevMode: WECHAT_LOGIN_DEV_MODE,
        ai: getAiCapabilities(),
        productScope: {
          gameTypes: GAME_TYPES,
          excludedGameTypes: EXCLUDED_GAME_TYPES,
          merchantFeatures: false,
          paymentFeatures: false,
        },
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      code: 500,
      message: '服务健康检查失败',
      data: { status: 'error', database: 'error' },
    });
  }
});

app.get('/api/geo/search', requireAuth, async (req, res) => {
  const keyword = normalizeText(req.query.keyword, 40);
  const city = normalizeText(req.query.city, 20);
  if (!keyword) {
    return res.status(400).json({ code: 400, message: '请输入地点关键词' });
  }
  if (!TIANDITU_KEY) {
    return res.status(503).json({ code: 503, message: '天地图 Key 未配置' });
  }

  const searchText = city && !keyword.includes(city) ? `${city} ${keyword}` : keyword;
  const url = new URL(TIANDITU_SEARCH_URL);
  url.searchParams.set('postStr', JSON.stringify({
    keyWord: searchText,
    level: '12',
    mapBound: '73.33,3.51,135.05,53.33',
    queryType: '1',
    start: '0',
    count: '10',
  }));
  url.searchParams.set('type', 'query');
  url.searchParams.set('tk', TIANDITU_KEY);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return res.status(502).json({ code: 502, message: '地点搜索服务暂不可用' });
    }
    return res.json({ code: 0, data: normalizeTiandituPois(payload, city) });
  } catch (error) {
    const message = error.name === 'AbortError' ? '地点搜索超时' : '地点搜索失败';
    return res.status(502).json({ code: 502, message });
  } finally {
    clearTimeout(timeout);
  }
});

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => String(tag || '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeText(value, maxLength = 80) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeCityName(value) {
  return normalizeText(value, 20).replace(/市$/, '');
}

function normalizeCoordinate(value, min, max) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return number;
}

function normalizePreferenceArray(values, allowedValues, limit = 8) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((item) => String(item || '').trim()))]
    .filter((item) => allowedValues.includes(item))
    .slice(0, limit);
}

function normalizeNickname(value, fallback = '桌游搭子') {
  return normalizeText(value, 20) || fallback;
}

function randomPasswordHashSource() {
  return crypto.randomBytes(24).toString('hex');
}

function toBooleanFlag(value, fallback = true) {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  if (value === true || value === 'true' || value === 1 || value === '1') return 1;
  if (value === false || value === 'false' || value === 0 || value === '0') return 0;
  return fallback ? 1 : 0;
}

function getAiCapabilities() {
  return ai.getAiCapabilities({
    enabled: AI_ENABLED,
    provider: AI_PROVIDER,
    apiKey: AI_API_KEY,
    model: AI_MODEL || '',
    timeoutMs: AI_TIMEOUT_MS,
    dailyLimit: AI_DAILY_LIMIT,
  });
}

function requireAiReady(res, feature) {
  const capabilities = getAiCapabilities();
  if (!capabilities.enabled) {
    res.status(503).json({ code: 503, message: 'AI 功能未开启', data: { feature, capabilities } });
    return false;
  }
  if (!capabilities.provider) {
    res.status(503).json({ code: 503, message: 'AI 服务未配置', data: { feature, capabilities } });
    return false;
  }
  if (!capabilities.providerSupported) {
    res.status(503).json({ code: 503, message: 'AI 供应商暂未支持', data: { feature, capabilities } });
    return false;
  }
  if (!capabilities.providerConfigured) {
    res.status(503).json({ code: 503, message: 'AI 服务未配置', data: { feature, capabilities } });
    return false;
  }
  if (!capabilities.ready) {
    res.status(503).json({ code: 503, message: 'AI 服务未配置', data: { feature, capabilities } });
    return false;
  }
  if (!capabilities.features[feature]) {
    res.status(503).json({ code: 503, message: '该 AI 功能暂不可用', data: { feature, capabilities } });
    return false;
  }
  return true;
}

function requireAiQuota(res, userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM ai_usage_logs
    WHERE user_id = ? AND date(created_at) = date('now')
  `).get(userId);
  if ((row.count || 0) >= AI_DAILY_LIMIT) {
    res.status(429).json({ code: 429, message: '今日 AI 使用次数已达上限' });
    return false;
  }
  return true;
}

function hashAiInput(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex');
}

function logAiUsage({ userId, feature, input, outputStatus, startedAt }) {
  db.prepare(`
    INSERT INTO ai_usage_logs (user_id, feature, input_hash, output_status, provider, model, latency_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId || null,
    feature,
    hashAiInput(input),
    outputStatus,
    AI_PROVIDER || '',
    AI_MODEL || '',
    Math.max(0, Date.now() - startedAt)
  );
}

function getOpsStats(userId) {
  const users = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  const openSessions = db.prepare("SELECT COUNT(*) AS count FROM game_sessions WHERE status = 'open'").get().count;
  const pendingRequests = db.prepare("SELECT COUNT(*) AS count FROM session_requests WHERE status = 'pending'").get().count;
  const reports = db.prepare("SELECT COUNT(*) AS count FROM reports WHERE status = 'open'").get().count;
  const unreadNotifications = db.prepare(`
    SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL
  `).get(userId).count;
  return {
    users,
    openSessions,
    pendingRequests,
    openReports: reports,
    myUnreadNotifications: unreadNotifications,
  };
}

function getOpsSignalSnapshot(userId) {
  const stats = getOpsStats(userId);
  const reportBreakdown = db.prepare(`
    SELECT reason, COUNT(*) AS count
    FROM reports
    WHERE status = 'open'
    GROUP BY reason
    ORDER BY count DESC, reason ASC
    LIMIT 5
  `).all();
  const requestBreakdown = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM session_requests
    GROUP BY status
    ORDER BY count DESC, status ASC
  `).all();
  const feedback = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(punctual) AS punctual,
      SUM(friendly) AS friendly,
      SUM(would_play_again) AS would_play_again
    FROM session_feedback
  `).get();
  return {
    stats,
    reportBreakdown,
    requestBreakdown,
    feedback: {
      total: feedback.total || 0,
      punctual: feedback.punctual || 0,
      friendly: feedback.friendly || 0,
      wouldPlayAgain: feedback.would_play_again || 0,
    },
  };
}

async function getWechatSession(code) {
  const normalizedCode = normalizeText(code, 128);
  if (!normalizedCode) {
    const error = new Error('请提供微信登录 code');
    error.status = 400;
    throw error;
  }

  if (WECHAT_LOGIN_DEV_MODE) {
    const digest = crypto.createHash('sha256').update(normalizedCode).digest('hex');
    return {
      openid: `dev_${digest.slice(0, 24)}`,
      unionid: '',
      session_key: `dev_session_${digest.slice(24, 48)}`,
    };
  }

  if (!WECHAT_MINIPROGRAM_APPID || !WECHAT_MINIPROGRAM_SECRET) {
    const error = new Error('微信小程序登录未配置');
    error.status = 503;
    throw error;
  }

  const url = new URL(WECHAT_CODE2SESSION_URL);
  url.searchParams.set('appid', WECHAT_MINIPROGRAM_APPID);
  url.searchParams.set('secret', WECHAT_MINIPROGRAM_SECRET);
  url.searchParams.set('js_code', normalizedCode);
  url.searchParams.set('grant_type', 'authorization_code');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.errcode) {
      const error = new Error(payload.errmsg || '微信登录失败');
      error.status = 502;
      throw error;
    }
    if (!payload.openid) {
      const error = new Error('微信登录返回缺少 openid');
      error.status = 502;
      throw error;
    }
    return payload;
  } catch (error) {
    if (!error.status) {
      error.status = error.name === 'AbortError' ? 504 : 502;
      error.message = error.name === 'AbortError' ? '微信登录超时' : '微信登录失败';
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getOrCreateWechatUser({ openid, unionid = '', sessionKey = '', nickname = '', avatar = '', gender = 0 }) {
  let user = db.prepare(
    'SELECT id, nickname FROM users WHERE mp_openid = ?'
  ).get(openid);

  if (!user && unionid) {
    user = db.prepare(
      'SELECT id, nickname FROM users WHERE mp_unionid = ?'
    ).get(unionid);
  }
  const isNewUser = !user;

  const normalizedNickname = normalizeNickname(nickname, `桌游搭子${String(openid).slice(-4)}`);
  const normalizedAvatar = normalizeText(avatar, 300);
  const normalizedGender = Number.isInteger(Number(gender)) ? Number(gender) : 0;

  if (!user) {
    const passwordHash = await bcrypt.hash(randomPasswordHashSource(), 10);
    const result = db.prepare(`
      INSERT INTO users (
        nickname, password_hash, avatar, gender, mp_openid, mp_unionid, mp_session_key, mp_last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      normalizedNickname,
      passwordHash,
      normalizedAvatar || null,
      normalizedGender,
      openid,
      unionid || null,
      sessionKey || null
    );
    user = { id: result.lastInsertRowid, nickname: normalizedNickname };
    db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(user.id);
  } else {
    db.prepare(`
      UPDATE users
      SET mp_openid = ?,
          mp_unionid = COALESCE(?, mp_unionid),
          mp_session_key = ?,
          mp_last_login_at = datetime('now'),
          nickname = CASE WHEN ? != '' THEN ? ELSE nickname END,
          avatar = CASE WHEN ? != '' THEN ? ELSE avatar END,
          gender = CASE WHEN ? > 0 THEN ? ELSE gender END
      WHERE id = ?
    `).run(
      openid,
      unionid || null,
      sessionKey || null,
      nickname ? normalizedNickname : '',
      normalizedNickname,
      normalizedAvatar,
      normalizedAvatar,
      normalizedGender,
      normalizedGender,
      user.id
    );
    db.prepare('INSERT OR IGNORE INTO profiles (user_id) VALUES (?)').run(user.id);
  }

  return {
    ...db.prepare('SELECT id, nickname FROM users WHERE id = ?').get(user.id),
    isNewUser,
  };
}

function parseLonLat(value) {
  const parts = String(value || '').split(',');
  if (parts.length < 2) return null;
  const lng = normalizeCoordinate(parts[0], -180, 180);
  const lat = normalizeCoordinate(parts[1], -90, 90);
  if (lng === null || lat === null) return null;
  return { lng, lat };
}

function normalizeTiandituPois(payload, fallbackCity = '') {
  const pois = Array.isArray(payload && payload.pois) ? payload.pois : [];
  const cityFallback = normalizeCityName(fallbackCity);
  return pois
    .slice(0, 10)
    .map((item) => {
      const location = parseLonLat(item.lonlat || item.lonLat || `${item.lon || ''},${item.lat || ''}`);
      if (!location) return null;
      return {
        name: normalizeText(item.name || item.hotPointName || item.address, 60),
        address: normalizeText(item.address || item.name, 100),
        city: normalizeCityName(item.city || item.cityName || item.cityname || item.province || item.pname || cityFallback),
        area: normalizeText(item.county || item.countyName || item.countyname || item.area || '', 30),
        lng: location.lng,
        lat: location.lat,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function getDatePresetRange(preset) {
  const now = new Date();
  const toDateText = (date) => date.toISOString().slice(0, 10);
  const add = (days) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    return date;
  };
  if (preset === 'today') return { from: toDateText(now), to: toDateText(now) };
  if (preset === 'tomorrow') return { from: toDateText(add(1)), to: toDateText(add(1)) };
  if (preset === 'next7') return { from: toDateText(now), to: toDateText(add(7)) };
  if (preset === 'weekend') {
    const day = now.getDay();
    const saturdayOffset = (6 - day + 7) % 7;
    return { from: toDateText(add(saturdayOffset)), to: toDateText(add(saturdayOffset + 1)) };
  }
  return null;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const values = [lat1, lng1, lat2, lng2].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  const [aLat, aLng, bLat, bLng] = values.map((value) => value * Math.PI / 180);
  const dLat = bLat - aLat;
  const dLng = bLng - aLng;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat) * Math.cos(bLat) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}

function daysUntil(dateText) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateText || ''))) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateText}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function getRequestCounts(sessionId) {
  const counts = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM session_requests
    WHERE session_id = ?
    GROUP BY status
  `).all(sessionId);
  const result = { pending: 0, approved: 0, rejected: 0, withdrawn: 0 };
  counts.forEach((item) => {
    result[item.status] = item.count;
  });
  return result;
}

function getFeedbackSummary(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(punctual) AS punctual,
      SUM(friendly) AS friendly,
      SUM(would_play_again) AS would_play_again
    FROM session_feedback
    WHERE to_user_id = ?
  `).get(userId);
  const total = row.total || 0;
  return {
    total,
    punctual: row.punctual || 0,
    friendly: row.friendly || 0,
    wouldPlayAgain: row.would_play_again || 0,
    score: total ? Math.round(((row.punctual || 0) + (row.friendly || 0) + (row.would_play_again || 0)) / (total * 3) * 100) : null,
  };
}

function isInteractionBlocked(leftUserId, rightUserId) {
  if (!leftUserId || !rightUserId) return false;
  return !!db.prepare(`
    SELECT 1 FROM user_blocks
    WHERE (blocker_user_id = ? AND blocked_user_id = ?)
       OR (blocker_user_id = ? AND blocked_user_id = ?)
  `).get(leftUserId, rightUserId, rightUserId, leftUserId);
}

function createNotification({ userId, actorUserId = null, sessionId = null, type, title, body = '', link = '' }) {
  if (!userId || !type || !title) return;
  db.prepare(`
    INSERT INTO notifications (user_id, actor_user_id, session_id, type, title, body, link)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userId, actorUserId, sessionId, type, title, body, link);
}

function serializeProfile(row = {}) {
  return {
    gameTypes: parseJsonArray(row.game_types),
    playStyles: parseJsonArray(row.play_styles),
    preferredRoles: parseJsonArray(row.preferred_roles),
    availability: parseJsonArray(row.availability),
    budgetRange: row.budget_range || '',
    playerCountRange: row.player_count_range || '',
    playModes: parseJsonArray(row.play_modes),
    playFreq: row.play_freq || '',
    intro: row.intro || '',
    city: row.city || '',
  };
}

function getProfileCompleteness(profile) {
  const checks = [
    { key: 'gameTypes', label: '常玩类型', ok: profile.gameTypes.length > 0 },
    { key: 'playStyles', label: '游玩风格', ok: profile.playStyles.length > 0 },
    { key: 'availability', label: '常有空的时间', ok: profile.availability.length > 0 },
    { key: 'budgetRange', label: '预算偏好', ok: !!profile.budgetRange },
    { key: 'playerCountRange', label: '人数偏好', ok: !!profile.playerCountRange },
    { key: 'playModes', label: '线上/线下', ok: profile.playModes.length > 0 },
    { key: 'city', label: '所在城市', ok: !!profile.city },
    { key: 'intro', label: '个人简介', ok: !!profile.intro },
  ];
  const completed = checks.filter((item) => item.ok).length;
  return {
    score: Math.round((completed / checks.length) * 100),
    completed,
    total: checks.length,
    missing: checks.filter((item) => !item.ok).map(({ key, label }) => ({ key, label })),
  };
}

function overlapCount(left = [], right = []) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function playerCountFits(range, maxPlayers) {
  if (!range || range === '都可以') return false;
  if (range === '2-4人') return maxPlayers >= 2 && maxPlayers <= 4;
  if (range === '5-8人') return maxPlayers >= 5 && maxPlayers <= 8;
  if (range === '9人以上') return maxPlayers >= 9;
  return false;
}

function scoreProfileMatch(candidate, viewerProfile) {
  let score = 0;
  const reasons = [];

  const sharedGames = overlapCount(candidate.gameTypes, viewerProfile.gameTypes);
  if (sharedGames) {
    score += sharedGames * 3;
    reasons.push('常玩类型相近');
  }

  const sharedStyles = overlapCount(candidate.playStyles, viewerProfile.playStyles);
  if (sharedStyles) {
    score += sharedStyles * 2;
    reasons.push('风格相近');
  }

  const sharedAvailability = overlapCount(candidate.availability, viewerProfile.availability);
  if (sharedAvailability) {
    score += sharedAvailability * 2;
    reasons.push('时间匹配');
  }

  const sharedModes = overlapCount(candidate.playModes, viewerProfile.playModes);
  if (sharedModes) {
    score += sharedModes;
    reasons.push('玩法偏好一致');
  }

  if (candidate.city && viewerProfile.city && candidate.city === viewerProfile.city) {
    score += 3;
    reasons.push('同城');
  }
  if (candidate.budgetRange && viewerProfile.budgetRange && candidate.budgetRange === viewerProfile.budgetRange) {
    score += 1;
    reasons.push('预算接近');
  }
  if (
    candidate.playerCountRange &&
    viewerProfile.playerCountRange &&
    candidate.playerCountRange === viewerProfile.playerCountRange
  ) {
    score += 1;
    reasons.push('人数偏好一致');
  }

  return { score, reasons: reasons.slice(0, 4) };
}

function scoreSessionMatch(row, viewerProfile) {
  let score = 0;
  const reasons = [];

  if (viewerProfile.city && row.city === viewerProfile.city) {
    score += 4;
    reasons.push('同城');
  }
  if ((viewerProfile.gameTypes || []).includes(row.game_type)) {
    score += 4;
    reasons.push('常玩类型');
  }
  if (viewerProfile.budgetRange && row.budget_range && viewerProfile.budgetRange === row.budget_range) {
    score += 2;
    reasons.push('预算匹配');
  }
  if ((viewerProfile.playModes || []).includes(row.play_mode)) {
    score += 2;
    reasons.push('玩法偏好');
  }
  if (playerCountFits(viewerProfile.playerCountRange, row.max_players)) {
    score += 1;
    reasons.push('人数合适');
  }
  if (typeof row._distanceKm === 'number') {
    if (row._distanceKm <= 5) {
      score += 3;
      reasons.push('距离近');
    } else if (row._distanceKm <= 20) {
      score += 1;
      reasons.push('同城附近');
    }
  }
  const days = daysUntil(row.play_date);
  if (days !== null && days >= 0 && days <= 7) {
    score += 1;
    reasons.push('时间临近');
  }

  return { score, reasons: reasons.slice(0, 4) };
}

function getSessionRow(sessionId) {
  return db.prepare(`
    SELECT s.*,
      u.nickname AS creator_nickname,
      u.avatar AS creator_avatar,
      u.wechat AS creator_wechat
    FROM game_sessions s
    JOIN users u ON u.id = s.creator_user_id
    WHERE s.id = ?
  `).get(sessionId);
}

function getRequestStatus(sessionId, userId) {
  if (!userId) return null;
  const request = db.prepare(
    'SELECT status FROM session_requests WHERE session_id = ? AND user_id = ?'
  ).get(sessionId, userId);
  return request ? request.status : null;
}

function serializeSession(row, viewerId, detail = false, matchReasons = []) {
  const requestStatus = getRequestStatus(row.id, viewerId);
  const isCreator = viewerId && row.creator_user_id === viewerId;
  const isApproved = requestStatus === 'approved';
  const canSendRequest = !requestStatus || ['withdrawn', 'rejected'].includes(requestStatus);
  const canSeeContact = !!(isCreator || isApproved);
  const seatsLeft = Math.max(0, row.max_players - row.current_players);

  const data = {
    id: row.id,
    creatorUserId: row.creator_user_id,
    creator: {
      id: row.creator_user_id,
      nickname: row.creator_nickname,
      avatar: row.creator_avatar,
      ...(canSeeContact ? { wechat: row.creator_wechat } : {}),
    },
    gameType: row.game_type,
    title: row.title,
    city: row.city,
    area: row.area || '',
    address: row.address || '',
    location: row.location_lng !== null && row.location_lng !== undefined &&
      row.location_lat !== null && row.location_lat !== undefined
      ? { lng: Number(row.location_lng), lat: Number(row.location_lat) }
      : null,
    playDate: row.play_date,
    playTime: row.play_time,
    playMode: row.play_mode || '线下',
    budgetRange: row.budget_range || '',
    minPlayers: row.min_players,
    maxPlayers: row.max_players,
    currentPlayers: row.current_players,
    seatsLeft,
    tags: parseJsonArray(row.tags),
    note: row.note || '',
    status: row.status,
    requestStatus,
    canRequest: !!(
      viewerId &&
      !isCreator &&
      canSendRequest &&
      row.status === 'open' &&
      seatsLeft > 0
    ),
    matchReasons,
    ...(typeof row._distanceKm === 'number' ? { distanceKm: row._distanceKm } : {}),
    ...(isCreator ? { requestCounts: getRequestCounts(row.id) } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (detail && canSeeContact) {
    data.contactNote = row.contact_note || '';
  }
  if (row.request_id) {
    data.requestId = row.request_id;
    data.requestMessage = row.request_message || '';
    data.requestCertainty = row.request_certainty || '';
    data.requestCreatedAt = row.request_created_at || '';
    data.requestUpdatedAt = row.request_updated_at || '';
  }

  return data;
}

function requireValidation(req, res) {
  const err = validationResult(req);
  if (!err.isEmpty()) {
    res.status(400).json({ code: 400, message: err.array()[0].msg });
    return false;
  }
  return true;
}

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
      console.error('Register error:', e);
      return res.status(500).json({ code: 500, message: '注册失败，请稍后重试' });
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
    // 根据哪个字段有值来动态构建查询条件
    const query = phone 
      ? 'SELECT id, nickname, password_hash FROM users WHERE phone = ?'
      : 'SELECT id, nickname, password_hash FROM users WHERE wechat = ?';
    const user = db.prepare(query).get(phone || wechat);
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

// 微信小程序登录：前端用 wx.login 拿 code，后端换 openid 并签发本应用 token
app.post(
  '/api/wechat/login',
  [
    body('code').trim().isLength({ min: 1, max: 128 }).withMessage('请提供微信登录 code'),
    body('nickname').optional({ checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('昵称最多 20 字'),
    body('avatar').optional({ checkFalsy: true }).trim().isLength({ max: 300 }).withMessage('头像地址过长'),
    body('gender').optional({ checkFalsy: true }).isInt({ min: 0, max: 2 }).withMessage('性别参数无效'),
  ],
  async (req, res) => {
    if (!requireValidation(req, res)) return;
    try {
      const wxSession = await getWechatSession(req.body.code);
      const user = await getOrCreateWechatUser({
        openid: wxSession.openid,
        unionid: wxSession.unionid || '',
        sessionKey: wxSession.session_key || '',
        nickname: req.body.nickname || '',
        avatar: req.body.avatar || '',
        gender: req.body.gender || 0,
      });
      const token = sign(user.id);
      res.json({
        code: 0,
        data: {
          token,
          userId: user.id,
          nickname: user.nickname,
          isNewUser: user.isNewUser,
        },
        message: user.isNewUser ? '微信登录成功，已创建账号' : '微信登录成功',
      });
    } catch (error) {
      const status = error.status || 500;
      res.status(status).json({
        code: status,
        message: error.message || '微信登录失败，请稍后重试',
      });
    }
  }
);

// 当前用户信息 + 资料（偏好）
app.get('/api/me', requireAuth, (req, res) => {
  const u = db.prepare(`
    SELECT id, nickname, avatar, gender, phone, wechat, created_at,
      CASE WHEN mp_openid IS NOT NULL THEN 1 ELSE 0 END AS has_mp_login
    FROM users
    WHERE id = ?
  `).get(req.userId);
  if (!u) return res.status(404).json({ code: 404, message: '用户不存在' });
  const p = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId);
  const profile = serializeProfile(p);
  res.json({
    code: 0,
    data: {
      ...u,
      hasMpLogin: !!u.has_mp_login,
      has_mp_login: undefined,
      profile,
      profileCompleteness: getProfileCompleteness(profile),
    },
  });
});

// 更新资料（偏好 / 简介 / 城市等）
app.post(
  '/api/profile',
  requireAuth,
  [
    body('gameTypes').optional().isArray(),
    body('playStyles').optional().isArray(),
    body('preferredRoles').optional().isArray(),
    body('availability').optional().isArray(),
    body('budgetRange').optional({ checkFalsy: true }).isIn(BUDGET_RANGES).withMessage('请选择有效预算'),
    body('playerCountRange').optional({ checkFalsy: true }).isIn(PLAYER_COUNT_RANGES).withMessage('请选择有效人数偏好'),
    body('playModes').optional().isArray(),
    body('playFreq').optional().trim(),
    body('intro').optional().trim(),
    body('city').optional().trim(),
  ],
  (req, res) => {
    const err = validationResult(req);
    if (!err.isEmpty()) {
      return res.status(400).json({ code: 400, message: err.array()[0].msg });
    }

    const {
      gameTypes,
      playStyles,
      preferredRoles,
      availability,
      budgetRange,
      playerCountRange,
      playModes,
      playFreq,
      intro,
      city,
    } = req.body;
    const normalizedProfile = {
      gameTypes: normalizePreferenceArray(gameTypes, GAME_TYPES),
      playStyles: normalizePreferenceArray(playStyles, PLAY_STYLES),
      preferredRoles: normalizePreferenceArray(preferredRoles, PREFERRED_ROLES),
      availability: normalizePreferenceArray(availability, AVAILABILITY_OPTIONS),
      budgetRange: BUDGET_RANGES.includes(budgetRange) ? budgetRange : '',
      playerCountRange: PLAYER_COUNT_RANGES.includes(playerCountRange) ? playerCountRange : '',
      playModes: normalizePreferenceArray(playModes, PLAY_MODES),
      playFreq: String(playFreq || '').trim().slice(0, 40),
      intro: String(intro || '').trim().slice(0, 300),
      city: String(city || '').trim().slice(0, 20),
    };
    
    // 先检查是否存在profiles记录，不存在则插入
    const existing = db.prepare('SELECT 1 FROM profiles WHERE user_id = ?').get(req.userId);
    
    if (!existing) {
      db.prepare(
        `INSERT INTO profiles (
          user_id, game_types, play_styles, preferred_roles, availability,
          budget_range, player_count_range, play_modes, play_freq, intro, city, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        req.userId,
        JSON.stringify(normalizedProfile.gameTypes),
        JSON.stringify(normalizedProfile.playStyles),
        JSON.stringify(normalizedProfile.preferredRoles),
        JSON.stringify(normalizedProfile.availability),
        normalizedProfile.budgetRange,
        normalizedProfile.playerCountRange,
        JSON.stringify(normalizedProfile.playModes),
        normalizedProfile.playFreq,
        normalizedProfile.intro,
        normalizedProfile.city
      );
    } else {
      db.prepare(
        `UPDATE profiles SET
          game_types=?, play_styles=?, preferred_roles=?, availability=?,
          budget_range=?, player_count_range=?, play_modes=?,
          play_freq=?, intro=?, city=?, updated_at=datetime('now')
        WHERE user_id=?`
      ).run(
        JSON.stringify(normalizedProfile.gameTypes),
        JSON.stringify(normalizedProfile.playStyles),
        JSON.stringify(normalizedProfile.preferredRoles),
        JSON.stringify(normalizedProfile.availability),
        normalizedProfile.budgetRange,
        normalizedProfile.playerCountRange,
        JSON.stringify(normalizedProfile.playModes),
        normalizedProfile.playFreq,
        normalizedProfile.intro,
        normalizedProfile.city,
        req.userId
      );
    }
    res.json({ code: 0, message: '保存成功' });
  }
);

app.get('/api/ai/capabilities', requireAuth, (req, res) => {
  res.json({ code: 0, data: getAiCapabilities() });
});

app.post(
  '/api/ai/session-draft',
  requireAuth,
  [
    body('prompt').trim().isLength({ min: 1, max: 300 }).withMessage('请用 1-300 字描述想组的局'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;
    if (!requireAiReady(res, 'sessionDraft')) return;
    if (!requireAiQuota(res, req.userId)) return;
    const startedAt = Date.now();
    const input = { prompt: req.body.prompt };
    try {
      if (AI_PROVIDER !== 'mock') {
        logAiUsage({ userId: req.userId, feature: 'sessionDraft', input, outputStatus: 'provider_not_implemented', startedAt });
        return res.status(501).json({ code: 501, message: '当前 AI 供应商暂未接入' });
      }
      const profile = serializeProfile(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId));
      const draft = ai.normalizeAiSessionDraft(
        ai.buildMockSessionDraft(req.body.prompt, profile, AI_OPTIONS),
        profile,
        AI_OPTIONS
      );
      logAiUsage({ userId: req.userId, feature: 'sessionDraft', input, outputStatus: 'ok', startedAt });
      res.json({ code: 0, data: { draft, provider: AI_PROVIDER, model: AI_MODEL || 'mock' } });
    } catch (error) {
      logAiUsage({ userId: req.userId, feature: 'sessionDraft', input, outputStatus: 'error', startedAt });
      res.status(500).json({ code: 500, message: '生成发布草稿失败' });
    }
  }
);

app.post(
  '/api/ai/request-message',
  requireAuth,
  [
    body('sessionId').isInt({ min: 1 }).withMessage('请选择要申请的局'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;
    if (!requireAiReady(res, 'requestMessage')) return;
    if (!requireAiQuota(res, req.userId)) return;
    const sessionId = Number(req.body.sessionId);
    const startedAt = Date.now();
    const input = { sessionId };
    try {
      const session = getSessionRow(sessionId);
      if (!session) {
        logAiUsage({ userId: req.userId, feature: 'requestMessage', input, outputStatus: 'not_found', startedAt });
        return res.status(404).json({ code: 404, message: '游戏局不存在' });
      }
      if (AI_PROVIDER !== 'mock') {
        logAiUsage({ userId: req.userId, feature: 'requestMessage', input, outputStatus: 'provider_not_implemented', startedAt });
        return res.status(501).json({ code: 501, message: '当前 AI 供应商暂未接入' });
      }
      const profile = serializeProfile(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId));
      const message = ai.normalizeAiTextOutput(
        ai.buildMockRequestMessage(profile, session),
        200,
        '我对这个局比较感兴趣，希望能加入。'
      );
      logAiUsage({ userId: req.userId, feature: 'requestMessage', input, outputStatus: 'ok', startedAt });
      res.json({ code: 0, data: { message, provider: AI_PROVIDER, model: AI_MODEL || 'mock' } });
    } catch (error) {
      logAiUsage({ userId: req.userId, feature: 'requestMessage', input, outputStatus: 'error', startedAt });
      res.status(500).json({ code: 500, message: '生成申请留言失败' });
    }
  }
);

app.post(
  '/api/ai/match-explanation',
  requireAuth,
  [
    body('sessionId').isInt({ min: 1 }).withMessage('请选择要解释的局'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;
    if (!requireAiReady(res, 'matchExplanation')) return;
    if (!requireAiQuota(res, req.userId)) return;
    const sessionId = Number(req.body.sessionId);
    const startedAt = Date.now();
    const input = { sessionId };
    try {
      const session = getSessionRow(sessionId);
      if (!session) {
        logAiUsage({ userId: req.userId, feature: 'matchExplanation', input, outputStatus: 'not_found', startedAt });
        return res.status(404).json({ code: 404, message: '游戏局不存在' });
      }
      if (AI_PROVIDER !== 'mock') {
        logAiUsage({ userId: req.userId, feature: 'matchExplanation', input, outputStatus: 'provider_not_implemented', startedAt });
        return res.status(501).json({ code: 501, message: '当前 AI 供应商暂未接入' });
      }
      const profile = serializeProfile(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId));
      const match = scoreSessionMatch(session, profile);
      const explanation = ai.normalizeAiTextOutput(
        ai.buildMockMatchExplanation(profile, session, match.reasons),
        220,
        '可以结合时间、地点、预算和局主说明判断是否适合你。'
      );
      logAiUsage({ userId: req.userId, feature: 'matchExplanation', input, outputStatus: 'ok', startedAt });
      res.json({ code: 0, data: { explanation, reasons: match.reasons, provider: AI_PROVIDER, model: AI_MODEL || 'mock' } });
    } catch (error) {
      logAiUsage({ userId: req.userId, feature: 'matchExplanation', input, outputStatus: 'error', startedAt });
      res.status(500).json({ code: 500, message: '生成匹配说明失败' });
    }
  }
);

app.post(
  '/api/ai/report-classification',
  requireAuth,
  [
    body('reason').optional({ checkFalsy: true }).isIn(REPORT_REASONS).withMessage('请选择有效举报原因'),
    body('detail').optional({ checkFalsy: true }).trim().isLength({ max: 300 }).withMessage('举报说明最多 300 字'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;
    if (!requireAiReady(res, 'reportClassification')) return;
    if (!requireAiQuota(res, req.userId)) return;
    const input = {
      reason: REPORT_REASONS.includes(req.body.reason) ? req.body.reason : '',
      detail: normalizeText(req.body.detail, 300),
    };
    if (!input.reason && !input.detail) {
      return res.status(400).json({ code: 400, message: '请提供举报原因或说明' });
    }
    const startedAt = Date.now();
    try {
      if (AI_PROVIDER !== 'mock') {
        logAiUsage({ userId: req.userId, feature: 'reportClassification', input, outputStatus: 'provider_not_implemented', startedAt });
        return res.status(501).json({ code: 501, message: '当前 AI 供应商暂未接入' });
      }
      const classification = ai.normalizeAiReportClassification(
        ai.buildMockReportClassification(input, AI_OPTIONS),
        AI_OPTIONS
      );
      logAiUsage({ userId: req.userId, feature: 'reportClassification', input, outputStatus: 'ok', startedAt });
      res.json({ code: 0, data: { classification, provider: AI_PROVIDER, model: AI_MODEL || 'mock' } });
    } catch (error) {
      logAiUsage({ userId: req.userId, feature: 'reportClassification', input, outputStatus: 'error', startedAt });
      res.status(500).json({ code: 500, message: '生成举报归类失败' });
    }
  }
);

app.get('/api/ai/ops-summary', requireAuth, (req, res) => {
  if (!requireAiReady(res, 'opsSummary')) return;
  if (!requireAiQuota(res, req.userId)) return;
  const startedAt = Date.now();
  const input = { scope: 'ops-summary' };
  try {
    if (AI_PROVIDER !== 'mock') {
      logAiUsage({ userId: req.userId, feature: 'opsSummary', input, outputStatus: 'provider_not_implemented', startedAt });
      return res.status(501).json({ code: 501, message: '当前 AI 供应商暂未接入' });
    }
    const snapshot = getOpsSignalSnapshot(req.userId);
    const summary = ai.normalizeAiOpsSummary(ai.buildMockOpsSummary(snapshot), snapshot);
    logAiUsage({ userId: req.userId, feature: 'opsSummary', input, outputStatus: 'ok', startedAt });
    res.json({
      code: 0,
      data: {
        ...summary,
        stats: snapshot.stats,
        reportBreakdown: snapshot.reportBreakdown,
        requestBreakdown: snapshot.requestBreakdown,
        feedback: snapshot.feedback,
        provider: AI_PROVIDER,
        model: AI_MODEL || 'mock',
      },
    });
  } catch (error) {
    logAiUsage({ userId: req.userId, feature: 'opsSummary', input, outputStatus: 'error', startedAt });
    res.status(500).json({ code: 500, message: '生成运营摘要失败' });
  }
});

// 发现页：推荐用户（排除自己、已点赞、已匹配），按偏好相似度简单排序
app.get('/api/discover', requireAuth, (req, res) => {
  const me = req.userId;
  const myProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(me);
  const myPrefs = serializeProfile(myProfile);

  const liked = db.prepare('SELECT to_user_id FROM likes WHERE from_user_id = ?').all(me).map(r => r.to_user_id);
  const blocked = db.prepare(`
    SELECT blocked_user_id AS id FROM user_blocks WHERE blocker_user_id = ?
    UNION
    SELECT blocker_user_id AS id FROM user_blocks WHERE blocked_user_id = ?
  `).all(me, me).map((row) => row.id);
  const exclude = [...new Set([me, ...liked, ...blocked])];
  const placeholders = exclude.map(() => '?').join(',');

  let users = db.prepare(`
    SELECT u.id, u.nickname, u.avatar, u.gender,
      p.game_types, p.play_styles, p.availability, p.budget_range,
      p.player_count_range, p.play_modes, p.intro, p.city
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id NOT IN (${placeholders})
  `).all(...exclude);

  users = users.map(u => {
    const candidate = {
      gameTypes: parseJsonArray(u.game_types),
      playStyles: parseJsonArray(u.play_styles),
      availability: parseJsonArray(u.availability),
      budgetRange: u.budget_range || '',
      playerCountRange: u.player_count_range || '',
      playModes: parseJsonArray(u.play_modes),
      city: u.city || '',
    };
    const match = scoreProfileMatch(candidate, myPrefs);
    return {
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      gender: u.gender,
      intro: u.intro || '',
      city: u.city || '',
      ...candidate,
      matchReasons: match.reasons,
      _score: match.score,
    };
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
  if (isInteractionBlocked(req.userId, toUserId)) {
    return res.status(403).json({ code: 403, message: '你们暂不能互动' });
  }
  try {
    db.prepare('INSERT INTO likes (from_user_id, to_user_id) VALUES (?, ?)').run(req.userId, toUserId);
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) {
      return res.json({ code: 0, data: { matched: false }, message: '已经点过赞' });
    }
    console.error('Like error:', e);
    return res.status(500).json({ code: 500, message: '操作失败，请稍后重试' });
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
  `).all(...matchIds)
    .filter((user) => !isInteractionBlocked(me, user.id))
    .map((user) => ({ ...user, reliability: getFeedbackSummary(user.id) }));
  res.json({ code: 0, data: users });
});

// 游戏局列表：默认只展示开放中的局，可按类型/城市/关键词筛选
app.get('/api/sessions', (req, res) => {
  const {
    gameType,
    city,
    status = 'open',
    q,
    budgetRange,
    playMode,
    dateFrom,
    dateTo,
    datePreset,
    minSeats,
    onlyMatched,
    nearLng,
    nearLat,
    maxDistanceKm,
  } = req.query;
  const where = [];
  const params = [];
  const presetRange = getDatePresetRange(datePreset);
  const effectiveDateFrom = presetRange ? presetRange.from : dateFrom;
  const effectiveDateTo = presetRange ? presetRange.to : dateTo;

  if (status !== 'all') {
    where.push('s.status = ?');
    params.push(status);
  }
  if (gameType) {
    where.push('s.game_type = ?');
    params.push(gameType);
  }
  if (city) {
    where.push('s.city = ?');
    params.push(city);
  }
  if (budgetRange) {
    where.push('s.budget_range = ?');
    params.push(budgetRange);
  }
  if (playMode) {
    where.push('s.play_mode = ?');
    params.push(playMode);
  }
  if (effectiveDateFrom && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDateFrom)) {
    where.push('s.play_date >= ?');
    params.push(effectiveDateFrom);
  }
  if (effectiveDateTo && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDateTo)) {
    where.push('s.play_date <= ?');
    params.push(effectiveDateTo);
  }
  const minSeatsValue = Number(minSeats);
  if (Number.isInteger(minSeatsValue) && minSeatsValue > 0) {
    where.push('(s.max_players - s.current_players) >= ?');
    params.push(minSeatsValue);
  }
  if (q) {
    where.push('(s.title LIKE ? OR s.note LIKE ? OR s.area LIKE ? OR s.address LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const rows = db.prepare(`
    SELECT s.*,
      u.nickname AS creator_nickname,
      u.avatar AS creator_avatar,
      u.wechat AS creator_wechat
    FROM game_sessions s
    JOIN users u ON u.id = s.creator_user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY s.play_date ASC, s.play_time ASC, s.created_at DESC
    LIMIT 50
  `).all(...params);

  const nearPoint = {
    lng: normalizeCoordinate(nearLng, -180, 180),
    lat: normalizeCoordinate(nearLat, -90, 90),
  };
  const maxDistance = Number(maxDistanceKm) || 0;
  const viewerProfile = req.userId
    ? serializeProfile(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId))
    : null;
  let sessions = rows
    .filter((row) => !req.userId || !isInteractionBlocked(req.userId, row.creator_user_id))
    .map((row) => {
      if (
        nearPoint.lng !== null &&
        nearPoint.lat !== null &&
        row.location_lng !== null &&
        row.location_lat !== null
      ) {
        row._distanceKm = distanceKm(nearPoint.lat, nearPoint.lng, row.location_lat, row.location_lng);
      }
      return row;
    })
    .filter((row) => {
      if (!maxDistance || typeof row._distanceKm !== 'number') return true;
      return row._distanceKm <= maxDistance;
    })
    .map((row) => {
    const match = viewerProfile ? scoreSessionMatch(row, viewerProfile) : { score: 0, reasons: [] };
    return {
      ...serializeSession(row, req.userId, false, match.reasons),
      _score: match.score,
    };
  });

  if (onlyMatched === '1' && viewerProfile) {
    sessions = sessions.filter((session) => session._score > 0);
  }

  if (viewerProfile) {
    sessions.sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return `${a.playDate} ${a.playTime}`.localeCompare(`${b.playDate} ${b.playTime}`);
    });
  }

  res.json({ code: 0, data: sessions.map(({ _score, ...session }) => session) });
});

// 发布游戏局
app.post(
  '/api/sessions',
  requireAuth,
  [
    body('gameType').isIn(GAME_TYPES).withMessage('请选择有效游戏类型'),
    body('title').trim().isLength({ min: 1, max: 40 }).withMessage('标题 1-40 字'),
    body('city').trim().isLength({ min: 1, max: 20 }).withMessage('请填写城市'),
    body('area').optional().trim().isLength({ max: 30 }).withMessage('区域最多 30 字'),
    body('address').optional().trim().isLength({ max: 100 }).withMessage('地点最多 100 字'),
    body('locationLng').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).withMessage('经度无效'),
    body('locationLat').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).withMessage('纬度无效'),
    body('playDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('日期格式应为 YYYY-MM-DD'),
    body('playTime').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('时间格式应为 HH:mm'),
    body('playMode').optional({ checkFalsy: true }).isIn(PLAY_MODES).withMessage('请选择有效玩法'),
    body('budgetRange').optional({ checkFalsy: true }).isIn(BUDGET_RANGES).withMessage('请选择有效预算'),
    body('minPlayers').isInt({ min: 2, max: 30 }).withMessage('最少人数需为 2-30'),
    body('maxPlayers').isInt({ min: 2, max: 30 }).withMessage('最多人数需为 2-30'),
    body('currentPlayers').optional().isInt({ min: 1, max: 30 }).withMessage('当前人数需为 1-30'),
    body('tags').optional().isArray().withMessage('标签格式错误'),
    body('note').optional().trim().isLength({ max: 500 }).withMessage('说明最多 500 字'),
    body('contactNote').optional().trim().isLength({ max: 200 }).withMessage('联系方式说明最多 200 字'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;

    const {
      gameType,
      title,
      city,
      area = '',
      address = '',
      locationLng,
      locationLat,
      playDate,
      playTime,
      playMode = '线下',
      budgetRange = '',
      minPlayers,
      maxPlayers,
      currentPlayers = 1,
      tags = [],
      note = '',
      contactNote = '',
    } = req.body;

    const min = Number(minPlayers);
    const max = Number(maxPlayers);
    const current = Number(currentPlayers);
    if (min > max) {
      return res.status(400).json({ code: 400, message: '最少人数不能大于最多人数' });
    }
    if (current > max) {
      return res.status(400).json({ code: 400, message: '当前人数不能大于最多人数' });
    }
    const lng = normalizeCoordinate(locationLng, -180, 180);
    const lat = normalizeCoordinate(locationLat, -90, 90);

    const result = db.prepare(`
      INSERT INTO game_sessions (
        creator_user_id, game_type, title, city, area, address, location_lng, location_lat,
        play_date, play_time, play_mode, budget_range,
        min_players, max_players, current_players, tags, note, contact_note
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.userId,
      gameType,
      title.trim(),
      city.trim(),
      area.trim(),
      address.trim(),
      lng,
      lat,
      playDate,
      playTime,
      PLAY_MODES.includes(playMode) ? playMode : '线下',
      BUDGET_RANGES.includes(budgetRange) ? budgetRange : '',
      min,
      max,
      current,
      JSON.stringify(normalizeTags(tags)),
      note.trim(),
      contactNote.trim()
    );

    const row = getSessionRow(result.lastInsertRowid);
    res.json({ code: 0, data: serializeSession(row, req.userId, true), message: '发布成功' });
  }
);

// 创建者编辑游戏局
app.patch(
  '/api/sessions/:id',
  requireAuth,
  [
    body('gameType').isIn(GAME_TYPES).withMessage('请选择有效游戏类型'),
    body('title').trim().isLength({ min: 1, max: 40 }).withMessage('标题 1-40 字'),
    body('city').trim().isLength({ min: 1, max: 20 }).withMessage('请填写城市'),
    body('area').optional().trim().isLength({ max: 30 }).withMessage('区域最多 30 字'),
    body('address').optional().trim().isLength({ max: 100 }).withMessage('地点最多 100 字'),
    body('locationLng').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).withMessage('经度无效'),
    body('locationLat').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).withMessage('纬度无效'),
    body('playDate').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('日期格式应为 YYYY-MM-DD'),
    body('playTime').matches(/^([01]\d|2[0-3]):[0-5]\d$/).withMessage('时间格式应为 HH:mm'),
    body('playMode').optional({ checkFalsy: true }).isIn(PLAY_MODES).withMessage('请选择有效玩法'),
    body('budgetRange').optional({ checkFalsy: true }).isIn(BUDGET_RANGES).withMessage('请选择有效预算'),
    body('minPlayers').isInt({ min: 2, max: 30 }).withMessage('最少人数需为 2-30'),
    body('maxPlayers').isInt({ min: 2, max: 30 }).withMessage('最多人数需为 2-30'),
    body('currentPlayers').optional().isInt({ min: 1, max: 30 }).withMessage('当前人数需为 1-30'),
    body('tags').optional().isArray().withMessage('标签格式错误'),
    body('note').optional().trim().isLength({ max: 500 }).withMessage('说明最多 500 字'),
    body('contactNote').optional().trim().isLength({ max: 200 }).withMessage('联系方式说明最多 200 字'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;

    const sessionId = parseInt(req.params.id, 10);
    const row = getSessionRow(sessionId);
    if (!row) {
      return res.status(404).json({ code: 404, message: '游戏局不存在' });
    }
    if (row.creator_user_id !== req.userId) {
      return res.status(403).json({ code: 403, message: '只能编辑自己发布的局' });
    }

    const {
      gameType,
      title,
      city,
      area = '',
      address = '',
      locationLng,
      locationLat,
      playDate,
      playTime,
      playMode = '线下',
      budgetRange = '',
      minPlayers,
      maxPlayers,
      currentPlayers = 1,
      tags = [],
      note = '',
      contactNote = '',
    } = req.body;

    const min = Number(minPlayers);
    const max = Number(maxPlayers);
    const current = Number(currentPlayers);
    if (min > max) {
      return res.status(400).json({ code: 400, message: '最少人数不能大于最多人数' });
    }
    if (current > max) {
      return res.status(400).json({ code: 400, message: '当前人数不能大于最多人数' });
    }
    const lng = normalizeCoordinate(locationLng, -180, 180);
    const lat = normalizeCoordinate(locationLat, -90, 90);

    const approvedCount = db.prepare(
      "SELECT COUNT(*) AS count FROM session_requests WHERE session_id = ? AND status = 'approved'"
    ).get(sessionId).count;
    const minimumCurrent = approvedCount + 1;
    if (current < minimumCurrent) {
      return res.status(400).json({
        code: 400,
        message: `当前人数不能小于已通过人数加局主（至少 ${minimumCurrent} 人）`,
      });
    }

    db.prepare(`
      UPDATE game_sessions
      SET game_type = ?,
          title = ?,
          city = ?,
          area = ?,
          address = ?,
          location_lng = ?,
          location_lat = ?,
          play_date = ?,
          play_time = ?,
          play_mode = ?,
          budget_range = ?,
          min_players = ?,
          max_players = ?,
          current_players = ?,
          tags = ?,
          note = ?,
          contact_note = ?,
          status = CASE
            WHEN status = 'open' AND ? >= ? THEN 'closed'
            ELSE status
          END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      gameType,
      title.trim(),
      city.trim(),
      area.trim(),
      address.trim(),
      lng,
      lat,
      playDate,
      playTime,
      PLAY_MODES.includes(playMode) ? playMode : '线下',
      BUDGET_RANGES.includes(budgetRange) ? budgetRange : '',
      min,
      max,
      current,
      JSON.stringify(normalizeTags(tags)),
      note.trim(),
      contactNote.trim(),
      current,
      max,
      sessionId
    );

    const updated = getSessionRow(sessionId);
    res.json({ code: 0, data: serializeSession(updated, req.userId, true), message: '保存成功' });
  }
);

// 游戏局详情
app.get('/api/sessions/:id', (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  if (!sessionId) {
    return res.status(400).json({ code: 400, message: '无效游戏局' });
  }
  const row = getSessionRow(sessionId);
  if (!row) {
    return res.status(404).json({ code: 404, message: '游戏局不存在' });
  }
  const viewerProfile = req.userId
    ? serializeProfile(db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.userId))
    : null;
  const match = viewerProfile ? scoreSessionMatch(row, viewerProfile) : { reasons: [] };
  res.json({ code: 0, data: serializeSession(row, req.userId, true, match.reasons) });
});

// 创建者关闭/取消游戏局
app.patch(
  '/api/sessions/:id/status',
  requireAuth,
  [body('status').isIn(['open', 'closed', 'cancelled']).withMessage('状态无效')],
  (req, res) => {
    if (!requireValidation(req, res)) return;

    const sessionId = parseInt(req.params.id, 10);
    const row = getSessionRow(sessionId);
    if (!row) {
      return res.status(404).json({ code: 404, message: '游戏局不存在' });
    }
    if (row.creator_user_id !== req.userId) {
      return res.status(403).json({ code: 403, message: '只能操作自己发布的局' });
    }

    db.prepare(
      "UPDATE game_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?"
    ).run(req.body.status, sessionId);

    const affectedUsers = db.prepare(`
      SELECT user_id FROM session_requests
      WHERE session_id = ? AND status IN ('pending', 'approved')
    `).all(sessionId);
    affectedUsers.forEach((item) => createNotification({
      userId: item.user_id,
      actorUserId: req.userId,
      sessionId,
      type: 'session_status',
      title: '局状态已更新',
      body: `${row.title}：${req.body.status === 'open' ? '重新开放' : req.body.status === 'closed' ? '已满员' : '已取消'}`,
      link: `/sessions/${sessionId}`,
    }));

    const updated = getSessionRow(sessionId);
    res.json({ code: 0, data: serializeSession(updated, req.userId, true), message: '状态已更新' });
  }
);

// 申请加入游戏局
app.post(
  '/api/sessions/:id/requests',
  requireAuth,
  [
    body('message').optional().trim().isLength({ max: 200 }).withMessage('申请留言最多 200 字'),
    body('certainty').optional({ checkFalsy: true }).isIn(REQUEST_CERTAINTY).withMessage('申请确定性无效'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;

    const sessionId = parseInt(req.params.id, 10);
    const row = getSessionRow(sessionId);
    if (!row) {
      return res.status(404).json({ code: 404, message: '游戏局不存在' });
    }
    if (row.creator_user_id === req.userId) {
      return res.status(400).json({ code: 400, message: '不能申请自己发布的局' });
    }
    if (isInteractionBlocked(req.userId, row.creator_user_id)) {
      return res.status(403).json({ code: 403, message: '你们暂不能互动' });
    }
    if (row.status !== 'open') {
      return res.status(400).json({ code: 400, message: '该局暂不接受申请' });
    }
    if (row.current_players >= row.max_players) {
      return res.status(400).json({ code: 400, message: '该局名额已满' });
    }

    try {
      const existing = db.prepare(
        'SELECT id, status FROM session_requests WHERE session_id = ? AND user_id = ?'
      ).get(sessionId, req.userId);
      const certainty = REQUEST_CERTAINTY.includes(req.body.certainty) ? req.body.certainty : 'confirmed';
      if (existing) {
        if (['withdrawn', 'rejected'].includes(existing.status)) {
          db.prepare(`
            UPDATE session_requests
            SET status = 'pending', message = ?, certainty = ?, updated_at = datetime('now')
            WHERE id = ?
          `).run((req.body.message || '').trim(), certainty, existing.id);
          createNotification({
            userId: row.creator_user_id,
            actorUserId: req.userId,
            sessionId,
            type: 'request_created',
            title: '收到新的加入申请',
            body: row.title,
            link: `/sessions/${sessionId}`,
          });
          return res.json({
            code: 0,
            data: { id: existing.id, sessionId, status: 'pending' },
            message: '申请已重新发送',
          });
        }
        return res.status(400).json({ code: 400, message: '你已经申请过这个局' });
      }

      const result = db.prepare(`
        INSERT INTO session_requests (session_id, user_id, message, certainty)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, req.userId, (req.body.message || '').trim(), certainty);
      createNotification({
        userId: row.creator_user_id,
        actorUserId: req.userId,
        sessionId,
        type: 'request_created',
        title: '收到新的加入申请',
        body: row.title,
        link: `/sessions/${sessionId}`,
      });
      res.json({
        code: 0,
        data: { id: result.lastInsertRowid, sessionId, status: 'pending' },
        message: '申请已发送',
      });
    } catch (e) {
      console.error('Create session request error:', e);
      return res.status(500).json({ code: 500, message: '申请失败，请稍后重试' });
    }
  }
);

// 创建者查看申请列表
app.get('/api/sessions/:id/requests', requireAuth, (req, res) => {
  const sessionId = parseInt(req.params.id, 10);
  const row = getSessionRow(sessionId);
  if (!row) {
    return res.status(404).json({ code: 404, message: '游戏局不存在' });
  }
  if (row.creator_user_id !== req.userId) {
    return res.status(403).json({ code: 403, message: '只能查看自己发布的局' });
  }

  const requests = db.prepare(`
    SELECT r.id, r.session_id, r.user_id, r.message, r.certainty, r.status, r.created_at, r.updated_at,
      u.nickname, u.avatar, u.wechat,
      p.game_types, p.play_styles, p.availability, p.budget_range, p.player_count_range,
      p.play_modes, p.intro, p.city
    FROM session_requests r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN profiles p ON p.user_id = r.user_id
    WHERE r.session_id = ?
    ORDER BY CASE r.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
      r.created_at DESC
  `).all(sessionId).map((item) => ({
    id: item.id,
    sessionId: item.session_id,
    userId: item.user_id,
    message: item.message || '',
    certainty: item.certainty || 'confirmed',
    status: item.status,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    user: {
      id: item.user_id,
      nickname: item.nickname,
      avatar: item.avatar,
      wechat: item.status === 'approved' ? item.wechat : undefined,
      gameTypes: parseJsonArray(item.game_types),
      playStyles: parseJsonArray(item.play_styles),
      availability: parseJsonArray(item.availability),
      budgetRange: item.budget_range || '',
      playerCountRange: item.player_count_range || '',
      playModes: parseJsonArray(item.play_modes),
      intro: item.intro || '',
      city: item.city || '',
      reliability: getFeedbackSummary(item.user_id),
    },
  }));

  res.json({ code: 0, data: requests });
});

// 我的发布/申请记录
app.get('/api/my/sessions', requireAuth, (req, res) => {
  const created = db.prepare(`
    SELECT s.*,
      u.nickname AS creator_nickname,
      u.avatar AS creator_avatar,
      u.wechat AS creator_wechat
    FROM game_sessions s
    JOIN users u ON u.id = s.creator_user_id
    WHERE s.creator_user_id = ?
    ORDER BY s.created_at DESC
  `).all(req.userId).map((row) => serializeSession(row, req.userId, true));

  const requested = db.prepare(`
    SELECT s.*,
      r.id AS request_id,
      r.message AS request_message,
      r.certainty AS request_certainty,
      r.created_at AS request_created_at,
      r.updated_at AS request_updated_at,
      u.nickname AS creator_nickname,
      u.avatar AS creator_avatar,
      u.wechat AS creator_wechat
    FROM session_requests r
    JOIN game_sessions s ON s.id = r.session_id
    JOIN users u ON u.id = s.creator_user_id
    WHERE r.user_id = ?
    ORDER BY r.created_at DESC
  `).all(req.userId).map((row) => serializeSession(row, req.userId, true));

  res.json({ code: 0, data: { created, requested } });
});

// 申请人撤回待审核申请
app.patch('/api/session-requests/:id/withdraw', requireAuth, (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const request = db.prepare(`
    SELECT id, session_id, user_id, status
    FROM session_requests
    WHERE id = ?
  `).get(requestId);

  if (!request) {
    return res.status(404).json({ code: 404, message: '申请不存在' });
  }
  if (request.user_id !== req.userId) {
    return res.status(403).json({ code: 403, message: '只能撤回自己的申请' });
  }
  if (request.status !== 'pending') {
    return res.status(400).json({ code: 400, message: '只能撤回待审核申请' });
  }

  db.prepare(
    "UPDATE session_requests SET status = 'withdrawn', updated_at = datetime('now') WHERE id = ?"
  ).run(requestId);

  res.json({
    code: 0,
    data: { id: request.id, sessionId: request.session_id, status: 'withdrawn' },
    message: '已撤回申请',
  });
});

// 创建者审批申请
app.patch(
  '/api/session-requests/:id',
  requireAuth,
  [body('status').isIn(['approved', 'rejected']).withMessage('审批状态无效')],
  (req, res) => {
    if (!requireValidation(req, res)) return;

    const requestId = parseInt(req.params.id, 10);
    const request = db.prepare(`
      SELECT r.*, s.creator_user_id, s.current_players, s.max_players, s.status AS session_status
      FROM session_requests r
      JOIN game_sessions s ON s.id = r.session_id
      WHERE r.id = ?
    `).get(requestId);

    if (!request) {
      return res.status(404).json({ code: 404, message: '申请不存在' });
    }
    if (request.creator_user_id !== req.userId) {
      return res.status(403).json({ code: 403, message: '只能审批自己发布的局' });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ code: 400, message: '该申请已处理' });
    }
    if (req.body.status === 'approved') {
      if (request.session_status !== 'open') {
        return res.status(400).json({ code: 400, message: '该局暂不接受通过申请' });
      }
      if (request.current_players >= request.max_players) {
        return res.status(400).json({ code: 400, message: '该局名额已满' });
      }
    }

    const approveRequest = db.transaction(() => {
      db.prepare(
        "UPDATE session_requests SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(req.body.status, requestId);

      if (req.body.status === 'approved') {
        db.prepare(`
          UPDATE game_sessions
          SET current_players = current_players + 1,
              status = CASE WHEN current_players + 1 >= max_players THEN 'closed' ELSE status END,
              updated_at = datetime('now')
          WHERE id = ?
        `).run(request.session_id);
      }
    });

    approveRequest();

    const updated = db.prepare('SELECT id, session_id, user_id, status, updated_at FROM session_requests WHERE id = ?').get(requestId);
    createNotification({
      userId: updated.user_id,
      actorUserId: req.userId,
      sessionId: updated.session_id,
      type: req.body.status === 'approved' ? 'request_approved' : 'request_rejected',
      title: req.body.status === 'approved' ? '申请已通过' : '申请已拒绝',
      body: req.body.status === 'approved' ? '局主同意了你的加入申请' : '局主暂未通过你的申请',
      link: `/sessions/${updated.session_id}`,
    });
    res.json({
      code: 0,
      data: {
        id: updated.id,
        sessionId: updated.session_id,
        userId: updated.user_id,
        status: updated.status,
        updatedAt: updated.updated_at,
      },
      message: req.body.status === 'approved' ? '已同意加入' : '已拒绝申请',
    });
  }
);

// 拉黑用户：阻断发现、点赞和申请互动
app.post('/api/block/:userId', requireAuth, (req, res) => {
  const blockedUserId = parseInt(req.params.userId, 10);
  if (!blockedUserId || blockedUserId === req.userId) {
    return res.status(400).json({ code: 400, message: '无效用户' });
  }
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(blockedUserId);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });

  db.prepare('INSERT OR IGNORE INTO user_blocks (blocker_user_id, blocked_user_id) VALUES (?, ?)')
    .run(req.userId, blockedUserId);
  db.prepare(`
    DELETE FROM likes
    WHERE (from_user_id = ? AND to_user_id = ?) OR (from_user_id = ? AND to_user_id = ?)
  `).run(req.userId, blockedUserId, blockedUserId, req.userId);
  res.json({ code: 0, data: { blockedUserId }, message: '已拉黑' });
});

app.delete('/api/block/:userId', requireAuth, (req, res) => {
  const blockedUserId = parseInt(req.params.userId, 10);
  db.prepare('DELETE FROM user_blocks WHERE blocker_user_id = ? AND blocked_user_id = ?')
    .run(req.userId, blockedUserId);
  res.json({ code: 0, data: { blockedUserId }, message: '已取消拉黑' });
});

// 举报：先记录，不引入审核后台
app.post(
  '/api/reports',
  requireAuth,
  [
    body('targetUserId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('举报用户无效'),
    body('sessionId').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('举报局无效'),
    body('reason').isIn(REPORT_REASONS).withMessage('请选择举报原因'),
    body('detail').optional().trim().isLength({ max: 300 }).withMessage('举报说明最多 300 字'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;
    const targetUserId = req.body.targetUserId ? Number(req.body.targetUserId) : null;
    const sessionId = req.body.sessionId ? Number(req.body.sessionId) : null;
    if (!targetUserId && !sessionId) {
      return res.status(400).json({ code: 400, message: '请选择举报对象' });
    }
    db.prepare(`
      INSERT INTO reports (reporter_user_id, target_user_id, session_id, reason, detail)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.userId, targetUserId, sessionId, req.body.reason, (req.body.detail || '').trim());
    res.json({ code: 0, message: '已提交举报' });
  }
);

function getSessionParticipants(sessionId) {
  const row = getSessionRow(sessionId);
  if (!row) return null;
  const approved = db.prepare(`
    SELECT user_id FROM session_requests
    WHERE session_id = ? AND status = 'approved'
  `).all(sessionId).map((item) => item.user_id);
  return { session: row, userIds: [row.creator_user_id, ...approved] };
}

app.post(
  '/api/sessions/:id/feedback',
  requireAuth,
  [
    body('toUserId').isInt({ min: 1 }).withMessage('反馈对象无效'),
    body('punctual').optional().isBoolean().withMessage('准时反馈无效'),
    body('friendly').optional().isBoolean().withMessage('友好反馈无效'),
    body('wouldPlayAgain').optional().isBoolean().withMessage('再约反馈无效'),
    body('note').optional().trim().isLength({ max: 200 }).withMessage('反馈说明最多 200 字'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;
    const sessionId = parseInt(req.params.id, 10);
    const toUserId = Number(req.body.toUserId);
    if (toUserId === req.userId) {
      return res.status(400).json({ code: 400, message: '不能评价自己' });
    }
    const participants = getSessionParticipants(sessionId);
    if (!participants) return res.status(404).json({ code: 404, message: '游戏局不存在' });
    if (!participants.userIds.includes(req.userId) || !participants.userIds.includes(toUserId)) {
      return res.status(403).json({ code: 403, message: '只有同局成员可以反馈' });
    }

    db.prepare(`
      INSERT INTO session_feedback (
        session_id, from_user_id, to_user_id, punctual, friendly, would_play_again, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id, from_user_id, to_user_id) DO UPDATE SET
        punctual = excluded.punctual,
        friendly = excluded.friendly,
        would_play_again = excluded.would_play_again,
        note = excluded.note,
        created_at = datetime('now')
    `).run(
      sessionId,
      req.userId,
      toUserId,
      req.body.punctual ? 1 : 0,
      req.body.friendly ? 1 : 0,
      req.body.wouldPlayAgain ? 1 : 0,
      (req.body.note || '').trim()
    );
    res.json({ code: 0, data: { toUserId, reliability: getFeedbackSummary(toUserId) }, message: '反馈已保存' });
  }
);

function getNotificationPreferences(userId) {
  const row = db.prepare(`
    SELECT notify_request_updates, notify_review_results, notify_session_status
    FROM users
    WHERE id = ?
  `).get(userId) || {};
  return {
    inApp: true,
    wechatSubscribe: {
      requestUpdates: !!row.notify_request_updates,
      reviewResults: !!row.notify_review_results,
      sessionStatus: !!row.notify_session_status,
    },
  };
}

app.get('/api/notification-preferences', requireAuth, (req, res) => {
  res.json({ code: 0, data: getNotificationPreferences(req.userId) });
});

app.post(
  '/api/notification-preferences',
  requireAuth,
  [
    body('requestUpdates').optional().isBoolean().withMessage('申请提醒设置无效'),
    body('reviewResults').optional().isBoolean().withMessage('审批提醒设置无效'),
    body('sessionStatus').optional().isBoolean().withMessage('局状态提醒设置无效'),
  ],
  (req, res) => {
    if (!requireValidation(req, res)) return;
    const current = getNotificationPreferences(req.userId).wechatSubscribe;
    db.prepare(`
      UPDATE users
      SET notify_request_updates = ?,
          notify_review_results = ?,
          notify_session_status = ?
      WHERE id = ?
    `).run(
      toBooleanFlag(req.body.requestUpdates, current.requestUpdates),
      toBooleanFlag(req.body.reviewResults, current.reviewResults),
      toBooleanFlag(req.body.sessionStatus, current.sessionStatus),
      req.userId
    );
    res.json({
      code: 0,
      data: getNotificationPreferences(req.userId),
      message: '提醒设置已保存',
    });
  }
);

app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = db.prepare(`
    SELECT id, type, title, body, link, read_at, created_at, actor_user_id, session_id
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(req.userId).map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body || '',
    link: item.link || '',
    readAt: item.read_at || '',
    createdAt: item.created_at,
    actorUserId: item.actor_user_id,
    sessionId: item.session_id,
  }));
  res.json({ code: 0, data: notifications });
});

app.get('/api/notifications/unread-count', requireAuth, (req, res) => {
  const row = db.prepare(`
    SELECT COUNT(*) AS count FROM notifications
    WHERE user_id = ? AND read_at IS NULL
  `).get(req.userId);
  res.json({ code: 0, data: { count: row.count || 0 } });
});

app.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.prepare(`
    UPDATE notifications SET read_at = COALESCE(read_at, datetime('now'))
    WHERE id = ? AND user_id = ?
  `).run(id, req.userId);
  res.json({ code: 0, message: '已读' });
});

app.patch('/api/notifications/read-all', requireAuth, (req, res) => {
  db.prepare(`
    UPDATE notifications SET read_at = COALESCE(read_at, datetime('now'))
    WHERE user_id = ? AND read_at IS NULL
  `).run(req.userId);
  res.json({ code: 0, message: '全部已读' });
});

// 轻量运营统计：只读，不提供商家后台
app.get('/api/ops/stats', requireAuth, (req, res) => {
  res.json({
    code: 0,
    data: getOpsStats(req.userId),
  });
});

app.listen(PORT, () => {
  console.log(`API http://localhost:${PORT}`);
});
