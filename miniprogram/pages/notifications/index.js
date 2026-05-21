const api = require('../../utils/api');

Page({
  data: {
    loggedIn: false,
    loading: true,
    notifications: [],
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    const loggedIn = !!api.getToken();
    this.setData({ loggedIn });
    if (!loggedIn) {
      this.setData({ loading: false, notifications: [] });
      return Promise.resolve();
    }
    this.setData({ loading: true });
    return api.get('/api/notifications').then((res) => {
      this.setData({ loading: false });
      if (res.code === 0 && Array.isArray(res.data)) {
        this.setData({ notifications: res.data });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' });
  },

  readAll() {
    api.patch('/api/notifications/read-all', {}).then((res) => {
      if (res.code === 0) {
        this.load();
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    });
  },

  openNotice(event) {
    const id = event.currentTarget.dataset.id;
    const sessionId = event.currentTarget.dataset.sessionId;
    api.patch('/api/notifications/' + id + '/read', {}).then(() => {
      if (sessionId) {
        wx.navigateTo({ url: '/pages/session-detail/index?id=' + sessionId });
      } else {
        this.load();
      }
    });
  },
});
