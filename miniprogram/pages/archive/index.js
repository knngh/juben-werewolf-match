const api = require('../../utils/api');
const navigation = require('../../utils/navigation');

Page({
  data: {
    loading: true,
    loadError: '',
    loadErrorHint: '',
    loggedIn: false,
    summary: {
      total: 0,
      ratedCount: 0,
      averageRating: 0,
      typeCounts: [],
    },
    records: [],
    topType: '还没有偏好',
    typeRows: [],
    averageRatingText: '--',
  },

  onShow() {
    if (!api.getToken()) {
      this.clearOwner('');
      this.setData({ loggedIn: false, loading: false });
      return;
    }
    return this.load();
  },

  clearOwner(token) {
    if (this.ownerToken === token) return;
    this.ownerToken = token;
    this.loadVersion = (this.loadVersion || 0) + 1;
    this.setData({ records: [], summary: { total: 0, ratedCount: 0, averageRating: 0, typeCounts: [] },
      typeRows: [], topType: '还没有偏好', averageRatingText: '--', loadError: '', loadErrorHint: '' });
  },

  load() {
    const token = api.getToken();
    this.clearOwner(token);
    const loadVersion = this.loadVersion = (this.loadVersion || 0) + 1;
    this.setData({ loggedIn: true, loading: true });
    return api.get('/api/play-records').then((res) => {
      if (token !== api.getToken() || loadVersion !== this.loadVersion) return;
      if (res.code !== 0 || !res.data) {
        this.setData({ loading: false, loadError: res.message || '档案加载失败', loadErrorHint: res.hint || '' });
        return;
      }
      const summary = res.data.summary || {};
      const typeCounts = summary.typeCounts || [];
      const total = Number(summary.total) || 0;
      this.setData({
        loading: false,
        loadError: '',
        loadErrorHint: '',
        summary,
        records: res.data.records || [],
        topType: typeCounts.length ? typeCounts[0].gameType : '还没有偏好',
        typeRows: typeCounts.map((item) => Object.assign({}, item, {
          barWidth: total ? Math.max(8, Math.round((item.count / total) * 100)) : 0,
        })),
        averageRatingText: summary.averageRating ? String(summary.averageRating) : '--',
      });
    }).catch(() => {
      if (token !== api.getToken() || loadVersion !== this.loadVersion) return;
      this.setData({ loading: false, loadError: '档案加载失败，请重试', loadErrorHint: '' });
    });
  },

  goLogin() {
    wx.navigateTo({ url: navigation.loginUrlWithRedirect('/pages/archive/index') });
  },

  goTools() {
    if (!api.getToken()) {
      this.goLogin();
      return;
    }
    wx.switchTab({ url: '/pages/tools/index' });
  },

  goScripts() {
    wx.switchTab({ url: '/pages/scripts/index' });
  },
});
