const api = require('../../utils/api');
const navigation = require('../../utils/navigation');

function durationText(minutes) {
  const value = Number(minutes) || 0;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return rest + ' 分钟';
  return rest ? hours + ' 小时 ' + rest + ' 分钟' : hours + ' 小时';
}

Page({
  data: {
    loading: true,
    script: null,
    explanation: '',
    explanationLoading: false,
    explanationReady: false,
    scriptId: 0,
  },

  onLoad(query) {
    const scriptId = Number(query.id);
    if (!Number.isInteger(scriptId) || scriptId < 1) {
      wx.showToast({ title: '剧本不存在', icon: 'none' });
      return;
    }
    this.setData({ scriptId });
    this.load(scriptId);
  },

  load(scriptId) {
    this.setData({ loading: true });
    api.get('/api/scripts/' + scriptId).then((res) => {
      if (res.code !== 0 || !res.data) {
        this.setData({ loading: false });
        wx.showToast({ title: res.message || '剧本加载失败', icon: 'none' });
        return;
      }
      const script = Object.assign({}, res.data, {
        durationText: durationText(res.data.durationMin),
        playerText: res.data.minPlayers === res.data.maxPlayers
          ? res.data.minPlayers + ' 人'
          : res.data.minPlayers + '-' + res.data.maxPlayers + ' 人',
        matchScoreText: res.data.matchScore === null || res.data.matchScore === undefined
          ? ''
          : res.data.matchScore + ' 分',
      });
      this.setData({ loading: false, script });
      if (api.getToken()) {
        api.post('/api/scripts/' + scriptId + '/action', { action: 'view' });
      }
    });
  },

  goLogin() {
    wx.navigateTo({ url: navigation.loginUrlWithRedirect() });
  },

  requireLogin() {
    if (api.getToken()) return true;
    this.goLogin();
    return false;
  },

  toggleSave() {
    if (!this.requireLogin()) return;
    const saved = !!this.data.script.saved;
    api.post('/api/scripts/' + this.data.scriptId + '/action', {
      action: saved ? 'unsave' : 'save',
    }).then((res) => {
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        return;
      }
      this.setData({ 'script.saved': !saved });
      wx.showToast({ title: saved ? '已取消收藏' : '已收藏', icon: 'success' });
    });
  },

  dismiss() {
    if (!this.requireLogin()) return;
    api.post('/api/scripts/' + this.data.scriptId + '/action', { action: 'dismiss' }).then((res) => {
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已跳过这本', icon: 'none' });
      setTimeout(() => wx.switchTab({ url: '/pages/scripts/index' }), 350);
    });
  },

  explain() {
    if (!this.requireLogin() || this.data.explanationLoading) return;
    this.setData({ explanationLoading: true });
    api.post('/api/ai/script-explanation', { scriptId: this.data.scriptId }).then((res) => {
      this.setData({ explanationLoading: false });
      if (res.code !== 0 || !res.data || !res.data.explanation) {
        wx.showToast({ title: res.message || '暂时无法生成说明', icon: 'none' });
        return;
      }
      this.setData({ explanation: res.data.explanation, explanationReady: true });
    });
  },

  startPlaying() {
    if (!this.requireLogin()) return;
    wx.setStorageSync('jwm_tools_script_id', this.data.scriptId);
    wx.switchTab({ url: '/pages/tools/index' });
  },

  onShareAppMessage() {
    const script = this.data.script || {};
    return {
      title: script.title ? '推荐一本：' + script.title : '看看这本剧本适不适合你',
      path: '/pages/script-detail/index?id=' + this.data.scriptId,
    };
  },
});
