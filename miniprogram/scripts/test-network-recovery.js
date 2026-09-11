const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const unavailable = { code: 500, status: 0, message: 'Service unavailable', hint: 'Start the backend' };
const script = { id: 1, title: 'Test script', tags: [], highlights: [], warnings: [] };

function loadPage(name, get) {
  let page;
  const storage = { jwm_token: 'test-token' };
  const api = { get, getToken: () => storage.jwm_token || '', toQuery: () => '' };
  const wx = {
    getStorageSync: (key) => storage[key],
    removeStorageSync: (key) => { delete storage[key]; },
    showToast() {},
    redirectTo() {},
    navigateTo() {},
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'pages', name, 'index.js'), 'utf8'), {
    require: (id) => id.endsWith('/api') ? api : { loginUrlWithRedirect: (url) => url },
    Page: (definition) => { page = definition; },
    wx,
    setInterval,
    clearInterval,
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = (changes) => {
    Object.entries(changes).forEach(([key, value]) => {
      const fields = key.split('.');
      let target = page.data;
      fields.slice(0, -1).forEach((field) => { target = target[field]; });
      target[fields[fields.length - 1]] = value;
    });
  };
  return { page, api, storage };
}

function healthy(pathname) {
  if (pathname === '/api/scripts' || pathname.startsWith('/api/scripts?catalog=')) return Promise.resolve({ code: 0, data: [script] });
  if (pathname === '/api/play-records') return Promise.resolve({ code: 0, data: {
    records: [{ id: 1, scriptId: 1 }], summary: { total: 1, ratedCount: 1, averageRating: 5, typeCounts: [] },
  } });
  if (pathname === '/api/taste-profile') return Promise.resolve({ code: 0, data: { completedAt: '2026-09-07' } });
  return Promise.resolve({ code: 0, data: [] });
}

test('scripts: cancelling a saved item refreshes the saved collection', async () => {
  const { page, api } = loadPage('scripts', healthy);
  await page.load();
  page.setData({ 'filters.collection': 'saved', scripts: [{ ...script, saved: true }] });
  api.post = async () => ({ code: 0 });
  api.get = (url) => url === '/api/scripts' ? Promise.resolve({ code: 0, data: [], pagination: { total: 0, hasMore: false } }) : healthy(url);
  await page.toggleSave({ currentTarget: { dataset: { id: 1, saved: true } } });
  assert.equal(page.data.scripts.length, 0);
  assert.equal(page.data.savedCount, 0);
});

test('scripts: an old account save response cannot change the new account collection', async () => {
  const { page, api, storage } = loadPage('scripts', healthy);
  await page.load();
  let resolve;
  api.post = () => new Promise((done) => { resolve = done; });
  const saving = page.toggleSave({ currentTarget: { dataset: { id: 1, saved: true } } });
  storage.jwm_token = 'new-owner';
  await page.load();
  page.setData({ scripts: [{ ...script, saved: true }] });
  resolve({ code: 0 });
  await saving;
  assert.equal(page.data.scripts[0].saved, true);
});

test('detail: switching accounts discards an older private AI explanation', async () => {
  const { page, api, storage } = loadPage('script-detail', async () => ({ code: 0, data: script }));
  let resolve;
  api.post = (url) => url.startsWith('/api/ai/') ? new Promise((done) => { resolve = done; }) : Promise.resolve({ code: 0 });
  page.setData({ scriptId: 1 });
  await page.load(1);
  const explaining = page.explain();
  storage.jwm_token = 'new-owner';
  await page.onShow();
  resolve({ code: 0, data: { explanation: 'Private taste of the previous user' } });
  await explaining;
  assert.equal(page.data.explanation, '');
  assert.equal(page.data.explanationLoading, false);
});

for (const name of ['scripts', 'tools', 'archive']) {
  test(name + ': connection failure has a persistent error; retry restores data', async () => {
    const { page, api } = loadPage(name, () => Promise.resolve(unavailable));
    await page.load();
    assert.equal(page.data.loading, false);
    assert.equal(page.data.loadError, unavailable.message);
    assert.equal(page.data.loadErrorHint, unavailable.hint);
    api.get = healthy;
    await page.load();
    assert.equal(page.data.loading, false);
    assert.equal(page.data.loadError, '');
    assert.equal(page.data.loadErrorHint, '');
    assert.equal(name === 'archive' ? page.data.records.length : page.data.scripts.length, 1);
  });

  test(name + ': a rejected request releases loading and permits retry', async () => {
    const { page, api } = loadPage(name, () => Promise.reject(new Error('transport failed')));
    await page.load();
    assert.equal(page.data.loading, false);
    assert.ok(page.data.loadError);
    api.get = healthy;
    await page.load();
    assert.equal(page.data.loadError, '');
  });
}

