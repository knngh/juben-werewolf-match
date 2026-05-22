const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const ai = require('../ai');

const PORT = 3127;
const GEO_PORT = 3128;
const AI_GUARD_PORT = 3129;
const OPENROUTER_PORT = 3130;
const OPENROUTER_BACKEND_PORT = 3131;
const AI_COST_GUARD_PORT = 3132;
const BASE = `http://127.0.0.1:${PORT}`;
const GEO_BASE = `http://127.0.0.1:${GEO_PORT}/search`;
const AI_GUARD_BASE = `http://127.0.0.1:${AI_GUARD_PORT}`;
const OPENROUTER_BASE = `http://127.0.0.1:${OPENROUTER_BACKEND_PORT}`;
const OPENROUTER_API_BASE = `http://127.0.0.1:${OPENROUTER_PORT}/api/v1/chat/completions`;
const AI_COST_GUARD_BASE = `http://127.0.0.1:${AI_COST_GUARD_PORT}`;
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jwm-smoke-'));
const dbPath = path.join(tmpDir, 'data.db');

function startGeoMock() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== '/search') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'not found' }));
      return;
    }

    const postStr = JSON.parse(url.searchParams.get('postStr') || '{}');
    if (!postStr.keyWord || !url.searchParams.get('tk')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'bad request' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: '0',
      pois: [
        {
          name: '人民广场',
          address: '上海市黄浦区人民大道',
          city: '上海市',
          county: '黄浦区',
          lonlat: '121.475,31.232',
        },
      ],
    }));
  });
}

function startOpenRouterMock() {
  const calls = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/v1/chat/completions') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'not found' } }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const payload = JSON.parse(body || '{}');
      calls.push({ headers: req.headers, payload });
      const isOpenRouterRequest = payload.model === 'openrouter/free' &&
        payload.provider &&
        payload.provider.require_parameters === true;
      const isOpenCodeRequest = payload.model === 'nemotron-3-super-free' &&
        payload.provider === undefined;
      if (
        !['Bearer fake-openrouter-key', 'Bearer fake-opencode-key'].includes(req.headers.authorization) ||
        (!isOpenRouterRequest && !isOpenCodeRequest) ||
        !payload.response_format ||
        payload.response_format.type !== 'json_schema'
      ) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'bad openrouter request' } }));
        return;
      }

      const schemaName = payload.response_format && payload.response_format.json_schema
        ? payload.response_format.json_schema.name
        : '';
      const schemaCallCount = calls.filter((item) => {
        const itemFormat = item.payload.response_format || {};
        const itemSchema = itemFormat.json_schema || {};
        return itemSchema.name === schemaName;
      }).length;
      if (schemaName === 'session_draft' && schemaCallCount === 1) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: `openrouter-smoke-${calls.length}`,
          error: { message: 'temporary upstream failure' },
        }));
        return;
      }
      const content = schemaName === 'report_classification'
        ? '{not valid json'
        : JSON.stringify({
          gameType: '桌游',
          title: '上海周五晚桌游局',
          city: '上海',
          area: '',
          address: '',
          playDate: '',
          playTime: '19:30',
          playMode: '线下',
          budgetRange: '看局而定',
          minPlayers: 2,
          maxPlayers: 6,
          currentPlayers: 1,
          tags: ['新手友好', '桌游'],
          note: '想组一个新手友好的桌游局。',
          contactNote: '申请通过后再交换联系方式或拉群。',
        });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id: `openrouter-smoke-${calls.length}`,
        choices: [
          {
            message: {
              content,
            },
          },
        ],
        usage: {
          prompt_tokens: schemaName === 'report_classification' ? 9 : 12,
          completion_tokens: schemaName === 'report_classification' ? 3 : 8,
          total_tokens: schemaName === 'report_classification' ? 12 : 20,
          cost: 0,
        },
      }));
    });
  });
  server.calls = calls;
  return server;
}

function listen(server, port) {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
}

