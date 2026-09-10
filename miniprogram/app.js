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
    const token = api.getToken();
    return api.get('/api/me')
      .then((res) => {
        if (!token || api.getToken() !== token) return null;
        if (res.code === 0 && res.data) {
          this.globalData.user = res.data;
          wx.setStorageSync('jwm_user_id', res.data.id);
          return res.data;
        }
        return null;
      })
      .catch(() => null);
  },

  setLogin(data) {
    wx.setStorageSync('jwm_token', data.token);
    wx.setStorageSync('jwm_user_id', data.userId);
    this.globalData.user = {
      id: data.userId,
      userId: data.userId,
      nickname: data.nickname,
    };
  },

  logout() {
    wx.removeStorageSync('jwm_token');
    wx.removeStorageSync('jwm_user_id');
    this.globalData.user = null;
  },
});