test('scripts: a taste-profile failure does not reset a known profile or erase scripts', async () => {
  const { page, api } = loadPage('scripts', healthy);
  await page.load();
  api.get = (url) => url === '/api/taste-profile' ? Promise.resolve(unavailable) : healthy(url);
  await page.load();
  assert.equal(page.data.tasteCompleted, true);
  assert.equal(page.data.scripts.length, 1);
  assert.ok(page.data.loadError);
  api.get = () => Promise.resolve(unavailable);
  await page.load();
  assert.equal(page.data.scripts.length, 1);
  assert.equal(page.data.resultCountText, '1 本候选');
});

test('tools: switching back after failure retries without a pending script ID', async () => {
  const { page, api } = loadPage('tools', () => Promise.resolve(unavailable));
  await page.load();
  api.get = healthy;
  await page.onShow();
  assert.equal(page.data.selectedScript.id, 1);
  assert.equal(page.data.loadError, '');
});

test('tools: first onLoad/onShow issue only one load, and login return can load', async () => {
  const { page, api, storage } = loadPage('tools', healthy);
  let scriptRequests = 0;
  api.get = (url) => { if (url.startsWith('/api/scripts?catalog=')) scriptRequests += 1; return healthy(url); };
  page.onLoad({});
  await page.onShow();
  assert.equal(scriptRequests, 1);
  storage.jwm_token = '';
  await page.onShow();
  assert.equal(page.data.loggedIn, false);
  assert.equal(page.data.records.length, 0);
  storage.jwm_token = 'another-test-token';
  await page.onShow();
  assert.equal(page.data.loggedIn, true);
  assert.equal(scriptRequests, 2);
});

test('tools: retrying records preserves the active timer and note draft', async () => {
  const { page, api } = loadPage('tools', healthy);
  await page.load();
  page.setData({ timerSeconds: 250, timerText: '04:10', timerRunning: true, 'noteForm.content': 'Unsaved clue' });
  api.get = (url) => url === '/api/play-records' ? Promise.resolve(unavailable) : healthy(url);
  await page.load();
  assert.ok(page.data.loadError);
  assert.equal(page.data.records.length, 1);
  api.get = healthy;
  await page.load();
  assert.equal(page.data.timerSeconds, 250);
  assert.equal(page.data.timerRunning, true);
  assert.equal(page.data.noteForm.content, 'Unsaved clue');
});

test('scripts: an older failed request cannot overwrite a successful retry', async () => {
  let finish;
  const { page, api } = loadPage('scripts', (url) => url === '/api/scripts'
    ? new Promise((resolve) => { finish = resolve; }) : healthy(url));
  const older = page.load();
  api.get = healthy;
  await page.load();
  finish(unavailable);
  await older;
  assert.equal(page.data.loadError, '');
  assert.equal(page.data.scripts.length, 1);
});

function loadApi(baseUrl, request) {
  const context = {
    module: { exports: {} },
    require: () => ({ apiBaseUrl: baseUrl }),
    wx: { request, getStorageSync: () => '', removeStorageSync() {} },
    getCurrentPages: () => [],
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'utils/api.js'), 'utf8'), context);
  return context.module.exports;
}

test('API: local refusal includes backend startup guidance; production does not', async () => {
  const fail = (options) => options.fail({ errMsg: 'request:fail ERR_CONNECTION_REFUSED' });
  const local = await loadApi('http://127.0.0.1:3000', fail).get('/api/scripts');
  assert.equal(local.status, 0);
  assert.equal(local.errorType, 'network');
  assert.match(local.hint, /npm run dev/);
  const remote = await loadApi('https://api.example.com', fail).get('/api/scripts');
  assert.doesNotMatch(remote.hint || '', /npm run dev|127\.0\.0\.1/);
});

test('API: timeouts remain distinguishable and synchronous failures resolve', async () => {
  const timeout = await loadApi('http://127.0.0.1:3000', (options) => {
    assert.equal(options.timeout, 12000);
    options.fail({ errMsg: 'request:fail timeout' });
  }).get('/api/scripts');
  assert.equal(timeout.errorType, 'timeout');
  const failure = await loadApi('http://127.0.0.1:3000', () => { throw new Error('request failed'); }).get('/api/scripts');
  assert.equal(failure.status, 0);
});
