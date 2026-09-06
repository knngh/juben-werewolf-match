const api = require('../../utils/api');

Page({
  data: { loading: true, loggedIn: false, list: [] },

  onShow() {
    this.load();
  },

  load() {
    const loggedIn = !!api.getToken();
    this.setData({ loggedIn, loading: loggedIn });
    if (!loggedIn) {
      this.setData({ list: [] });
      return Promise.resolve();
    }
    return api.get('/api/matches').then((res) => {
      this.setData({ loading: false });
      if (res.code === 0 && Array.isArray(res.data)) {
        this.setData({ list: res.data.map((item) => Object.assign({}, item, { initial: (item.nickname || '?').charAt(0) })) });
      } else {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/index' });
  },

  report(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showActionSheet({
      itemList: ['骚扰', '鸽局', '虚假信息', '不合适内容', '其他'],
      success: (result) => {
        const reasons = ['骚扰', '鸽局', '虚假信息', '不合适内容', '其他'];
        api.post('/api/reports', { targetUserId: id, reason: reasons[result.tapIndex] }).then((res) => {
          wx.showToast({ title: res.code === 0 ? '已提交' : (res.message || '提交失败'), icon: res.code === 0 ? 'success' : 'none' });
        });
      },
    });
  },

  block(event) {
    const id = Number(event.currentTarget.dataset.id);
    wx.showModal({
      title: '确认拉黑',
      content: '拉黑后将解除互动',
      success: (result) => {
        if (!result.confirm) return;
        api.post('/api/block/' + id, {}).then((res) => {
          if (res.code === 0) this.load();
          else wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        });
      },
    });
  },
});
