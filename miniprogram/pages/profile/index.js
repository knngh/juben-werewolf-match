const api = require('../../utils/api');
const config = require('../../config');

const app = getApp();

function emptyProfile() {
  return {
    gameTypes: [],
    playStyles: [],
    preferredRoles: [],
    availability: [],
    budgetRange: '',
    playerCountRange: '',
    playModes: [],
    playFreq: '',
    city: '',
    intro: '',
  };
}

Page({
  data: {
    loggedIn: false,
    loading: true,
    saving: false,
    subscribeLoading: false,
    options: {
      gameTypes: [],
      playStyles: [],
      preferredRoles: [],
      availabilityOptions: [],
      budgetRanges: [],
      playerCountRanges: [],
      playModes: [],
    },
    optionRows: {
      gameTypes: [],
      playStyles: [],
      preferredRoles: [],
      availabilityOptions: [],
      playModes: [],
    },
    budgetPickerOptions: ['暂不填写'],
    playerCountPickerOptions: ['暂不填写'],
    pickerIndexes: {
      budgetRange: 0,
      playerCountRange: 0,
    },
    profile: emptyProfile(),
    completeness: {
      score: 0,
      missing: [],
    },
    missingText: '',
    notificationPrefs: {
      requestUpdates: true,
      reviewResults: true,
      sessionStatus: true,
    },
  },

  onShow() {
    this.load();
  },

  load() {
    const loggedIn = !!api.getToken();
    this.setData({ loggedIn });
    if (!loggedIn) {
      this.setData({ loading: false });
      return;
    }
    this.setData({ loading: true });
    Promise.all([
      api.get('/api/options'),
      api.get('/api/me'),
      api.get('/api/notification-preferences'),
    ]).then(([optionsRes, meRes, prefsRes]) => {
      const nextData = { loading: false };
      if (optionsRes.code === 0 && optionsRes.data) {
        const options = optionsRes.data;
        nextData.options = options;
        nextData.budgetPickerOptions = ['暂不填写'].concat(options.budgetRanges || []);
        nextData.playerCountPickerOptions = ['暂不填写'].concat(options.playerCountRanges || []);
      }
      if (meRes.code === 0 && meRes.data) {
        const profile = Object.assign(emptyProfile(), meRes.data.profile || {});
        const completeness = meRes.data.profileCompleteness || { score: 0, missing: [] };
        nextData.profile = profile;
        nextData.completeness = completeness;
        nextData.missingText = (completeness.missing || []).length
          ? '还差：' + completeness.missing.map((item) => item.label).join('、')
          : '';
        app.globalData.user = meRes.data;
      }
      if (prefsRes.code === 0 && prefsRes.data && prefsRes.data.wechatSubscribe) {
        nextData.notificationPrefs = prefsRes.data.wechatSubscribe;
      }
      this.setData(nextData);
      this.refreshDerivedState();
    });
  },

  refreshDerivedState() {
    const options = this.data.options;
    const profile = this.data.profile;
    const toRows = (items, selected) => (items || []).map((value) => ({
      value,
      active: (selected || []).includes(value),
    }));
    const budgetIndex = this.data.budgetPickerOptions.indexOf(profile.budgetRange);
    const playerIndex = this.data.playerCountPickerOptions.indexOf(profile.playerCountRange);
    this.setData({
      optionRows: {
        gameTypes: toRows(options.gameTypes, profile.gameTypes),
        playStyles: toRows(options.playStyles, profile.playStyles),
        preferredRoles: toRows(options.preferredRoles, profile.preferredRoles),
        availabilityOptions: toRows(options.availabilityOptions, profile.availability),
        playModes: toRows(options.playModes, profile.playModes),
      },
      pickerIndexes: {
        budgetRange: budgetIndex > 0 ? budgetIndex : 0,
        playerCountRange: playerIndex > 0 ? playerIndex : 0,
      },
    });
  },

  toggleChip(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.currentTarget.dataset.value;
    const current = this.data.profile[field] || [];
    const exists = current.includes(value);
    const next = exists ? current.filter((item) => item !== value) : current.concat(value);
    this.setData({
      ['profile.' + field]: next,
    });
    this.refreshDerivedState();
  },

  onBudgetChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      'profile.budgetRange': index === 0 ? '' : this.data.budgetPickerOptions[index],
    });
    this.refreshDerivedState();
  },

  onPlayerCountChange(event) {
    const index = Number(event.detail.value);
    this.setData({
      'profile.playerCountRange': index === 0 ? '' : this.data.playerCountPickerOptions[index],
    });
    this.refreshDerivedState();
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      ['profile.' + field]: event.detail.value,
    });
  },

  applyStarterProfile() {
    this.setData({
      profile: {
        gameTypes: ['桌游', '狼人杀'],
        playStyles: ['欢乐型', '社交型'],
        preferredRoles: ['无所谓'],
        availability: ['周五晚', '周末晚上'],
        budgetRange: '100-200',
        playerCountRange: '5-8人',
        playModes: ['线下'],
        playFreq: this.data.profile.playFreq || '每月 2-3 次',
        city: this.data.profile.city || '上海',
        intro: this.data.profile.intro || '新手友好，准时不鸽，想找稳定桌游搭子。',
      },
    });
    this.refreshDerivedState();
  },

  save() {
    this.setData({ saving: true });
    api.post('/api/profile', this.data.profile).then((res) => {
      this.setData({ saving: false });
      if (res.code === 0) {
        wx.showToast({ title: '已保存', icon: 'success' });
        this.load();
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
      }
    });
  },

  saveNotificationPreferences(payload) {
    const nextPrefs = Object.assign({}, this.data.notificationPrefs, payload);
    this.setData({ notificationPrefs: nextPrefs });
    return api.post('/api/notification-preferences', payload).then((res) => {
      if (res.code === 0 && res.data && res.data.wechatSubscribe) {
        this.setData({ notificationPrefs: res.data.wechatSubscribe });
      } else {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
        this.load();
      }
    });
  },

  onNotificationSwitch(event) {
    const field = event.currentTarget.dataset.field;
    this.saveNotificationPreferences({
      [field]: event.detail.value,
    });
  },

  requestWechatSubscribe() {
    const templateIds = config.subscribeTemplateIds || {};
    const mappings = [
      ['requestUpdates', templateIds.requestUpdates],
      ['reviewResults', templateIds.reviewResults],
      ['sessionStatus', templateIds.sessionStatus],
    ].filter((item) => item[1]);

    if (!mappings.length) {
      wx.showToast({ title: '订阅模板待配置', icon: 'none' });
      return;
    }
    if (!wx.requestSubscribeMessage) {
      wx.showToast({ title: '当前微信版本不支持订阅', icon: 'none' });
      return;
    }

    this.setData({ subscribeLoading: true });
    wx.requestSubscribeMessage({
      tmplIds: mappings.map((item) => item[1]),
      success: (result) => {
        const payload = {};
        mappings.forEach(([field, templateId]) => {
          payload[field] = result[templateId] === 'accept';
        });
        this.saveNotificationPreferences(payload).then(() => {
          wx.showToast({ title: '订阅设置已更新', icon: 'success' });
        });
      },
      fail: () => {
        wx.showToast({ title: '订阅请求失败', icon: 'none' });
      },
      complete: () => {
        this.setData({ subscribeLoading: false });
      },
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' });
  },

  goNotifications() {
    wx.switchTab({ url: '/pages/notifications/index' });
  },

  logout() {
    app.logout();
    this.setData({
      loggedIn: false,
      profile: emptyProfile(),
      completeness: { score: 0, missing: [] },
      missingText: '',
    });
    wx.showToast({ title: '已退出', icon: 'success' });
  },
});
