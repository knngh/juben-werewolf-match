const api = require('../../utils/api');
const format = require('../../utils/format');

const app = getApp();

function todayText() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

Page({
  data: {
    loading: false,
    submitting: false,
    geoSearching: false,
    aiGenerating: false,
    isEdit: false,
    editId: '',
    geoResults: [],
    geoMessage: '',
    selectedLocationText: '',
    tagText: '',
    aiPrompt: '',
    aiCapabilities: {
      sessionDraft: false,
    },
    approvedMinimum: 1,
    options: {
      gameTypes: [],
      playModes: ['线下'],
      budgetRanges: [],
    },
    budgetPickerOptions: ['看局而定'],
    pickerIndexes: {
      gameType: 0,
      playMode: 0,
      budgetRange: 0,
    },
    form: {
      gameType: '',
      title: '',
      city: '',
      area: '',
      address: '',
      locationLng: '',
      locationLat: '',
      playDate: '',
      playTime: '19:30',
      playMode: '线下',
      budgetRange: '',
      minPlayers: '2',
      maxPlayers: '6',
      currentPlayers: '1',
      note: '',
      contactNote: '',
    },
  },

  onLoad(query) {
    if (query && query.id) {
      this.setData({
        isEdit: true,
        editId: query.id,
      });
    }
    this.ensureLogin();
    this.loadOptions();
    this.loadAiCapabilities();
  },

  onShow() {
    if (!api.getToken()) return;
    if (this.data.isEdit) {
      this.loadSession();
    } else if (!this.data.form.playDate) {
      this.setData({ 'form.playDate': todayText() });
    }
  },

  ensureLogin() {
    if (!api.getToken()) {
      wx.navigateTo({ url: '/pages/login/index' });
      return false;
    }
    return true;
  },

  loadOptions() {
    api.get('/api/options').then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({
          options: {
            gameTypes: res.data.gameTypes || [],
            playModes: res.data.playModes || ['线下'],
            budgetRanges: res.data.budgetRanges || [],
          },
          budgetPickerOptions: ['看局而定'].concat(res.data.budgetRanges || []),
        });
      }
    });
  },

  loadAiCapabilities() {
    if (!api.getToken()) return;
    api.get('/api/ai/capabilities').then((res) => {
      if (res.code === 0 && res.data && res.data.features) {
        this.setData({
          'aiCapabilities.sessionDraft': !!res.data.features.sessionDraft,
        });
      }
    });
  },

  loadSession() {
    this.setData({ loading: true });
    api.get('/api/sessions/' + this.data.editId).then((res) => {
      this.setData({ loading: false });
      if (res.code !== 0 || !res.data) {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        return;
      }
      const session = format.enrichSession(res.data);
      const currentUserId = app.globalData.user && (app.globalData.user.id || app.globalData.user.userId);
      if (session.creatorUserId !== currentUserId) {
        wx.showToast({ title: '只能编辑自己发布的局', icon: 'none' });
        wx.navigateBack();
        return;
      }
      this.setData({
        form: {
          gameType: session.gameType || '',
          title: session.title || '',
          city: session.city || '',
          area: session.area || '',
          address: session.address || '',
          locationLng: session.location ? String(session.location.lng) : '',
          locationLat: session.location ? String(session.location.lat) : '',
          playDate: session.playDate || '',
          playTime: session.playTime || '19:30',
          playMode: session.playMode || '线下',
          budgetRange: session.budgetRange || '',
          minPlayers: String(session.minPlayers || 2),
          maxPlayers: String(session.maxPlayers || 6),
          currentPlayers: String(session.currentPlayers || 1),
          note: session.note || '',
          contactNote: session.contactNote || '',
        },
        tagText: (session.tags || []).join(', '),
        approvedMinimum: ((session.requestCounts && session.requestCounts.approved) || 0) + 1,
        selectedLocationText: session.location ? '已选坐标：' + session.location.lng + ', ' + session.location.lat : '',
      });
    });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      ['form.' + field]: event.detail.value,
    });
  },

  onLocationInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      ['form.' + field]: event.detail.value,
      'form.locationLng': '',
      'form.locationLat': '',
      selectedLocationText: '',
      geoMessage: '',
    });
  },

  onTagInput(event) {
    this.setData({ tagText: event.detail.value });
  },

  onAiPromptInput(event) {
    this.setData({ aiPrompt: event.detail.value });
  },

  onValuePicker(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      ['form.' + field]: event.detail.value,
    });
  },

  onPickerChange(event) {
    const field = event.currentTarget.dataset.field;
    const listName = event.currentTarget.dataset.list;
    const index = Number(event.detail.value);
    const value = this.data.options[listName][index] || '';
    this.setData({
      ['pickerIndexes.' + field]: index,
      ['form.' + field]: value,
    });
  },

  onBudgetPicker(event) {
    const index = Number(event.detail.value);
    const value = index === 0 ? '' : this.data.budgetPickerOptions[index];
    this.setData({
      'pickerIndexes.budgetRange': index,
      'form.budgetRange': value,
    });
  },

  searchPlaces() {
    if (!this.ensureLogin()) return;
    const keyword = this.data.form.address || this.data.form.area || this.data.form.city;
    if (!keyword) {
      this.setData({ geoMessage: '先输入城市、区域或地点关键词' });
      return;
    }
    const query = api.toQuery({
      keyword,
      city: this.data.form.city,
    });
    this.setData({
      geoSearching: true,
      geoResults: [],
      geoMessage: '',
    });
    api.get('/api/geo/search' + query).then((res) => {
      const list = Array.isArray(res.data) ? res.data.map((item, index) => Object.assign({ key: index + '-' + item.lng + '-' + item.lat }, item)) : [];
      this.setData({
        geoSearching: false,
        geoResults: list,
        geoMessage: res.code === 0 ? (list.length ? '' : '没有找到地点，换个关键词试试') : (res.message || '地点搜索失败'),
      });
    });
  },

  selectPlace(event) {
    const place = this.data.geoResults[event.currentTarget.dataset.index];
    if (!place) return;
    this.setData({
      'form.city': place.city || this.data.form.city,
      'form.area': place.area || this.data.form.area,
      'form.address': place.address || place.name || this.data.form.address,
      'form.locationLng': String(place.lng),
      'form.locationLat': String(place.lat),
      geoResults: [],
      geoMessage: '',
      selectedLocationText: '已选：' + place.name,
    });
  },

  applyAiDraft(draft) {
    const current = this.data.form;
    const nextForm = Object.assign({}, current, {
      gameType: draft.gameType || current.gameType,
      title: draft.title || current.title,
      city: draft.city || current.city,
      area: draft.area || current.area,
      address: draft.address || current.address,
      playDate: draft.playDate || current.playDate,
      playTime: draft.playTime || current.playTime,
      playMode: draft.playMode || current.playMode,
      budgetRange: draft.budgetRange === '看局而定' ? '' : (draft.budgetRange || current.budgetRange),
      minPlayers: draft.minPlayers ? String(draft.minPlayers) : current.minPlayers,
      maxPlayers: draft.maxPlayers ? String(draft.maxPlayers) : current.maxPlayers,
      currentPlayers: draft.currentPlayers ? String(draft.currentPlayers) : current.currentPlayers,
      note: draft.note || current.note,
      contactNote: draft.contactNote || current.contactNote,
    });
    this.setData({
      form: nextForm,
      tagText: Array.isArray(draft.tags) ? draft.tags.join(', ') : this.data.tagText,
    });
  },

  generateAiDraft() {
    if (!this.ensureLogin()) return;
    const prompt = this.data.aiPrompt.trim();
    if (!prompt) {
      wx.showToast({ title: '先描述想组的局', icon: 'none' });
      return;
    }
    this.setData({ aiGenerating: true });
    api.post('/api/ai/session-draft', { prompt }).then((res) => {
      this.setData({ aiGenerating: false });
      if (res.code === 0 && res.data && res.data.draft) {
        this.applyAiDraft(res.data.draft);
        wx.showToast({ title: '已生成草稿', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || 'AI 暂不可用', icon: 'none' });
      }
    });
  },

  validate() {
    const form = this.data.form;
    const min = Number(form.minPlayers);
    const max = Number(form.maxPlayers);
    const current = Number(form.currentPlayers);
    if (!form.gameType) return '请选择类型';
    if (!form.title.trim()) return '请填写标题';
    if (!form.city.trim()) return '请填写城市';
    if (!form.playDate || !form.playTime) return '请选择日期和时间';
    if (!Number.isInteger(min) || min < 2) return '最低人数至少 2 人';
    if (!Number.isInteger(max) || max < 2) return '目标人数至少 2 人';
    if (min > max) return '最低人数不能大于目标人数';
    if (!Number.isInteger(current) || current < 1) return '已有人数至少 1 人';
    if (current > max) return '已有人数不能大于目标人数';
    if (current < this.data.approvedMinimum) return '已有人数不能小于已通过人数';
    return '';
  },

  submit() {
    if (!this.ensureLogin()) return;
    const error = this.validate();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    const form = this.data.form;
    const payload = Object.assign({}, form, {
      minPlayers: Number(form.minPlayers),
      maxPlayers: Number(form.maxPlayers),
      currentPlayers: Number(form.currentPlayers),
      tags: this.data.tagText.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean),
    });
    this.setData({ submitting: true });
    const request = this.data.isEdit
      ? api.patch('/api/sessions/' + this.data.editId, payload)
      : api.post('/api/sessions', payload);

    request.then((res) => {
      this.setData({ submitting: false });
      if (res.code === 0 && res.data) {
        wx.showToast({ title: this.data.isEdit ? '已保存' : '已发布', icon: 'success' });
        wx.navigateTo({ url: '/pages/session-detail/index?id=' + res.data.id });
      } else {
        wx.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    });
  },
});