function startServer(overrides = {}) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(overrides.port || PORT),
      DB_PATH: overrides.dbPath || dbPath,
      JWT_SECRET: 'smoke-secret',
      TIANDITU_KEY: 'smoke-tianditu-key',
      TIANDITU_SEARCH_URL: GEO_BASE,
      WECHAT_LOGIN_DEV_MODE: 'true',
      AI_ENABLED: overrides.aiEnabled || 'true',
      AI_PROVIDER: overrides.aiProvider || 'mock',
      AI_API_KEY: overrides.aiApiKey || '',
      AI_MODEL: Object.prototype.hasOwnProperty.call(overrides, 'aiModel') ? overrides.aiModel : 'mock-v1',
      AI_BASE_URL: overrides.aiBaseUrl || '',
      AI_SITE_URL: overrides.aiSiteUrl || '',
      AI_APP_TITLE: overrides.aiAppTitle || 'juben-werewolf-match-smoke',
      AI_RETRY_COUNT: Object.prototype.hasOwnProperty.call(overrides, 'aiRetryCount') ? overrides.aiRetryCount : '1',
      AI_DAILY_COST_LIMIT: Object.prototype.hasOwnProperty.call(overrides, 'aiDailyCostLimit') ? overrides.aiDailyCostLimit : '0',
      AI_DAILY_LIMIT: '20',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForServer(base = BASE) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/options`);
      if (res.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Server did not start in time');
}

async function requestAt(base, method, url, body, token) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.code !== 0) {
    throw new Error(`${method} ${url} failed: ${res.status} ${JSON.stringify(data)}`);
  }
  return data;
}

async function request(method, url, body, token) {
  return requestAt(BASE, method, url, body, token);
}

async function expectFailureAt(base, method, url, body, token) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.code === 0) {
    throw new Error(`${method} ${url} should have failed`);
  }
  return data;
}

async function expectFailure(method, url, body, token) {
  return expectFailureAt(BASE, method, url, body, token);
}

async function register(nickname, wechat) {
  const res = await request('POST', '/api/register', {
    nickname,
    wechat,
    password: '123456',
  });
  return res.data;
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function runAiModuleSmoke() {
  const options = {
    gameTypes: ['剧本杀', '狼人杀', '桌游'],
    playStyles: ['推理型', '欢乐型'],
    budgetRanges: ['50以下', '50-100', '看局而定'],
    playModes: ['线下', '线上'],
    excludedGameTypes: ['麻将', '德州扑克'],
    reportReasons: ['骚扰', '鸽局', '虚假信息', '不合适内容', '其他'],
  };
  const capabilities = ai.getAiCapabilities({
    enabled: true,
    provider: 'openai',
    apiKey: 'fake-smoke-key',
    model: 'fake-model',
    timeoutMs: 8000,
    dailyLimit: 20,
  });
  if (capabilities.ready || capabilities.features.sessionDraft) {
    throw new Error('AI module should not enable unsupported providers');
  }
  const draft = ai.normalizeAiSessionDraft({
    gameType: '麻将',
    playMode: '未知',
    budgetRange: '999',
    minPlayers: -1,
    maxPlayers: 99,
    tags: ['麻将', '推理'],
  }, {
    gameTypes: ['桌游'],
    budgetRange: '50-100',
    city: '上海市',
  }, options);
  if (
    draft.gameType !== '桌游' ||
    draft.playMode !== '线下' ||
    draft.budgetRange !== '50-100' ||
    draft.city !== '上海' ||
    draft.tags.includes('麻将')
  ) {
    throw new Error('AI module should normalize unsafe draft output');
  }
  const classification = ai.normalizeAiReportClassification({
    reason: '未知',
    severity: 'critical',
    confidence: 2,
  }, options);
  if (
    classification.reason !== '其他' ||
    classification.severity !== 'low' ||
    classification.confidence !== 1
  ) {
    throw new Error('AI module should normalize report classification output');
  }
  const unsupportedProviderError = await ai.generateSessionDraft({
    enabled: true,
    provider: 'openai',
    apiKey: 'fake-smoke-key',
    model: 'fake-model',
    timeoutMs: 8000,
    dailyLimit: 20,
  }, '周五晚桌游', {}, options).then(() => null).catch((error) => error);
  if (!unsupportedProviderError || unsupportedProviderError.status !== 501) {
    throw new Error('AI module should reject unsupported provider calls');
  }
}

async function runAiProviderGuardSmoke() {
  const guardServer = startServer({
    port: AI_GUARD_PORT,
    dbPath: path.join(tmpDir, 'ai-provider-guard.db'),
    aiProvider: 'openai',
    aiApiKey: 'fake-smoke-key',
    aiModel: 'fake-model',
  });
  try {
    await waitForServer(AI_GUARD_BASE);
    const health = await requestAt(AI_GUARD_BASE, 'GET', '/api/health');
    if (
      health.data.ai.ready !== false ||
      health.data.ai.providerSupported !== false ||
      health.data.ai.providerConfigured !== true ||
      health.data.ai.features.sessionDraft !== false
    ) {
      throw new Error('Unsupported AI provider should not expose ready features');
    }
  } finally {
    guardServer.kill();
  }
}

async function runAiCostLimitSmoke() {
  const costDbPath = path.join(tmpDir, 'ai-cost-limit.db');
  const server = startServer({
    port: AI_COST_GUARD_PORT,
    dbPath: costDbPath,
    aiProvider: 'mock',
    aiDailyCostLimit: '0.5',
  });
  try {
    await waitForServer(AI_COST_GUARD_BASE);
    const user = await requestAt(AI_COST_GUARD_BASE, 'POST', '/api/register', {
      nickname: 'AI 成本测试',
      wechat: 'ai_cost_smoke',
      password: '123456',
    });
    const capabilities = await requestAt(AI_COST_GUARD_BASE, 'GET', '/api/ai/capabilities', null, user.data.token);
    if (capabilities.data.dailyCostLimit !== 0.5) {
      throw new Error('AI capabilities should expose daily cost limit');
    }
    const logDb = new Database(costDbPath);
    try {
      logDb.prepare(`
        INSERT INTO ai_usage_logs (
          user_id, feature, input_hash, output_status, provider, model, latency_ms, cost_credits
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.data.userId, 'sessionDraft', 'cost-limit-smoke', 'ok', 'openrouter', 'openrouter/free', 10, 0.5);
    } finally {
      logDb.close();
    }
    const blocked = await expectFailureAt(AI_COST_GUARD_BASE, 'POST', '/api/ai/session-draft', {
      prompt: '周五晚上海桌游',
    }, user.data.token);
    if (blocked.code !== 429 || !String(blocked.message || '').includes('成本预算')) {
      throw new Error('AI daily cost limit should block new AI calls');
    }
  } finally {
    server.kill();
  }
}

