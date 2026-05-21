const api = require('../../utils/api');

const app = getApp();

Page({
  data: {
    mode: 'login',
    submitting: false,
    wechatSubmitting: false,
    form: {
      nickname: '',
      identifier: '',
      password: '',
    },
  },

  switchLogin() {
    this.setData({ mode: 'login' });
  },

  switchRegister() {
    this.setData({ mode: 'register' });
  },

  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      ['form.' + field]: event.detail.value,
    });
  },

  buildIdentity() {
    const identifier = (this.data.form.identifier || '').trim();
    const payload = {
      password: this.data.form.password,
    };
    if (/^1\d{10}$/.test(identifier)) {
      payload.phone = identifier;
    } else {
      payload.wechat = identifier;
    }
    return payload;
  },

  validate() {
    if (this.data.mode === 'register' && !this.data.form.nickname.trim()) {
      return '请填写昵称';
    }
    if (!this.data.form.identifier.trim()) {
      return '请填写手机号或微信号';
    }
    if (!this.data.form.password || this.data.form.password.length < 6) {
      return '密码至少 6 位';
    }
    return '';
  },

  submit() {
    const error = this.validate();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }

    const payload = this.buildIdentity();
    const url = this.data.mode === 'login' ? '/api/login' : '/api/register';
    if (this.data.mode === 'register') {
      payload.nickname = this.data.form.nickname.trim();
    }

    this.setData({ submitting: true });
    api.post(url, payload).then((res) => {
      this.setData({ submitting: false });
      if (res.code === 0 && res.data) {
        app.setLogin(res.data);
        app.refreshMe();
        wx.switchTab({ url: '/pages/sessions/index' });
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    });
  },

  wechatLogin() {
    this.setData({ wechatSubmitting: true });
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          this.setData({ wechatSubmitting: false });
          wx.showToast({ title: '微信登录失败', icon: 'none' });
          return;
        }
        api.post('/api/wechat/login', { code: loginRes.code }).then((res) => {
          this.setData({ wechatSubmitting: false });
          if (res.code === 0 && res.data) {
            app.setLogin(res.data);
            app.refreshMe();
            wx.switchTab({ url: '/pages/sessions/index' });
          } else {
            wx.showToast({ title: res.message || '微信登录失败', icon: 'none' });
          }
        });
      },
      fail: () => {
        this.setData({ wechatSubmitting: false });
        wx.showToast({ title: '微信登录不可用', icon: 'none' });
      },
    });
  },
});
