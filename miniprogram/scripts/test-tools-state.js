const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const scripts = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

function harness(name = 'tools', storage = { jwm_token: 'user-a-token', jwm_user_id: 1 }, clock = { now: 1800000000000 }) {
  let page;
  const intervals = new Map();
  let nextInterval = 0;
  const requests = [];
  const api = {
    getToken: () => storage.jwm_token || '',
    getUserId: () => storage.jwm_user_id || 0,
    get: async (url) => {
      if (url.includes('/notes')) return { code: 0, data: [{ id: 1, content: 'A saved clue' }] };
      if (url === '/api/play-records') return { code: 0, data: { records: [], summary: {} } };
      if (/^\/api\/scripts\/\d+$/.test(url)) return { code: 0, data: { id: Number(url.split('/').pop()), title: 'Direct' } };
      return { code: 0, data: scripts, pagination: { hasMore: false } };
    },
    post: async (url, data) => { requests.push({ url, data }); return { code: 0, data: { id: requests.length, record: { id: requests.length } } }; },
  };
  const wx = {
    getStorageSync: (key) => storage[key],
    setStorageSync: (key, value) => { storage[key] = JSON.parse(JSON.stringify(value)); },
    removeStorageSync: (key) => { delete storage[key]; },
    showToast() {}, navigateTo() {}, stopPullDownRefresh() {},
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'pages', name, 'index.js'), 'utf8'), {
    require: (id) => id.endsWith('/api') ? api : { loginUrlWithRedirect: (url) => url },
    Page: (definition) => { page = definition; }, wx, Date: ClockDate,
    setInterval: (fn) => { const id = ++nextInterval; intervals.set(id, fn); return id; },
    clearInterval: (id) => intervals.delete(id),
  });
  page.data = JSON.parse(JSON.stringify(page.data));
  page.setData = (updates) => {
    for (const [key, value] of Object.entries(updates)) {
      const fields = key.split('.');
      let target = page.data;
      for (const field of fields.slice(0, -1)) target = target[field];
      target[fields.at(-1)] = value;
    }
  };
  return { page, api, storage, clock, requests, intervals };
}

test('changing scripts isolates drafts and restores each script draft on return', async () => {
  const { page } = harness();
  await page.load();
  page.setData({ 'noteForm.content': 'A draft', 'recordForm.role': 'A role', aiPrep: { summary: 'A prep' } });
  await page.onScriptPickerChange({ detail: { value: 1 } });
  assert.equal(page.data.noteForm.content, '');
  assert.equal(page.data.recordForm.role, '');
  assert.equal(page.data.aiPrep, null);
  await page.onScriptPickerChange({ detail: { value: 0 } });
  assert.equal(page.data.noteForm.content, 'A draft');
  assert.equal(page.data.recordForm.role, 'A role');
});

test('an older AI response cannot appear under the new script', async () => {
  const { page, api } = harness();
  await page.load();
  const old = deferred();
  api.post = () => old.promise;
  page.generatePlayPrep();
  await page.onScriptPickerChange({ detail: { value: 1 } });
  old.resolve({ code: 0, data: { prep: { summary: 'A preparation' } } });
  await flush();
  assert.equal(page.data.aiPrep, null);
  assert.equal(page.data.aiLoading, false);
});

test('a failed new-script notes load does not keep the previous script notes', async () => {
  const { page, api } = harness();
  await page.load();
  assert.equal(page.data.notes.length, 1);
  api.get = async () => ({ code: 500, message: 'offline' });
  await page.onScriptPickerChange({ detail: { value: 1 } });
  assert.equal(page.data.notes.length, 0);
  assert.ok(page.data.loadError);
});

test('an older note save does not erase a new script draft', async () => {
  const { page, api } = harness();
  await page.load();
  const old = deferred();
  api.post = () => old.promise;
  page.setData({ 'noteForm.content': 'A draft' });
  page.saveNote();
  await page.onScriptPickerChange({ detail: { value: 1 } });
  page.setData({ 'noteForm.content': 'B draft' });
  old.resolve({ code: 0, data: { id: 9 } });
  await flush();
  assert.equal(page.data.noteForm.content, 'B draft');
});

test('repeated taps do not submit duplicate notes, records or AI requests', async () => {
  const { page, api } = harness();
  await page.load();
  let calls = 0;
  api.post = () => { calls += 1; return new Promise(() => {}); };
  page.setData({ 'noteForm.content': 'A draft', 'recordForm.rating': 4 });
  page.saveNote(); page.saveNote();
  page.saveRecord(); page.saveRecord();
  page.generatePlayPrep(); page.generatePlayPrep();
  assert.equal(calls, 3);
});

test('a delayed timer callback accounts for actual elapsed time', async () => {
  const { page, clock } = harness();
  await page.load();
  page.startTimer();
  clock.now += 300000;
  page.tickTimer();
  assert.equal(page.data.timerSeconds, 300);
  page.stopTimer();
  clock.now += 120000;
  page.startTimer();
  clock.now += 10000;
  page.tickTimer();
  assert.equal(page.data.timerSeconds, 290);
});

test('reopening the page restores a running timer and the draft for the same user', async () => {
  const first = harness();
  await first.page.load();
  first.page.setData({ 'noteForm.content': 'Persistent clue' });
  first.page.startTimer();
  first.page.onUnload();
  first.clock.now += 120000;
  const second = harness('tools', first.storage, first.clock);
  await second.page.load();
  assert.equal(second.page.data.noteForm.content, 'Persistent clue');
  assert.equal(second.page.data.timerSeconds, 480);
  assert.equal(second.page.data.timerRunning, true);
});

test('switching accounts without an intermediate logout never keeps the old workspace', async () => {
  const { page, storage, api } = harness();
  await page.load();
  page.setData({ 'noteForm.content': 'Private A clue', records: [{ id: 1, note: 'A record' }] });
  storage.jwm_token = 'user-b-token'; storage.jwm_user_id = 2;
  api.get = async () => ({ code: 500, message: 'offline' });
  await page.onShow();
  assert.equal(page.data.noteForm.content, '');
  assert.equal(page.data.records.length, 0);
});

test('reopening tools restores the last selected script', async () => {
  const first = harness();
  await first.page.load();
  await first.page.onScriptPickerChange({ detail: { value: 1 } });
  first.page.onUnload();
  const second = harness('tools', first.storage, first.clock);
  await second.page.load();
  assert.equal(second.page.data.scriptId, 2);
});

test('explicit script navigation fetches the requested script when absent from the list', async () => {
  const { page } = harness();
  page.onLoad({ id: 99 });
  await page.onShow();
  assert.equal(page.data.scriptId, 99);
  assert.equal(page.data.selectedScript.id, 99);
});

test('13 saved notes remain usable by the AI coach', async () => {
  const { page, requests } = harness();
  await page.load();
  page.setData({ notes: Array.from({ length: 13 }, (_, i) => ({ id: i + 1, content: 'clue' })) });
  page.generateStuckCoach();
  assert.ok(!requests[0].data.notes || requests[0].data.notes.length <= 12);
});

test('archive clears old-user records before loading the new account', async () => {
  const { page, api, storage } = harness('archive');
  await page.load();
  page.setData({ records: [{ id: 1, note: 'Private A record' }] });
  storage.jwm_token = 'user-b-token';
  api.get = async () => ({ code: 500, message: 'offline' });
  await page.onShow();
  await flush();
  assert.equal(page.data.records.length, 0);
});
