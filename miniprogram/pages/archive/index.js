const api = require('../../utils/api');
const navigation = require('../../utils/navigation');

Page({
  data: {
    loading: true,
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
      this.setData({ loggedIn: false, loading: false });
      return;
    }
    this.load();
  },

  load() {
    this.setData({ loggedIn: true, loading: true });
    return api.get('/api/play-records').then((res) => {
      if (res.code !== 0 || !res.data) {
        this.setData({ loading: false });
        wx.showToast({ title: res.message || '档案加载失败', icon: 'none' });
        return;
      }
      const summary = res.data.summary || {};
      const typeCounts = summary.typeCounts || [];
      const total = Number(summary.total) || 0;
      this.setData({
        loading: false,
        summary,
        records: res.data.records || [],
        topType: typeCounts.length ? typeCounts[0].gameType : '还没有偏好',
        typeRows: typeCounts.map((item) => Object.assign({}, item, {
          barWidth: total ? Math.max(8, Math.round((item.count / total) * 100)) : 0,
        })),
        averageRatingText: summary.averageRating ? String(summary.averageRating) : '--',
      });
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
    wx.navigateTo({ url: '/pages/tools/index' });
  },

  goScripts() {
    wx.switchTab({ url: '/pages/scripts/index' });
  },
});
