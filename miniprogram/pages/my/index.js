const api = require('../../utils/api');
const format = require('../../utils/format');

Page({
  data: {
    loggedIn: false,
    loading: true,
    created: [],
    requested: [],
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
      this.setData({ loading: false, created: [], requested: [] });
      return Promise.resolve();
    }

    this.setData({ loading: true });
    return api.get('/api/my/sessions').then((res) => {
      this.setData({ loading: false });
      if (res.code === 0 && res.data) {
        this.setData({
          created: (res.data.created || []).map(format.enrichSession),
          requested: (res.data.requested || []).map((item) => {
            const session = format.enrichSession(item);
            session.requestKey = session.requestId || session.id;
            return session;
          }),
        });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' });
  },

  goCreate() {
    if (!api.getToken()) {
      this.goLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/create-session/index' });
  },

  goDetail(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/session-detail/index?id=' + id });
  },

  goEdit(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/create-session/index?id=' + id });
  },

  withdraw(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({
      title: '撤回申请',
      content: '确认撤回这个待审核申请？',
      success: (result) => {
        if (!result.confirm) return;
        api.patch('/api/session-requests/' + id + '/withdraw', {}).then((res) => {
          if (res.code === 0) {
            wx.showToast({ title: '已撤回', icon: 'success' });
            this.load();
          } else {
            wx.showToast({ title: res.message || '撤回失败', icon: 'none' });
          }
        });
      },
    });
  },
});