async function runOpenRouterSmoke() {
  const openRouterMock = startOpenRouterMock();
  const openRouterDbPath = path.join(tmpDir, 'openrouter-provider.db');
  await listen(openRouterMock, OPENROUTER_PORT);
  const server = startServer({
    port: OPENROUTER_BACKEND_PORT,
    dbPath: openRouterDbPath,
    aiProvider: 'openrouter',
    aiApiKey: 'fake-openrouter-key',
    aiModel: '',
    aiBaseUrl: OPENROUTER_API_BASE,
    aiSiteUrl: 'https://example.com',
    aiAppTitle: 'juben smoke',
  });
  try {
    await waitForServer(OPENROUTER_BASE);
    const user = await requestAt(OPENROUTER_BASE, 'POST', '/api/register', {
      nickname: 'OpenRouter 测试',
      wechat: 'openrouter_smoke',
      password: '123456',
    });
    const capabilities = await requestAt(OPENROUTER_BASE, 'GET', '/api/ai/capabilities', null, user.data.token);
    if (
      capabilities.data.ready !== true ||
      capabilities.data.provider !== 'openrouter' ||
      capabilities.data.model !== 'openrouter/free' ||
      !capabilities.data.features.sessionDraft
    ) {
      throw new Error('OpenRouter provider should expose AI capabilities');
    }
    const draft = await requestAt(OPENROUTER_BASE, 'POST', '/api/ai/session-draft', {
      prompt: '周五晚上海新手友好桌游',
    }, user.data.token);
    if (
      draft.data.provider !== 'openrouter' ||
      draft.data.model !== 'openrouter/free' ||
      draft.data.draft.gameType !== '桌游' ||
      openRouterMock.calls.length !== 2
    ) {
      throw new Error('OpenRouter session draft should retry once and use the provider response');
    }
    const headers = openRouterMock.calls[1].headers;
    if (headers['http-referer'] !== 'https://example.com' || headers['x-openrouter-title'] !== 'juben smoke') {
      throw new Error('OpenRouter optional app headers should be forwarded');
    }
    const failedClassification = await expectFailureAt(OPENROUTER_BASE, 'POST', '/api/ai/report-classification', {
      reason: '骚扰',
      detail: '对方一直私信骚扰',
    }, user.data.token);
    if (failedClassification.code !== 502) {
      throw new Error('OpenRouter invalid structured output should fail as upstream error');
    }
    const logDb = new Database(openRouterDbPath, { readonly: true });
    try {
      const logs = logDb.prepare(`
        SELECT feature, output_status, provider_request_id, prompt_tokens, completion_tokens, total_tokens, cost_credits
        FROM ai_usage_logs
        ORDER BY id ASC
      `).all();
      const sessionDraftLog = logs.find((item) => item.feature === 'sessionDraft');
      const classificationLog = logs.find((item) => item.feature === 'reportClassification');
      if (
        !sessionDraftLog ||
        sessionDraftLog.output_status !== 'ok' ||
        sessionDraftLog.provider_request_id !== 'openrouter-smoke-2' ||
        sessionDraftLog.prompt_tokens !== 12 ||
        sessionDraftLog.completion_tokens !== 8 ||
        sessionDraftLog.total_tokens !== 20 ||
        sessionDraftLog.cost_credits !== 0
      ) {
        throw new Error('OpenRouter successful usage metadata should be logged');
      }
      if (
        !classificationLog ||
        classificationLog.output_status !== 'error' ||
        classificationLog.provider_request_id !== 'openrouter-smoke-3' ||
        classificationLog.prompt_tokens !== 9 ||
        classificationLog.completion_tokens !== 3 ||
        classificationLog.total_tokens !== 12 ||
        classificationLog.cost_credits !== 0
      ) {
        throw new Error('OpenRouter failed structured output usage metadata should be logged');
      }
    } finally {
      logDb.close();
    }
  } finally {
    server.kill();
    openRouterMock.close();
  }
}

