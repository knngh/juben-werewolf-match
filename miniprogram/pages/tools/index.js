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
  return new Date().toISOString().slice(0, 10);
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

Page({
  data: {
    loading: true,
    loggedIn: false,
    scripts: [],
    scriptId: 0,
    selectedScript: null,
    activeTab: 'timer',
    aiLoading: false,
    aiPrep: null,
    aiCoach: null,
    aiRecap: null,
    coachQuestion: '',
    noteCategories: NOTE_CATEGORIES,
    noteCategory: NOTE_CATEGORIES[0],
    notes: [],
    records: [],
    segments: buildSegments(0, DEFAULT_SEGMENTS),
    activeSegmentIndex: 0,
    timerSeconds: DEFAULT_SEGMENTS[0].minutes * 60,
    timerText: formatTimer(DEFAULT_SEGMENTS[0].minutes * 60),
    timerRunning: false,
    noteForm: {
      title: '',
      content: '',
    },
    recordForm: {
      role: '',
      rating: 0,
      note: '',
      playedAt: today(),
    },
    savingNote: false,
    savingRecord: false,
    ratingOptions: [1, 2, 3, 4, 5],
    currentSegmentLabel: DEFAULT_SEGMENTS[0].label,
  },

  onLoad(query) {
    if (!api.getToken()) {
      wx.redirectTo({ url: navigation.loginUrlWithRedirect('/pages/tools/index' + (query.id ? '?id=' + query.id : '')) });
      return;
    }
    this.pendingScriptId = Number(query.id) || 0;
    this.load();
  },

  onShow() {
    if (!api.getToken()) return;
    const requestedScriptId = Number(wx.getStorageSync('jwm_tools_script_id')) || 0;
    if (!requestedScriptId) return;
    wx.removeStorageSync('jwm_tools_script_id');
    this.pendingScriptId = requestedScriptId;
    if (this.data.scripts.length) {
      const selectedScript = this.data.scripts.find((item) => item.id === requestedScriptId);
      if (selectedScript) {
        this.stopTimer();
        this.setData({ scriptId: selectedScript.id, selectedScript });
        this.loadNotes();
        this.resetTimer();
        this.pendingScriptId = 0;
        return;
      }
    }
    this.load();
  },

  onUnload() {
    this.stopTimer();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    this.setData({ loading: true, loggedIn: !!api.getToken() });
    return Promise.all([
      api.get('/api/scripts'),
      api.get('/api/play-records'),
    ]).then(([scriptsRes, recordsRes]) => {
      if (scriptsRes.code !== 0 || !Array.isArray(scriptsRes.data)) {
        this.setData({ loading: false });
        wx.showToast({ title: scriptsRes.message || '剧本加载失败', icon: 'none' });
        return;
      }
      const scripts = scriptsRes.data;
      const targetId = this.pendingScriptId || this.data.scriptId || (scripts[0] && scripts[0].id) || 0;
      const selectedScript = scripts.find((item) => item.id === targetId) || scripts[0] || null;
      this.setData({
        loading: false,
        scripts,
        scriptId: selectedScript ? selectedScript.id : 0,
        selectedScript,
        records: recordsRes.code === 0 && recordsRes.data ? recordsRes.data.records || [] : [],
      });
      this.pendingScriptId = 0;
      this.loadNotes();
      this.resetTimer();
    });
  },

  onScriptPickerChange(event) {
    const index = Number(event.detail.value);
    const selectedScript = this.data.scripts[index];
    if (!selectedScript) return;
    this.stopTimer();
    this.setData({ scriptId: selectedScript.id, selectedScript });
    this.loadNotes();
    this.resetTimer();
  },

  selectScript(event) {
    const id = Number(event.currentTarget.dataset.id);
    const selectedScript = this.data.scripts.find((item) => item.id === id);
    if (!selectedScript) return;
    this.stopTimer();
    this.setData({ scriptId: id, selectedScript });
    this.loadNotes();
    this.resetTimer();
  },

  loadNotes() {
    if (!this.data.scriptId) return;
    api.get('/api/scripts/' + this.data.scriptId + '/notes').then((res) => {
      if (res.code === 0) this.setData({ notes: res.data || [] });
    });
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab;
    this.setData({ activeTab });
  },

  onCoachQuestion(event) {
    this.setData({ coachQuestion: event.detail.value });
  },

  runAiRequest(endpoint, payload, field, successTitle) {
    if (!this.data.scriptId) {
      wx.showToast({ title: '请先选择剧本', icon: 'none' });
      return;
    }
    this.setData({ aiLoading: true });
    api.post(endpoint, payload).then((res) => {
      this.setData({ aiLoading: false });
      if (res.code !== 0) {
        wx.showToast({ title: res.message || 'AI 暂时不可用', icon: 'none' });
        return;
      }
      this.setData({ [field]: res.data && res.data[field.replace('ai', '').toLowerCase()] || res.data });
      if (successTitle) wx.showToast({ title: successTitle, icon: 'success' });
    });
  },

  generatePlayPrep() {
    this.runAiRequest('/api/ai/play-prep', { scriptId: this.data.scriptId }, 'aiPrep', '准备清单已生成');
  },

  generateStuckCoach() {
    this.runAiRequest('/api/ai/stuck-coach', {
      scriptId: this.data.scriptId,
      question: this.data.coachQuestion,
      notes: this.data.notes,
    }, 'aiCoach', '卡点梳理已生成');
  },

  generatePlayRecap() {
    this.runAiRequest('/api/ai/play-recap', {
      scriptId: this.data.scriptId,
      role: this.data.recordForm.role,
      rating: this.data.recordForm.rating,
      note: this.data.recordForm.note,
      notes: this.data.notes,
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
  },

  startTimer() {
    if (this.data.timerRunning) return;
    if (this.data.timerSeconds <= 0) this.resetTimer();
    this.setData({ timerRunning: true });
    this.timerHandle = setInterval(() => this.tickTimer(), 1000);
  },

  toggleTimer() {
    if (this.data.timerRunning) this.stopTimer();
    else this.startTimer();
  },

  noop() {},

  stopTimer() {
    if (this.timerHandle) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.data.timerRunning) this.setData({ timerRunning: false });
  },

  tickTimer() {
    const seconds = this.data.timerSeconds - 1;
    if (seconds <= 0) {
      this.stopTimer();
      this.setData({ timerSeconds: 0, timerText: '00:00' });
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
  },

  chooseNoteCategory(event) {
    this.setData({ noteCategory: event.currentTarget.dataset.category });
  },

  onNoteInput(event) {
    this.setData({ ['noteForm.' + event.currentTarget.dataset.field]: event.detail.value });
  },

  saveNote() {
    if (!this.data.noteForm.content.trim()) {
      wx.showToast({ title: '先写下要记住的内容', icon: 'none' });
      return;
    }
    this.setData({ savingNote: true });
    api.post('/api/scripts/' + this.data.scriptId + '/notes', {
      category: this.data.noteCategory,
      title: this.data.noteForm.title,
      content: this.data.noteForm.content,
    }).then((res) => {
      this.setData({ savingNote: false });
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
        return;
      }
      this.setData({ noteForm: { title: '', content: '' } });
      this.loadNotes();
      wx.showToast({ title: '笔记已保存', icon: 'success' });
    });
  },

  selectRating(event) {
    this.setData({ 'recordForm.rating': Number(event.currentTarget.dataset.rating) });
  },

  onRecordInput(event) {
    this.setData({ ['recordForm.' + event.currentTarget.dataset.field]: event.detail.value });
  },

  saveRecord() {
    if (!this.data.recordForm.rating) {
      wx.showToast({ title: '给这次体验打个分吧', icon: 'none' });
      return;
    }
    this.setData({ savingRecord: true });
    api.post('/api/play-records', Object.assign({}, this.data.recordForm, {
      scriptId: this.data.scriptId,
    })).then((res) => {
      this.setData({ savingRecord: false });
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
        return;
      }
      this.setData({ records: [res.data.record].concat(this.data.records) });
      wx.showToast({ title: '已加入你的档案', icon: 'success' });
    });
  },
});
