const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const Database = require('better-sqlite3');

test('solo discovery and play archive API', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jwm-solo-api-'));
  const dbPath = path.join(dir, 'data.db');
  const reservation = http.createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), DB_PATH: dbPath,
      JWT_SECRET: 'solo-api-tests-local-secret', AI_ENABLED: 'true', AI_PROVIDER: 'mock',
      AI_MODEL: 'mock-v1', AI_API_KEY: '', AI_DAILY_LIMIT: '200', AI_DAILY_COST_LIMIT: '0',
      WECHAT_LOGIN_DEV_MODE: 'false' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let diagnostics = '';
  child.stderr.on('data', (chunk) => { diagnostics += chunk; });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  t.after(async () => {
    if (child.exitCode === null) child.kill('SIGTERM');
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const request = async (method, url, body, token) => {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000) });
    return { status: res.status, ...(await res.json()) };
  };
  let ready = false;
  for (let i = 0; i < 100; i += 1) {
    try { ready = (await request('GET', '/api/health')).code === 0; } catch {}
    if (ready || child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  assert(ready, diagnostics);
  let account = 0;
  const register = async () => {
    const res = await request('POST', '/api/register', { nickname: 'Solo test', wechat: 'solo_' + (++account), password: 'test-password-123' });
    assert.equal(res.code, 0);
    return res.data.token;
  };

  await t.test('new users see no invented percentage before the taste test', async () => {
    const token = await register();
    const res = await request('GET', '/api/scripts', undefined, token);
    assert(res.data.every((item) => item.matchScore === null));
  });

  await t.test('catalogue retains dismissed books and supports validated pagination', async () => {
    const token = await register();
    await request('POST', '/api/scripts/1/action', { action: 'dismiss' }, token);
    const recommendations = await request('GET', '/api/scripts', undefined, token);
    assert(!recommendations.data.some((item) => item.id === 1));
    const catalogue = await request('GET', '/api/scripts?catalog=1&limit=2&offset=0', undefined, token);
    assert.equal(catalogue.data.length, 2);
    assert(catalogue.data.some((item) => item.id === 1));
    assert.equal(catalogue.pagination.hasMore, true);
    const next = await request('GET', '/api/scripts?catalog=1&limit=2&offset=2', undefined, token);
    assert(next.data.every((item) => !catalogue.data.some((previous) => previous.id === item.id)));
    assert.equal((await request('GET', '/api/scripts?limit=-1')).status, 400);
  });

  await t.test('ranking considers books after the first hundred rows', async () => {
    const db = new Database(dbPath);
    const insert = db.prepare('INSERT INTO scripts (slug, title, game_type, tags, difficulty, duration_min) VALUES (?, ?, ?, ?, ?, ?)');
    let target;
    db.transaction(() => {
      for (let i = 0; i < 105; i += 1) insert.run('filler-' + i, 'Filler ' + i, '桌游', '[]', '入门', 60);
      target = Number(insert.run('late-best', 'Late best', '剧本杀', JSON.stringify(['硬核推理', '情感']), '进阶', 240).lastInsertRowid);
    })();
    db.close();
    const token = await register();
    await request('POST', '/api/taste-profile', { experience: ['硬核推理', '情感沉浸'], pace: '长时沉浸', frequency: '高频' }, token);
    const recommendations = await request('GET', '/api/scripts', undefined, token);
    assert.equal(recommendations.data[0].id, target);
  });

  await t.test('a play record changes subsequent recommendation signals', async () => {
    const token = await register();
    await request('POST', '/api/taste-profile', { experience: ['硬核推理'], frequency: '高频' }, token);
    const before = await request('GET', '/api/scripts/2', undefined, token);
    await request('POST', '/api/play-records', { scriptId: 2, rating: 1, playedAt: '2026-09-10' }, token);
    const after = await request('GET', '/api/scripts/2', undefined, token);
    assert(after.data.matchScore < before.data.matchScore);
    assert(after.data.matchReasons.includes('你已经玩过'));
  });

  await t.test('AI reads only the current users bounded saved notes when the client omits notes', async () => {
    const token = await register();
    for (let i = 0; i < 13; i += 1) await request('POST', '/api/scripts/1/notes', { category: '疑点', content: 'clue ' + i }, token);
    const coach = await request('POST', '/api/ai/stuck-coach', { scriptId: 1 }, token);
    assert.equal(coach.code, 0);
    assert.match(coach.data.coach.summary, /12/);
  });

  await t.test('notes support owner-only correction and durable create retries', async () => {
    const token = await register();
    const other = await register();
    const url = '/api/scripts/1/notes';
    const draft = { category: '疑点', title: 'First', content: 'A clue', clientRequestId: 'note-retry-key-0001' };
    const results = await Promise.all([request('POST', url, draft, token), request('POST', url, draft, token)]);
    assert(results.every((res) => res.code === 0));
    const id = results[0].data.id;
    assert.equal(results[1].data.id, id);
    assert.equal((await request('GET', url, undefined, token)).data.length, 1);
    assert.equal((await request('POST', url, { ...draft, content: 'Changed' }, token)).status, 409);
    assert.equal((await request('PATCH', url + '/' + id, { content: 'Not mine' }, other)).status, 404);
    assert.equal((await request('DELETE', url + '/' + id, undefined, other)).status, 404);
    assert.equal((await request('PATCH', '/api/scripts/2/notes/' + id, { content: 'Wrong script' }, token)).status, 404);
    assert.equal((await request('PATCH', url + '/' + id, { content: 'Corrected', category: '时间线' }, token)).code, 0);
    const notes = await request('GET', url, undefined, token);
    assert.equal(notes.data[0].content, 'Corrected');
    assert.equal(notes.data[0].title, 'First');
    assert.equal((await request('POST', url, draft, token)).data.id, id);
    assert.equal((await request('DELETE', url + '/' + id, undefined, token)).code, 0);
    assert.equal((await request('POST', url, draft, token)).status, 410);
    assert.equal((await request('GET', url, undefined, token)).data.length, 0);
    assert.equal((await request('POST', url, draft, other)).code, 0);
  });

  await t.test('record correction and deletion recompute recommendations without duplicate retries', async () => {
    const token = await register();
    const other = await register();
    await request('POST', '/api/taste-profile', { experience: ['硬核推理'], frequency: '高频' }, token);
    const baseline = (await request('GET', '/api/scripts/2', undefined, token)).data.matchScore;
    const draft = { scriptId: 2, rating: 1, playedAt: '2026-09-10', clientRequestId: 'record-retry-key-0001' };
    const results = await Promise.all([request('POST', '/api/play-records', draft, token), request('POST', '/api/play-records', draft, token)]);
    const id = results[0].data.record.id;
    assert.equal(results[1].data.record.id, id);
    const url = '/api/play-records/' + id;
    const low = (await request('GET', '/api/scripts/2', undefined, token)).data.matchScore;
    assert.equal((await request('GET', url, undefined, other)).status, 404);
    assert.equal((await request('PATCH', url, { rating: 5 }, other)).status, 404);
    assert.equal((await request('DELETE', url, undefined, other)).status, 404);
    assert.equal((await request('PATCH', url, { rating: 5, role: 'Detective', playedAt: '2026-09-09' }, token)).code, 0);
    assert((await request('GET', '/api/scripts/2', undefined, token)).data.matchScore > low);
    const updated = (await request('GET', url, undefined, token)).data;
    assert.equal(updated.role, 'Detective');
    assert.equal(updated.playedAt, '2026-09-09');
    assert.equal((await request('POST', '/api/play-records', draft, token)).data.record.id, id);
    assert.equal((await request('POST', '/api/play-records', { ...draft, rating: 4 }, token)).status, 409);
    assert.equal((await request('PATCH', url, { playedAt: '2026-02-30' }, token)).status, 400);
    assert.equal((await request('DELETE', url, undefined, token)).data.summary.total, 0);
    assert.equal((await request('GET', '/api/scripts/2', undefined, token)).data.matchScore, baseline);
    assert.equal((await request('POST', '/api/play-records', draft, token)).status, 410);
  });

  await t.test('older notes and records remain accessible through pagination', async () => {
    const token = await register();
    for (let i = 0; i < 3; i += 1) {
      await request('POST', '/api/play-records', { scriptId: 1, rating: 4, playedAt: '2026-09-10' }, token);
      await request('POST', '/api/scripts/1/notes', { category: '疑点', content: 'Note ' + i }, token);
    }
    for (const url of ['/api/play-records', '/api/scripts/1/notes']) {
      const first = await request('GET', url + '?limit=2', undefined, token);
      const next = await request('GET', url + '?limit=2&offset=2', undefined, token);
      const rows = (res) => Array.isArray(res.data) ? res.data : res.data.records;
      assert.equal(rows(first).length, 2);
      assert.equal(first.pagination.total, 3);
      assert.equal(rows(next).length, 1);
      assert.equal(next.pagination.hasMore, false);
      assert(!rows(first).some((row) => row.id === rows(next)[0].id));
    }
  });

  await t.test('content provenance is explicit and occasion constraints filter before ranking', async () => {
    const token = await register();
    const scripts = await request('GET', '/api/scripts?maxDuration=120&players=4&catalog=1', undefined, token);
    assert(scripts.data.every((item) => item.durationMin <= 120 && item.minPlayers <= 4 && item.maxPlayers >= 4));
    const catalogue = await request('GET', '/api/scripts?catalog=1', undefined, token);
    assert.equal(catalogue.data.find((item) => item.id === 1).contentStatus, 'verified');
    assert.equal(catalogue.data.find((item) => item.id === 5).contentStatus, 'unverified');
    assert.equal(catalogue.data.find((item) => item.id === 5).sourceName, '示例资料');
    assert.equal((await request('POST', '/api/selection-context', { maxDuration: 120, players: 4, difficulty: '入门' }, token)).code, 0);
    const context = await request('GET', '/api/selection-context', undefined, token);
    assert.deepEqual(context.data, { maxDuration: 120, players: 4, difficulty: '入门' });
  });

  await t.test('comparison returns the same explainable signals as detail', async () => {
    const token = await register();
    await request('POST', '/api/taste-profile', { experience: ['硬核推理'], frequency: '高频' }, token);
    const comparison = await request('GET', '/api/scripts/compare?ids=1,2,3', undefined, token);
    assert.equal(comparison.code, 0);
    assert.equal(comparison.data.length, 3);
    assert(comparison.data.every((item) => Array.isArray(item.matchReasons) && Array.isArray(item.riskTags)));
    assert.equal((await request('GET', '/api/scripts/compare?ids=1,2,3,4', undefined, token)).status, 400);
  });

  await t.test('play sessions and attributed feedback update only confirmed content preference', async () => {
    const token = await register();
    const session = await request('POST', '/api/play-sessions', { scriptId: 2 }, token);
    assert.equal(session.code, 0);
    const note = await request('POST', '/api/scripts/2/notes', { sessionId: session.data.id, category: '疑点', content: '本次批次线索', clientRequestId: 'session-note-key-0001' }, token);
    assert.equal(note.code, 0);
    const notes = await request('GET', '/api/scripts/2/notes', undefined, token);
    assert.equal(notes.data.find((item) => item.id === note.data.id).sessionId, session.data.id);
    const record = await request('POST', '/api/play-records', {
      scriptId: 2, sessionId: session.data.id, rating: 1, contentRating: 5, roleRating: 1, dmRating: 1, tableRating: 1,
      feedbackConfirmed: true, playedAt: '2026-09-11', clientRequestId: 'feedback-key-000001',
    }, token);
    assert.equal(record.code, 0);
    assert.equal(record.data.record.sessionId, session.data.id);
    const before = await request('GET', '/api/scripts/2', undefined, token);
    assert(before.data.matchReasons.includes('你对这类体验的评分较高'));
    assert.equal((await request('PATCH', '/api/play-sessions/' + session.data.id, { status: 'completed' }, token)).code, 0);
    assert.equal((await request('GET', '/api/play-sessions', undefined, token)).data[0].status, 'completed');
  });

  await t.test('evidence coach accepts only owned notes and returns source ids', async () => {
    const token = await register();
    const other = await register();
    const one = await request('POST', '/api/scripts/1/notes', { category: '疑点', content: 'The clock stopped at ten', clientRequestId: 'evidence-note-0001' }, token);
    const two = await request('POST', '/api/scripts/1/notes', { category: '线索卡', content: 'A key was wet', clientRequestId: 'evidence-note-0002' }, token);
    const evidence = await request('POST', '/api/ai/evidence-coach', { scriptId: 1, noteIds: [one.data.id, two.data.id], question: '哪条线索需要核查？' }, token);
    assert.equal(evidence.code, 0);
    assert(evidence.data.coach.sources.every((source) => [one.data.id, two.data.id].includes(source.noteId)));
    assert.equal((await request('POST', '/api/ai/evidence-coach', { scriptId: 1, noteIds: [one.data.id], question: 'x' }, other)).status, 400);
    assert.equal((await request('POST', '/api/ai/evidence-coach', { scriptId: 1, noteIds: [999999], question: 'x' }, token)).status, 400);
    const session = await request('POST', '/api/play-sessions', { scriptId: 1 }, token);
    assert.equal((await request('POST', '/api/ai/evidence-coach', { scriptId: 1, sessionId: session.data.id, noteIds: [one.data.id], question: 'x' }, token)).status, 400);
  });
});