async function runOpenCodeSmoke() {
  const openCodeMock = startOpenRouterMock();
  const openCodeDbPath = path.join(tmpDir, 'opencode-provider.db');
  await listen(openCodeMock, OPENROUTER_PORT);
  const server = startServer({
    port: OPENROUTER_BACKEND_PORT,
    dbPath: openCodeDbPath,
    aiProvider: 'opencode',
    aiApiKey: 'fake-opencode-key',
    aiModel: '',
    aiBaseUrl: `http://127.0.0.1:${OPENROUTER_PORT}/api/v1`,
    aiAppTitle: 'juben smoke',
  });
  try {
    await waitForServer(OPENROUTER_BASE);
    const user = await requestAt(OPENROUTER_BASE, 'POST', '/api/register', {
      nickname: 'OpenCode 测试',
      wechat: 'opencode_smoke',
      password: '123456',
    });
    const capabilities = await requestAt(OPENROUTER_BASE, 'GET', '/api/ai/capabilities', null, user.data.token);
    if (
      capabilities.data.ready !== true ||
      capabilities.data.provider !== 'opencode' ||
      capabilities.data.model !== 'nemotron-3-super-free' ||
      !capabilities.data.features.sessionDraft
    ) {
      throw new Error('OpenCode provider should expose AI capabilities');
    }
    const draft = await requestAt(OPENROUTER_BASE, 'POST', '/api/ai/session-draft', {
      prompt: '周五晚上海新手友好桌游',
    }, user.data.token);
    if (
      draft.data.provider !== 'opencode' ||
      draft.data.model !== 'nemotron-3-super-free' ||
      draft.data.draft.gameType !== '桌游' ||
      openCodeMock.calls.length !== 2
    ) {
      throw new Error('OpenCode session draft should retry once and use the provider response');
    }
    const headers = openCodeMock.calls[1].headers;
    const payload = openCodeMock.calls[1].payload;
    if (headers['http-referer'] || headers['x-openrouter-title'] || payload.provider !== undefined) {
      throw new Error('OpenCode requests should not include OpenRouter-specific routing fields');
    }
  } finally {
    server.kill();
    openCodeMock.close();
  }
}

