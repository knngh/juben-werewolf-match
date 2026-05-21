const api = require('./utils/api');

App({
  globalData: {
    user: null,
  },

  onLaunch() {
    const token = wx.getStorageSync('jwm_token');
    if (token) {
      this.refreshMe();
    }
  },

  refreshMe() {
    return api.get('/api/me')
      .then((res) => {
        if (res.code === 0 && res.data) {
          this.globalData.user = res.data;
          return res.data;
        }
        return null;
      })
      .catch(() => null);
  },

  setLogin(data) {
    wx.setStorageSync('jwm_token', data.token);
    this.globalData.user = {
      id: data.userId,
      userId: data.userId,
      nickname: data.nickname,
    };
  },

  logout() {
    wx.removeStorageSync('jwm_token');
    this.globalData.user = null;
  },
});
