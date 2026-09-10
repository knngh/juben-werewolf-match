const api = require('../../utils/api');
const navigation = require('../../utils/navigation');

const NOTE_CATEGORIES = ['人物关系', '线索卡', '疑点', '时间线'];
const DEFAULT_SEGMENTS = [
  { label: '暖场', minutes: 10 },
  { label: '第一幕', minutes: 45 },
  { label: '第二幕', minutes: 45 },
  { label: '复盘', minutes: 30 },
];

function today() {
  const date = new Date();
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

function formatTimer(seconds) {
  const value = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(value / 60);
  const rest = value % 60;
  return (minutes < 10 ? '0' : '') + minutes + ':' + (rest < 10 ? '0' : '') + rest;
}

function buildSegments(activeIndex, segments) {
  return segments.map((item, index) => Object.assign({}, item, {
    active: index === activeIndex,
    status: index < activeIndex ? '已完成' : index === activeIndex ? '进行中' : '待开始',
  }));
}

function activeSegmentLabel(index, segments) {
  return segments[index] ? segments[index].label : '';
}

function freshWorkspace() {
  return {
    activeTab: 'timer', aiLoading: false, aiPrep: null, aiCoach: null, aiRecap: null, coachQuestion: '',
    notes: [], noteCategory: NOTE_CATEGORIES[0], noteForm: { title: '', content: '' },
    recordForm: { role: '', rating: 0, note: '', playedAt: today() },
    savingNote: false, savingRecord: false,
    segments: buildSegments(0, DEFAULT_SEGMENTS), activeSegmentIndex: 0,
    timerSeconds: 600, timerText: '10:00', timerRunning: false, timerDeadline: 0,
    currentSegmentLabel: DEFAULT_SEGMENTS[0].label,
  };
}

Page({
  data: {
    ...freshWorkspace(),
    loading: true,
    loadError: '',
    loadErrorHint: '',
    loggedIn: false,
    scripts: [],
    scriptId: 0,
    selectedScript: null,
    noteCategories: NOTE_CATEGORIES,
    records: [],
    ratingOptions: [1, 2, 3, 4, 5],
  },

  onLoad(query) {
    this.pendingScriptId = Number(query.id) || 0;
  },

  onShow() {
    this.ensureOwner();
    if (!api.getToken()) {
      this.setData({ loggedIn: false, loading: false });
      return Promise.resolve();
    }
    this.resumeClock();
    const requestedScriptId = Number(wx.getStorageSync('jwm_tools_script_id')) || 0;
    if (requestedScriptId) {
      wx.removeStorageSync('jwm_tools_script_id');
      this.pendingScriptId = requestedScriptId;
    }
    if (requestedScriptId || !this.data.loggedIn || !this.data.selectedScript || this.data.loadError) {
      return this.load();
    }
    return this.loadPromise || Promise.resolve();
  },

  goLogin() {
    wx.navigateTo({ url: navigation.loginUrlWithRedirect('/pages/tools/index') });
  },

  onUnload() {
    this.persistWorkspace();
    this.detachClock();
    this.contextVersion = (this.contextVersion || 0) + 1;
    this.loadVersion = (this.loadVersion || 0) + 1;
  },

  onHide() {
    this.persistWorkspace();
    this.detachClock();
  },

  ensureOwner() {
    const token = api.getToken();
    if (this.ownerToken === token) {
      if (!this.ownerUserId && api.getUserId) this.ownerUserId = api.getUserId();
      return;
    }
    this.persistWorkspace();
    this.detachClock();
    this.ownerToken = token;
    this.ownerUserId = api.getUserId ? api.getUserId() : 0;
    this.contextVersion = (this.contextVersion || 0) + 1;
    this.loadVersion = (this.loadVersion || 0) + 1;
    this.loadPromise = null;
    this.setData({ ...freshWorkspace(), scripts: [], scriptId: 0, selectedScript: null, records: [],
      loggedIn: false, loadError: '', loadErrorHint: '' });
  },

  workspaceKey() {
    return this.ownerUserId && this.data.scriptId ? 'jwm_workspace_' + this.ownerUserId + '_' + this.data.scriptId : '';
  },

  persistWorkspace() {
    if (!this.ownerToken || !this.data.scriptId) return;
    const value = JSON.parse(JSON.stringify({
      segments: this.data.segments, activeSegmentIndex: this.data.activeSegmentIndex,
      timerSeconds: this.data.timerSeconds, timerRunning: this.data.timerRunning, timerDeadline: this.data.timerDeadline,
      noteForm: this.data.noteForm, noteCategory: this.data.noteCategory,
      recordForm: this.data.recordForm, coachQuestion: this.data.coachQuestion,
    }));
    this.workspaceCache = this.workspaceCache || {};
    this.workspaceCache[this.ownerToken + ':' + this.data.scriptId] = value;
    const key = this.workspaceKey();
    if (key && wx.setStorageSync) {
      try {
        wx.setStorageSync(key, value);
        wx.setStorageSync('jwm_workspace_last_' + this.ownerUserId, this.data.scriptId);
      } catch {
        wx.showToast({ title: '草稿未能保存在本机', icon: 'none' });
      }
    }
  },

  changeScript(selectedScript) {
    if (selectedScript && selectedScript.id === this.data.scriptId) return;
    this.stopTimer();
    this.persistWorkspace();
    this.contextVersion = (this.contextVersion || 0) + 1;
    this.setData({ ...freshWorkspace(), scriptId: selectedScript ? selectedScript.id : 0, selectedScript,
      loadError: '', loadErrorHint: '' });
    if (!selectedScript) return;
    const key = this.workspaceKey();
    let saved = this.workspaceCache && this.workspaceCache[this.ownerToken + ':' + selectedScript.id];
    if (!saved && key) {
      try { saved = wx.getStorageSync(key); } catch {}
    }
    if (!saved || typeof saved !== 'object') return;
    const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
    const index = Number.isInteger(saved.activeSegmentIndex) && saved.activeSegmentIndex >= 0 && saved.activeSegmentIndex < DEFAULT_SEGMENTS.length
      ? saved.activeSegmentIndex : 0;
    const segments = DEFAULT_SEGMENTS.map((item, i) => ({ ...item,
      minutes: Math.max(1, Math.min(180, Math.floor(Number(saved.segments && saved.segments[i] && saved.segments[i].minutes) || item.minutes))),
    }));
    const seconds = Math.max(0, Math.min(10800, Number(saved.timerSeconds) || 0));
    const deadline = Number(saved.timerDeadline);
    const timerRunning = saved.timerRunning === true && Number.isFinite(deadline) && deadline > 0 && deadline <= Date.now() + 10800000;
    const note = saved.noteForm || {};
    const record = saved.recordForm || {};
    this.setData({
      segments: buildSegments(index, segments), activeSegmentIndex: index, currentSegmentLabel: segments[index].label,
      timerSeconds: seconds, timerText: formatTimer(seconds), timerRunning, timerDeadline: timerRunning ? deadline : 0,
      noteForm: { title: text(note.title, 80), content: text(note.content, 1000) },
      noteCategory: NOTE_CATEGORIES.includes(saved.noteCategory) ? saved.noteCategory : NOTE_CATEGORIES[0],
      recordForm: { role: text(record.role, 80), rating: Math.max(0, Math.min(5, Math.floor(Number(record.rating) || 0))),
        note: text(record.note, 500), playedAt: /^\d{4}-\d{2}-\d{2}$/.test(record.playedAt || '') ? record.playedAt : today() },
      coachQuestion: text(saved.coachQuestion, 300),
    });
    this.resumeClock();
  },

  currentContext() {
    return { version: this.contextVersion, token: api.getToken(), scriptId: this.data.scriptId };
  },

  isCurrent(context) {
    return context.version === this.contextVersion && context.token === api.getToken() && context.scriptId === this.data.scriptId;
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.ensureOwner();
    if (this.loadPromise) return this.loadPromise;
    const token = api.getToken();
    if (!token) return this.onShow();
    this.setData({ loading: true, loggedIn: true });
    const loadVersion = this.loadVersion = (this.loadVersion || 0) + 1;
    const pending = Promise.all([
      api.get('/api/scripts'),
      api.get('/api/play-records'),
    ]).then(async ([scriptsRes, recordsRes]) => {
      if (api.getToken() !== token || loadVersion !== this.loadVersion) return;
      if (scriptsRes.code !== 0 || !Array.isArray(scriptsRes.data)) {
        this.setData({ loading: false, loadError: scriptsRes.message || '剧本加载失败', loadErrorHint: scriptsRes.hint || '' });
        return;
      }
      const scripts = scriptsRes.data.slice();
      const lastId = this.ownerUserId ? Number(wx.getStorageSync('jwm_workspace_last_' + this.ownerUserId)) : 0;
      const targetId = this.pendingScriptId || this.data.scriptId || (Number.isSafeInteger(lastId) && lastId > 0 ? lastId : 0) || (scripts[0] && scripts[0].id) || 0;
      let selectedScript = scripts.find((item) => item.id === targetId) || null;
      if (targetId && !selectedScript) {
        const detail = await api.get('/api/scripts/' + targetId);
        if (api.getToken() !== token || loadVersion !== this.loadVersion) return;
        if (detail.code !== 0 || !detail.data || detail.data.id !== targetId) {
          this.changeScript(null);
          this.setData({ loading: false, loadError: detail.message || '指定剧本暂时无法加载', loadErrorHint: detail.hint || '' });
          return;
        }
        selectedScript = detail.data;
        scripts.push(selectedScript);
      }
      this.changeScript(selectedScript);
      const recordsReady = recordsRes.code === 0 && recordsRes.data && Array.isArray(recordsRes.data.records);
      this.setData({
        loading: false,
        loadError: recordsReady ? '' : recordsRes.message || '打本记录暂未更新',
        loadErrorHint: recordsReady ? '' : recordsRes.hint || '',
        scripts,
        scriptId: selectedScript ? selectedScript.id : 0,
        selectedScript,
        records: recordsReady ? recordsRes.data.records : this.data.records,
      });
      this.pendingScriptId = 0;
      return this.loadNotes();
    }).catch(() => {
      if (api.getToken() !== token || loadVersion !== this.loadVersion) return;
      this.setData({ loading: false, loadError: '工具加载失败，请重试', loadErrorHint: '' });
    }).then(() => {
      if (this.loadPromise === pending) this.loadPromise = null;
    });
    this.loadPromise = pending;
    return pending;
  },

  onScriptPickerChange(event) {
    const index = Number(event.detail.value);
    const selectedScript = this.data.scripts[index];
    if (!selectedScript) return;
    this.changeScript(selectedScript);
    return this.loadNotes();
  },

  selectScript(event) {
    const id = Number(event.currentTarget.dataset.id);
    const selectedScript = this.data.scripts.find((item) => item.id === id);
    if (!selectedScript) return;
    this.changeScript(selectedScript);
    return this.loadNotes();
  },

  loadNotes() {
    if (!this.data.scriptId) return;
    const context = this.currentContext();
    return api.get('/api/scripts/' + this.data.scriptId + '/notes').then((res) => {
      if (!this.isCurrent(context)) return;
      if (res.code === 0 && Array.isArray(res.data)) this.setData({ notes: res.data });
      else this.setData({ loadError: res.message || '笔记暂未更新', loadErrorHint: res.hint || '' });
    }).catch(() => {
      if (this.isCurrent(context)) {
        this.setData({ loadError: '笔记加载失败，请重试', loadErrorHint: '' });
      }
    });
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab;
    this.setData({ activeTab });
  },

  onCoachQuestion(event) {
    this.setData({ coachQuestion: event.detail.value });
    this.persistWorkspace();
  },

  runAiRequest(endpoint, payload, field, successTitle) {
    if (this.data.aiLoading) return;
    if (!this.data.scriptId) {
      wx.showToast({ title: '请先选择剧本', icon: 'none' });
      return;
    }
    const context = this.currentContext();
    this.setData({ aiLoading: true });
    return api.post(endpoint, payload).then((res) => {
      if (!this.isCurrent(context)) return;
      this.setData({ aiLoading: false });
      if (res.code !== 0) {
        wx.showToast({ title: res.message || 'AI 暂时不可用', icon: 'none' });
        return;
      }
      this.setData({ [field]: res.data && res.data[field.replace('ai', '').toLowerCase()] || res.data });
      if (successTitle) wx.showToast({ title: successTitle, icon: 'success' });
    }).catch(() => {
      if (!this.isCurrent(context)) return;
      this.setData({ aiLoading: false });
      wx.showToast({ title: 'AI 请求失败，请重试', icon: 'none' });
    });
  },

  generatePlayPrep() {
    this.runAiRequest('/api/ai/play-prep', { scriptId: this.data.scriptId }, 'aiPrep', '准备清单已生成');
  },

  generateStuckCoach() {
    this.runAiRequest('/api/ai/stuck-coach', {
      scriptId: this.data.scriptId,
      question: this.data.coachQuestion,
    }, 'aiCoach', '卡点梳理已生成');
  },

  generatePlayRecap() {
    this.runAiRequest('/api/ai/play-recap', {
      scriptId: this.data.scriptId,
      role: this.data.recordForm.role,
      rating: this.data.recordForm.rating,
      note: this.data.recordForm.note,
    }, 'aiRecap', '复盘摘要已生成');
  },

  selectSegment(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (!Number.isInteger(index) || !this.data.segments[index]) return;
    this.stopTimer();
    this.setData({
      activeSegmentIndex: index,
      segments: buildSegments(index, this.data.segments),
      timerSeconds: this.data.segments[index].minutes * 60,
      timerText: formatTimer(this.data.segments[index].minutes * 60),
      currentSegmentLabel: activeSegmentLabel(index, this.data.segments),
    });
    this.persistWorkspace();
  },

  onSegmentMinutes(event) {
    const index = Number(event.currentTarget.dataset.index);
    const minutes = Math.max(1, Math.min(180, Number(event.detail.value) || 1));
    const segments = this.data.segments.map((item, itemIndex) => itemIndex === index
      ? Object.assign({}, item, { minutes })
      : item);
    const next = { segments };
    if (index === this.data.activeSegmentIndex && !this.data.timerRunning) {
      next.timerSeconds = minutes * 60;
      next.timerText = formatTimer(minutes * 60);
    }
    this.setData(next);
    this.persistWorkspace();
  },

  startTimer() {
    if (this.data.timerRunning) return;
    if (this.data.timerSeconds <= 0) this.resetTimer();
    this.setData({ timerRunning: true, timerDeadline: Date.now() + this.data.timerSeconds * 1000 });
    this.resumeClock();
    this.persistWorkspace();
  },

  toggleTimer() {
    if (this.data.timerRunning) this.stopTimer();
    else this.startTimer();
  },

  noop() {},

  detachClock() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  },

  resumeClock() {
    if (!this.data.timerRunning) return;
    this.tickTimer();
    this.detachClock();
    if (this.data.timerRunning) this.timerHandle = setInterval(() => this.tickTimer(), 1000);
  },

  stopTimer() {
    if (this.data.timerRunning && this.data.timerDeadline) this.tickTimer();
    this.detachClock();
    this.setData({ timerRunning: false, timerDeadline: 0 });
    this.persistWorkspace();
  },

  tickTimer() {
    if (!this.data.timerRunning || !this.data.timerDeadline) return;
    const seconds = Math.max(0, Math.ceil((this.data.timerDeadline - Date.now()) / 1000));
    if (seconds <= 0) {
      this.detachClock();
      this.setData({ timerSeconds: 0, timerText: '00:00', timerRunning: false, timerDeadline: 0 });
      this.persistWorkspace();
      wx.showToast({ title: '本幕时间到', icon: 'none' });
      return;
    }
    this.setData({ timerSeconds: seconds, timerText: formatTimer(seconds) });
  },

  resetTimer() {
    this.stopTimer();
    const segment = this.data.segments[this.data.activeSegmentIndex] || DEFAULT_SEGMENTS[0];
    this.setData({
      timerSeconds: segment.minutes * 60,
      timerText: formatTimer(segment.minutes * 60),
      segments: buildSegments(this.data.activeSegmentIndex, this.data.segments),
      currentSegmentLabel: activeSegmentLabel(this.data.activeSegmentIndex, this.data.segments),
    });
    this.persistWorkspace();
  },

  chooseNoteCategory(event) {
    this.setData({ noteCategory: event.currentTarget.dataset.category });
    this.persistWorkspace();
  },

  onNoteInput(event) {
    this.setData({ ['noteForm.' + event.currentTarget.dataset.field]: event.detail.value });
    this.persistWorkspace();
  },

  saveNote() {
    if (this.data.savingNote || !this.data.scriptId) return;
    if (!this.data.noteForm.content.trim()) {
      wx.showToast({ title: '先写下要记住的内容', icon: 'none' });
      return;
    }
    const context = this.currentContext();
    const draft = JSON.stringify(this.data.noteForm);
    this.setData({ savingNote: true });
    return api.post('/api/scripts/' + this.data.scriptId + '/notes', {
      category: this.data.noteCategory,
      title: this.data.noteForm.title,
      content: this.data.noteForm.content,
    }).then((res) => {
      if (!this.isCurrent(context)) return;
      this.setData({ savingNote: false });
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
        return;
      }
      if (JSON.stringify(this.data.noteForm) === draft) this.setData({ noteForm: { title: '', content: '' } });
      this.persistWorkspace();
      this.loadNotes();
      wx.showToast({ title: '笔记已保存', icon: 'success' });
    }).catch(() => {
      if (!this.isCurrent(context)) return;
      this.setData({ savingNote: false });
      wx.showToast({ title: '笔记保存失败，请重试', icon: 'none' });
    });
  },

  selectRating(event) {
    this.setData({ 'recordForm.rating': Number(event.currentTarget.dataset.rating) });
    this.persistWorkspace();
  },

  onRecordInput(event) {
    this.setData({ ['recordForm.' + event.currentTarget.dataset.field]: event.detail.value });
    this.persistWorkspace();
  },

  saveRecord() {
    if (this.data.savingRecord || !this.data.scriptId) return;
    if (!this.data.recordForm.rating) {
      wx.showToast({ title: '给这次体验打个分吧', icon: 'none' });
      return;
    }
    const context = this.currentContext();
    const draft = JSON.stringify(this.data.recordForm);
    this.setData({ savingRecord: true });
    return api.post('/api/play-records', Object.assign({}, this.data.recordForm, {
      scriptId: this.data.scriptId,
    })).then((res) => {
      if (!this.isCurrent(context)) return;
      this.setData({ savingRecord: false });
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
        return;
      }
      this.setData({ records: [res.data.record].concat(this.data.records) });
      if (JSON.stringify(this.data.recordForm) === draft) this.setData({ recordForm: freshWorkspace().recordForm });
      this.persistWorkspace();
      wx.showToast({ title: '已加入你的档案', icon: 'success' });
    }).catch(() => {
      if (!this.isCurrent(context)) return;
      this.setData({ savingRecord: false });
      wx.showToast({ title: '记录保存失败，请重试', icon: 'none' });
    });
  },
});
