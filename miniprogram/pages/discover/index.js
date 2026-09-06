const api = require('../../utils/api');
const recommendation = require('../../utils/recommendation');

Page({
  data: {
    loggedIn: false,
    loading: true,
    list: [],
    needsProfile: false,
    missingText: '',
  },

  onShow() {
    this.load();
  },

  load() {
    const loggedIn = !!api.getToken();
    this.setData({ loggedIn });
    if (!loggedIn) {
      this.setData({ loading: false, list: [] });
      return Promise.resolve();
    }
    this.setData({ loading: true });
    return Promise.all([api.get('/api/me'), api.get('/api/discover')]).then(([meRes, listRes]) => {
      const next = { loading: false };
      if (meRes.code === 0 && meRes.data && meRes.data.profileCompleteness) {
        const completeness = meRes.data.profileCompleteness;
        next.needsProfile = completeness.score < 100 && (completeness.missing || []).length > 0;
        next.missingText = (completeness.missing || []).map((item) => item.label).join('、');
      }
      if (listRes.code === 0 && Array.isArray(listRes.data)) {
        next.list = listRes.data.map((item) => Object.assign(
          recommendation.enrichRecommendation(item),
          { initial: (item.nickname || '?').charAt(0) }
        ));
      } else if (listRes.code !== 401) {
        wx.showToast({ title: listRes.message || '加载失败', icon: 'none' });
      }
      this.setData(next);
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/index' });
  },

  pass(event) {
    const id = Number(event.currentTarget.dataset.id);
    this.setData({ list: this.data.list.filter((item) => item.id !== id) });
  },

  like(event) {
    const id = Number(event.currentTarget.dataset.id);
    api.post('/api/like/' + id, {}).then((res) => {
      if (res.code === 0) {
        wx.showToast({ title: res.data && res.data.matched ? '匹配成功' : '已喜欢', icon: 'success' });
        this.setData({ list: this.data.list.filter((item) => item.id !== id) });
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    });
  },

  block(event) {
    const id = Number(event.currentTarget.dataset.id);
    const name = event.currentTarget.dataset.name || '这个用户';
    wx.showModal({
      title: '确认拉黑',
      content: '拉黑后将不再互相推荐：' + name,
      success: (result) => {
        if (!result.confirm) return;
        api.post('/api/block/' + id, {}).then((res) => {
          if (res.code === 0) {
            this.setData({ list: this.data.list.filter((item) => item.id !== id) });
          } else {
            wx.showToast({ title: res.message || '操作失败', icon: 'none' });
          }
        });
      },
    });
  },
});