async function main() {
  await runAiModuleSmoke();
  const geoMock = startGeoMock();
  await listen(geoMock, GEO_PORT);
  await runAiProviderGuardSmoke();
  await runAiCostLimitSmoke();
  await runOpenRouterSmoke();
  await runOpenCodeSmoke();
  const server = startServer();
  try {
    await waitForServer();
    const health = await request('GET', '/api/health');
    if (
      health.data.status !== 'ok' ||
      health.data.database !== 'ok' ||
      health.data.tiandituConfigured !== true ||
      health.data.wechatLoginConfigured !== true ||
      health.data.wechatLoginDevMode !== true ||
      !health.data.ai ||
      health.data.ai.ready !== true ||
      !health.data.productScope.gameTypes.includes('血染钟楼') ||
      health.data.productScope.excludedGameTypes.includes('棋牌') === false
    ) {
      throw new Error('Health endpoint should report service readiness and product scope');
    }

    const creator = await register('局主', 'creator_smoke');
    const joiner = await register('搭子', 'joiner_smoke');
    const tempJoiner = await register('临时搭子', 'temp_joiner_smoke');
    const blockedUser = await register('被拉黑用户', 'blocked_smoke');
    const creatorToken = creator.token;
    const joinerToken = joiner.token;
    const tempJoinerToken = tempJoiner.token;
    const blockedToken = blockedUser.token;

    const mpLogin = await request('POST', '/api/wechat/login', {
      code: 'smoke-wx-code',
      nickname: '小程序搭子',
      avatar: 'https://example.com/avatar.png',
      gender: 1,
    });
    if (!mpLogin.data.token || !mpLogin.data.userId || mpLogin.data.isNewUser !== true) {
      throw new Error('Wechat login should create a new mini program user in dev mode');
    }
    const mpLoginAgain = await request('POST', '/api/wechat/login', {
      code: 'smoke-wx-code',
      nickname: '小程序搭子更新',
    });
    if (mpLoginAgain.data.userId !== mpLogin.data.userId || mpLoginAgain.data.isNewUser !== false) {
      throw new Error('Wechat login should reuse the same user for the same code/openid');
    }
    const mpMe = await request('GET', '/api/me', null, mpLogin.data.token);
    if (!mpMe.data.hasMpLogin || mpMe.data.nickname !== '小程序搭子更新') {
      throw new Error('Wechat login user should expose mini program login status');
    }
    const defaultPrefs = await request('GET', '/api/notification-preferences', null, mpLogin.data.token);
    if (!defaultPrefs.data.wechatSubscribe.requestUpdates || !defaultPrefs.data.wechatSubscribe.reviewResults) {
      throw new Error('Notification preferences should default to enabled');
    }
    const savedPrefs = await request('POST', '/api/notification-preferences', {
      requestUpdates: false,
      reviewResults: true,
      sessionStatus: false,
    }, mpLogin.data.token);
    if (
      savedPrefs.data.wechatSubscribe.requestUpdates !== false ||
      savedPrefs.data.wechatSubscribe.reviewResults !== true ||
      savedPrefs.data.wechatSubscribe.sessionStatus !== false
    ) {
      throw new Error('Notification preferences should be persisted');
    }

    const aiCapabilities = await request('GET', '/api/ai/capabilities', null, creatorToken);
    if (
      !aiCapabilities.data.ready ||
      !aiCapabilities.data.features.sessionDraft ||
      !aiCapabilities.data.features.matchExplanation ||
      !aiCapabilities.data.features.reportClassification ||
      !aiCapabilities.data.features.opsSummary
    ) {
      throw new Error('AI mock capabilities should be available in smoke');
    }
    const aiDraft = await request('POST', '/api/ai/session-draft', {
      prompt: '周五晚上海静安新手友好狼人杀，最好准时不鸽',
    }, creatorToken);
    if (
      aiDraft.data.draft.gameType !== '狼人杀' ||
      aiDraft.data.draft.city !== '上海' ||
      !aiDraft.data.draft.tags.includes('新手友好')
    ) {
      throw new Error('AI session draft should produce structured tabletop session fields');
    }

    const emptyProfileMe = await request('GET', '/api/me', null, creatorToken);
    if (!emptyProfileMe.data.profileCompleteness || emptyProfileMe.data.profileCompleteness.score >= 100) {
      throw new Error('New users should get profile completeness guidance');
    }

    await expectFailure('GET', '/api/geo/search?keyword=人民广场');
    const places = await request('GET', '/api/geo/search?keyword=人民广场&city=上海', null, creatorToken);
    if (
      places.data[0].name !== '人民广场' ||
      places.data[0].city !== '上海' ||
      places.data[0].lng !== 121.475 ||
      places.data[0].lat !== 31.232
    ) {
      throw new Error('Tianditu place search should return normalized places');
    }

    await request('POST', '/api/profile', {
      gameTypes: ['桌游'],
      playStyles: ['合作型'],
      availability: ['周末白天'],
      budgetRange: '100-200',
      playerCountRange: '5-8人',
      playModes: ['线下'],
      city: '上海',
      intro: '喜欢轻策和合作桌游。',
    }, joinerToken);

    await request('POST', '/api/profile', {
      gameTypes: ['桌游'],
      playStyles: ['欢乐型'],
      availability: ['周五晚'],
      budgetRange: '100-200',
      playerCountRange: '5-8人',
      playModes: ['线下'],
      city: '上海',
      intro: '会被拉黑的测试用户。',
    }, blockedToken);

    const me = await request('GET', '/api/me', null, joinerToken);
    if (
      me.data.profile.budgetRange !== '100-200' ||
      !me.data.profile.availability.includes('周末白天') ||
      !me.data.profile.playModes.includes('线下') ||
      me.data.profileCompleteness.score !== 100
    ) {
      throw new Error('Extended profile fields were not saved');
    }

    await request('POST', `/api/like/${joiner.userId}`, {}, creatorToken);
    const joinerDiscover = await request('GET', '/api/discover', null, joinerToken);
    if (!joinerDiscover.data.some((item) => item.id === creator.userId)) {
      throw new Error('Users who liked me should still appear in discover');
    }
    const mutual = await request('POST', `/api/like/${creator.userId}`, {}, joinerToken);
    if (!mutual.data.matched) {
      throw new Error('Like back should create a mutual match');
    }

    const created = await request('POST', '/api/sessions', {
      gameType: '桌游',
      title: '周五晚轻策桌游局',
      city: '上海',
      area: '静安',
      address: '人民大道120号',
      locationLng: 121.475,
      locationLat: 31.232,
      playDate: '2026-06-01',
      playTime: '19:30',
      playMode: '线下',
      budgetRange: '100-200',
      minPlayers: 3,
      maxPlayers: 5,
      currentPlayers: 2,
      tags: ['新手友好', '轻策'],
      note: '欢迎不鸽的同好。',
      contactNote: '匹配后拉微信群。',
    }, creatorToken);

    const sessionId = created.data.id;
    const edited = await request('PATCH', `/api/sessions/${sessionId}`, {
      gameType: '桌游',
      title: '周五晚合作桌游局',
      city: '上海',
      area: '静安',
      address: '人民大道120号附近',
      locationLng: 121.476,
      locationLat: 31.233,
      playDate: '2026-06-01',
      playTime: '19:45',
      playMode: '线下',
      budgetRange: '100-200',
      minPlayers: 3,
      maxPlayers: 6,
      currentPlayers: 2,
      tags: ['新手友好', '合作'],
      note: '欢迎不鸽的合作桌游同好。',
      contactNote: '通过后拉微信群。',
    }, creatorToken);
    if (
      edited.data.title !== '周五晚合作桌游局' ||
      edited.data.maxPlayers !== 6 ||
      edited.data.address !== '人民大道120号附近' ||
      !edited.data.location ||
      edited.data.location.lng !== 121.476
    ) {
      throw new Error('Creator should be able to edit session fields');
    }
    await expectFailure('PATCH', `/api/sessions/${sessionId}`, {
      gameType: '桌游',
      title: '非局主编辑',
      city: '上海',
      playDate: '2026-06-01',
      playTime: '19:45',
      playMode: '线下',
      budgetRange: '100-200',
      minPlayers: 3,
      maxPlayers: 6,
      currentPlayers: 2,
      tags: ['测试'],
    }, joinerToken);

    await request('POST', '/api/sessions', {
      gameType: '跑团',
      title: '外地跑团测试局',
      city: '北京',
      playDate: '2026-05-31',
      playTime: '14:00',
      playMode: '线上',
      budgetRange: '50以下',
      minPlayers: 3,
      maxPlayers: 4,
      currentPlayers: 2,
      tags: ['测试'],
    }, creatorToken);

    const soon = await request('POST', '/api/sessions', {
      gameType: '桌游',
      title: '未来七天附近测试局',
      city: '上海',
      area: '黄浦',
      address: '人民广场附近',
      locationLng: 121.475,
      locationLat: 31.232,
      playDate: addDays(2),
      playTime: '19:00',
      playMode: '线下',
      budgetRange: '100-200',
      minPlayers: 3,
      maxPlayers: 5,
      currentPlayers: 2,
      tags: ['附近'],
    }, creatorToken);

    const list = await request('GET', '/api/sessions?gameType=桌游&city=上海');
    if (!list.data.some((item) => item.id === sessionId)) {
      throw new Error('Created session was not returned by list endpoint');
    }

    const filtered = await request(
      'GET',
      '/api/sessions?dateFrom=2026-06-01&dateTo=2026-06-01&minSeats=3&onlyMatched=1',
      null,
      joinerToken
    );
    if (!filtered.data.some((item) => item.id === sessionId)) {
      throw new Error('Session filters should include matching session with enough seats');
    }
    const nearby = await request(
      'GET',
      '/api/sessions?datePreset=next7&nearLng=121.47&nearLat=31.23&maxDistanceKm=20',
      null,
      joinerToken
    );
    if (!nearby.data.some((item) => item.id === soon.data.id && typeof item.distanceKm === 'number')) {
      throw new Error('Nearby/date preset filters should return distance-ranked sessions');
    }

    const ranked = await request('GET', '/api/sessions', null, joinerToken);
    const rankedTarget = ranked.data.find((item) => item.id === sessionId);
    if (!rankedTarget || !rankedTarget.matchReasons.includes('常玩类型')) {
      throw new Error('Ranked session should include match reasons');
    }

    const detail = await request('GET', `/api/sessions/${sessionId}`, null, joinerToken);
    if (detail.data.canRequest !== true) {
      throw new Error('Joiner should be able to request joining');
    }
    if (detail.data.budgetRange !== '100-200' || detail.data.playMode !== '线下') {
      throw new Error('Session budget/play mode fields were not returned');
    }
    if (detail.data.address !== '人民大道120号附近' || !detail.data.location) {
      throw new Error('Session location fields were not returned');
    }
    const aiExplanation = await request('POST', '/api/ai/match-explanation', {
      sessionId,
    }, joinerToken);
    if (
      !aiExplanation.data.explanation ||
      !aiExplanation.data.explanation.includes('常玩类型') ||
      !aiExplanation.data.explanation.includes('预算')
    ) {
      throw new Error('AI match explanation should summarize rule-based reasons');
    }
    const aiMessage = await request('POST', '/api/ai/request-message', {
      sessionId,
    }, joinerToken);
    if (!aiMessage.data.message || !aiMessage.data.message.includes('周五晚合作桌游局')) {
      throw new Error('AI request message should reference target session');
    }
    const reportClassification = await request('POST', '/api/ai/report-classification', {
      reason: '其他',
      detail: '对方临时爽约放鸽子，之后一直失联。',
    }, joinerToken);
    if (
      !reportClassification.data.classification ||
      reportClassification.data.classification.reason !== '鸽局' ||
      reportClassification.data.classification.severity !== 'medium'
    ) {
      throw new Error('AI report classification should map free text to a report category');
    }

    const tempRequest = await request('POST', `/api/sessions/${sessionId}/requests`, {
      message: '先占个坑，可能要确认时间。',
      certainty: 'tentative',
    }, tempJoinerToken);
    const tempMine = await request('GET', '/api/my/sessions', null, tempJoinerToken);
    if (!tempMine.data.requested.some((item) => item.requestId === tempRequest.data.id)) {
      throw new Error('My sessions should include request id');
    }
    await request('PATCH', `/api/session-requests/${tempRequest.data.id}/withdraw`, {}, tempJoinerToken);
    await expectFailure('PATCH', `/api/session-requests/${tempRequest.data.id}`, {
      status: 'approved',
    }, creatorToken);

    const joinRequest = await request('POST', `/api/sessions/${sessionId}/requests`, {
      message: '我喜欢轻策，时间合适。',
      certainty: 'confirmed',
    }, joinerToken);

    const requests = await request('GET', `/api/sessions/${sessionId}/requests`, null, creatorToken);
    const joinerRequest = requests.data.find((item) => item.id === joinRequest.data.id);
    if (!joinerRequest || joinerRequest.certainty !== 'confirmed' || joinerRequest.user.budgetRange !== '100-200') {
      throw new Error('Creator did not see pending request');
    }
    const creatorMine = await request('GET', '/api/my/sessions', null, creatorToken);
    const createdMine = creatorMine.data.created.find((item) => item.id === sessionId);
    if (!createdMine || !createdMine.requestCounts || createdMine.requestCounts.pending < 1) {
      throw new Error('My created sessions should include request counts');
    }
    const creatorNotifications = await request('GET', '/api/notifications', null, creatorToken);
    if (!creatorNotifications.data.some((item) => item.type === 'request_created')) {
      throw new Error('Creator should receive request notification');
    }

    await request('PATCH', `/api/session-requests/${joinRequest.data.id}`, {
      status: 'approved',
    }, creatorToken);

    const approvedDetail = await request('GET', `/api/sessions/${sessionId}`, null, joinerToken);
    if (!approvedDetail.data.contactNote) {
      throw new Error('Approved member should see contact note');
    }
    const joinerNotifications = await request('GET', '/api/notifications', null, joinerToken);
    if (!joinerNotifications.data.some((item) => item.type === 'request_approved')) {
      throw new Error('Applicant should receive approval notification');
    }
    const unread = await request('GET', '/api/notifications/unread-count', null, joinerToken);
    if (unread.data.count < 1) {
      throw new Error('Unread notification count should be available');
    }
    await request('PATCH', '/api/notifications/read-all', {}, joinerToken);
    const feedback = await request('POST', `/api/sessions/${sessionId}/feedback`, {
      toUserId: creator.userId,
      punctual: true,
      friendly: true,
      wouldPlayAgain: true,
      note: '准时友好。',
    }, joinerToken);
    if (!feedback.data.reliability || feedback.data.reliability.score !== 100) {
      throw new Error('Session feedback should update reliability');
    }
    await request('POST', '/api/reports', {
      targetUserId: creator.userId,
      sessionId,
      reason: '其他',
      detail: 'smoke report',
    }, joinerToken);
    const ops = await request('GET', '/api/ops/stats', null, creatorToken);
    if (ops.data.openSessions < 1 || ops.data.pendingRequests < 0 || ops.data.openReports < 1) {
      throw new Error('Ops stats should include core counts');
    }
    const aiOpsSummary = await request('GET', '/api/ai/ops-summary', null, creatorToken);
    if (
      !aiOpsSummary.data.summary ||
      !aiOpsSummary.data.summary.includes('开放举报') ||
      aiOpsSummary.data.stats.openReports < 1 ||
      !Array.isArray(aiOpsSummary.data.requestBreakdown) ||
      !aiOpsSummary.data.aiUsage ||
      aiOpsSummary.data.aiUsage.today.requests < 4 ||
      !aiOpsSummary.data.actions.length
    ) {
      throw new Error('AI ops summary should include report and action signals');
    }
    await request('POST', `/api/block/${blockedUser.userId}`, {}, joinerToken);
    await expectFailure('POST', `/api/like/${joiner.userId}`, {}, blockedToken);

    const cancelled = await request('POST', '/api/sessions', {
      gameType: '狼人杀',
      title: '取消前的测试局',
      city: '上海',
      playDate: '2026-06-02',
      playTime: '20:00',
      minPlayers: 6,
      maxPlayers: 10,
      currentPlayers: 5,
      tags: ['阵营'],
    }, creatorToken);

    const cancelledRequest = await request('POST', `/api/sessions/${cancelled.data.id}/requests`, {
      message: '如果取消就不来了。',
    }, joinerToken);
    await request('PATCH', `/api/sessions/${cancelled.data.id}/status`, {
      status: 'cancelled',
    }, creatorToken);
    await expectFailure('PATCH', `/api/session-requests/${cancelledRequest.data.id}`, {
      status: 'approved',
    }, creatorToken);

    console.log('session smoke ok');
  } finally {
    server.kill();
    geoMock.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
