const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const backendDir = path.join(__dirname, '..');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

async function startBackend(t, overrides = {}, sharedDbPath) {
  const reservation = http.createServer();
  await listen(reservation);
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jwm-safety-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DB_PATH: sharedDbPath || path.join(tmpDir, 'data.db'),
      JWT_SECRET: 'isolated-safety-regression-secret',
      WECHAT_LOGIN_DEV_MODE: 'false',
      WECHAT_MINIPROGRAM_APPID: '',
      WECHAT_MINIPROGRAM_SECRET: '',
      AI_ENABLED: 'true',
      AI_PROVIDER: 'mock',
      AI_API_KEY: '',
      AI_MODEL: 'mock-v1',
      AI_DAILY_LIMIT: '1',
      AI_DAILY_COST_LIMIT: '0',
      AI_RETRY_COUNT: '0',
      ...overrides,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    await exited;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const request = async (method, route, body, token) => {
    const response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: await response.json() };
  };
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      if ((await request('GET', '/api/health')).status === 200) {
        return { request, dbPath: sharedDbPath || path.join(tmpDir, 'data.db'), diagnostics: () => output };
      }
    } catch {}
    if (child.exitCode !== null) break;
    await delay(30);
  }
  assert.fail(`Backend failed to become ready: ${output}`);
}

async function register(request, suffix = 'one') {
  const result = await request('POST', '/api/register', {
    nickname: `Safety ${suffix}`,
    wechat: `safety_${suffix}`,
    password: 'regression-password-123',
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  return result.body.data.token;
}

test('production authentication refuses missing and development signing secrets', () => {
  for (const secret of [undefined, '', '   ', 'dev-secret', 'your-super-secret-key-change-in-production']) {
    const env = { ...process.env, NODE_ENV: 'production' };
    if (secret === undefined) delete env.JWT_SECRET;
    else env.JWT_SECRET = secret;
    const result = spawnSync(process.execPath, ['-e', "require('./auth')"], {
      cwd: backendDir, env, encoding: 'utf8', timeout: 5000,
    });
    assert.notEqual(result.status, 0, `Production accepted secret ${JSON.stringify(secret)}`);
    assert.match(result.stderr, /JWT_SECRET/, 'Startup explains the invalid configuration');
  }
  const valid = spawnSync(process.execPath, ['-e', "require('./auth')"], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      JWT_SECRET: 'a-production-signing-secret-with-enough-length',
    },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(valid.status, 0, valid.stderr);
});

test('invalid login passwords return 400 and the server remains available', async (t) => {
  const { request } = await startBackend(t);
  await register(request);
  for (const password of [undefined, null, 123456, [], {}, '']) {
    const result = await request('POST', '/api/login', { wechat: 'safety_one', password });
    assert.equal(result.status, 400, `Password ${JSON.stringify(password)}: ${JSON.stringify(result.body)}`);
    assert.equal((await request('GET', '/api/health')).status, 200);
  }
  const incorrect = await request('POST', '/api/login', { wechat: 'safety_one', password: 'incorrect' });
  assert.equal(incorrect.status, 401);
  const valid = await request('POST', '/api/login', {
    wechat: 'safety_one', password: 'regression-password-123',
  });
  assert.equal(valid.status, 200);
  assert.ok(valid.body.data.token);
});

test('production refuses the WeChat development login switch', () => {
  const result = spawnSync(process.execPath, ['-e', "require('./auth')"], {
    cwd: backendDir,
    env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: 'a-production-signing-secret-with-enough-length', WECHAT_LOGIN_DEV_MODE: 'true' },
    encoding: 'utf8', timeout: 5000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WECHAT_LOGIN_DEV_MODE/);
});

test('non-string registration passwords cannot crash the server', async (t) => {
  const { request } = await startBackend(t);
  for (const password of [123456, ['long-enough-password'], { value: 'long-enough-password' }]) {
    const result = await request('POST', '/api/register', {
      nickname: 'Invalid password', wechat: 'invalid_password', password,
    });
    assert.equal(result.status, 400, `Password ${JSON.stringify(password)}: ${JSON.stringify(result.body)}`);
    assert.equal((await request('GET', '/api/health')).status, 200);
  }
  await register(request);
});

async function startProvider(t) {
  let calls = 0;
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      calls += 1;
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          choices: [{ message: { content: JSON.stringify({
            summary: 'Regression fixture', checklist: ['Ready'], focusPoints: ['Focus'],
          }) } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0 },
        }));
      }, 200);
    });
  });
  await listen(server);
  t.after(() => new Promise((resolve) => {
    server.close(resolve);
    server.closeIdleConnections();
  }));
  return {
    calls: () => calls,
    config: {
      AI_PROVIDER: 'openrouter',
      AI_API_KEY: 'local-test-key',
      AI_MODEL: 'regression-fixture',
      AI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1/chat/completions`,
    },
  };
}

test('concurrent requests reserve the daily quota before calling the provider', async (t) => {
  const provider = await startProvider(t);
  const { request } = await startBackend(t, { ...provider.config, AI_USER_CONCURRENCY: '10' });
  const token = await register(request);
  const scripts = await request('GET', '/api/scripts', undefined, token);
  const scriptId = scripts.body.data[0].id;
  const results = await Promise.all(Array.from({ length: 3 }, () =>
    request('POST', '/api/ai/play-prep', { scriptId }, token)));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 429, 429]);
  assert.equal(provider.calls(), 1, 'Only the reserved request reaches the provider');
  const quota = await request('GET', '/api/ai/capabilities', undefined, token);
  assert.equal(quota.body.data.quota.dailyRequestUsed, 1);
  assert.equal(quota.body.data.quota.dailyRequestRemaining, 0);
  assert.equal((await request('POST', '/api/ai/play-prep', { scriptId }, token)).status, 429);

  const otherToken = await register(request, 'two');
  assert.equal((await request('POST', '/api/ai/play-prep', { scriptId }, otherToken)).status, 200);
  assert.equal(provider.calls(), 2, 'Daily request quotas are per user');
});

test('two backend workers sharing a database cannot spend the same daily quota', async (t) => {
  const provider = await startProvider(t);
  const config = { ...provider.config, AI_USER_CONCURRENCY: '10' };
  const first = await startBackend(t, config);
  const token = await register(first.request);
  const second = await startBackend(t, config, first.dbPath);
  const results = await Promise.all([
    first.request('POST', '/api/ai/play-prep', { scriptId: 1 }, token),
    second.request('POST', '/api/ai/play-prep', { scriptId: 1 }, token),
  ]);
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 429], first.diagnostics() + second.diagnostics());
  assert.equal(provider.calls(), 1);
});

test('cost admission includes other users in-flight reservations', async (t) => {
  const provider = await startProvider(t);
  const { request } = await startBackend(t, { ...provider.config, AI_DAILY_COST_LIMIT: '0.015', AI_COST_RESERVE_PER_REQUEST: '0.01' });
  const tokens = [await register(request), await register(request, 'two')];
  const results = await Promise.all(tokens.map((token) => request('POST', '/api/ai/play-prep', { scriptId: 1 }, token)));
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 429]);
  assert.equal(provider.calls(), 1);
  const refusedIndex = results.findIndex((item) => item.status === 429);
  assert.equal((await request('POST', '/api/ai/play-prep', { scriptId: 1 }, tokens[refusedIndex])).status, 200);
});
