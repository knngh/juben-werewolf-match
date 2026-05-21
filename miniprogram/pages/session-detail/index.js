const api = require('../../utils/api');
const format = require('../../utils/format');
const navigation = require('../../utils/navigation');

const app = getApp();

function applicantSummary(user) {
  return [
    user.city,
    (user.gameTypes || []).slice(0, 2).join('/'),
    (user.playModes || []).join('/'),
    user.budgetRange,
    user.playerCountRange,
  ].filter(Boolean).join(' · ');
}

function enrichRequest(item) {
  const user = item.user || {};
  const reliability = user.reliability || {};
  return Object.assign({}, item, {
    certaintyText: format.certaintyText(item.certainty),
    statusText: format.requestStatusText(item.status),
    summary: applicantSummary(user) || '资料未完善',
    reliabilityText: reliability.total
      ? '可靠度 ' + reliability.score + '%，' + reliability.wouldPlayAgain + ' 人愿意再约'
      : '',
  });
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value || '');
  } catch {
    return value || '';
  }
}

function parseSessionId(query = {}) {
  if (query.id) return String(query.id);
  const scene = safeDecode(query.scene).trim();
  if (!scene) return '';
  if (/^\d+$/.test(scene)) return scene;
  const sidMatch = scene.match(/(?:^|[?&])(?:sid|id)=(\d+)(?:$|[&?])/i) || scene.match(/^(?:sid|id)[_:-](\d+)$/i);
  if (sidMatch) return sidMatch[1];
  return '';
}

Page({
  data: {
    id: '',
    loading: true,
    requesting: false,
    aiGeneratingMessage: false,
    session: null,
    isCreator: false,
    hasContact: false,
    hasToken: false,
    aiCapabilities: {
      requestMessage: false,
    },
    requests: [],
    approvedRequests: [],
    message: '',
    certaintyIndex: 0,
    certaintyValues: ['confirmed', 'tentative', 'chat_first'],
    certaintyLabels: ['确定参加', '待确认', '想先沟通'],
    reportReasons: ['骚扰', '鸽局', '虚假信息', '不合适内容', '其他'],
    feedback: {
      punctual: true,
      friendly: true,
      wouldPlayAgain: true,
    },
  },

  onLoad(query) {
    this.enableShareMenu();
    this.setData({
      id: parseSessionId(query),
      hasToken: !!api.getToken(),
    });
    if (api.getToken()) {
      this.loadAiCapabilities();
      app.refreshMe().then(() => this.load());
    } else {
      this.load();
    }
  },

  onShow() {
    this.setData({ hasToken: !!api.getToken() });
    if (this.data.id) {
      this.load();
    }
    if (api.getToken()) {
      this.loadAiCapabilities();
    }
  },

  loadAiCapabilities() {
    api.get('/api/ai/capabilities').then((res) => {
      if (res.code === 0 && res.data && res.data.features) {
        this.setData({
          'aiCapabilities.requestMessage': !!res.data.features.requestMessage,
        });
      }
    });
  },

  load() {
    this.setData({ loading: true });
    api.get('/api/sessions/' + this.data.id).then((res) => {
      this.setData({ loading: false });
      if (res.code !== 0 || !res.data) {
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
        this.setData({ session: null });
        return;
      }
      const session = format.enrichSession(res.data);
      const currentUser = app.globalData.user || {};
      const currentUserId = currentUser.id || currentUser.userId;
      const isCreator = session.creatorUserId === currentUserId;
      this.setData({
        session,
        isCreator,
        hasContact: !!(session.contactNote || (session.creator && session.creator.wechat)),
      });
      if (isCreator) {
        this.loadRequests();
      }
    });
  },

  loadRequests() {
    api.get('/api/sessions/' + this.data.id + '/requests').then((res) => {
      if (res.code === 0 && Array.isArray(res.data)) {
        const requests = res.data.map(enrichRequest);
        this.setData({
          requests,
          approvedRequests: requests.filter((item) => item.status === 'approved'),
        });
      }
    });
  },

  ensureLogin() {
    if (!api.getToken()) {
      wx.navigateTo({ url: navigation.loginUrlWithRedirect() });
      return false;
    }
    return true;
  },

  enableShareMenu() {
    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
      });
    }
  },

  goLogin() {
    wx.navigateTo({ url: navigation.loginUrlWithRedirect() });
  },

  onCertaintyChange(event) {
    this.setData({ certaintyIndex: Number(event.detail.value) });
  },

  onMessageInput(event) {
    this.setData({ message: event.detail.value });
  },

  generateAiRequestMessage() {
    if (!this.ensureLogin()) return;
    this.setData({ aiGeneratingMessage: true });
    api.post('/api/ai/request-message', {
      sessionId: this.data.id,
    }).then((res) => {
      this.setData({ aiGeneratingMessage: false });
      if (res.code === 0 && res.data && res.data.message) {
        this.setData({ message: res.data.message });
        wx.showToast({ title: '已生成留言', icon: 'success' });
      } else {
        wx.showToast({ title: res.message || 'AI 暂不可用', icon: 'none' });
      }
    });
  },

  requestJoin() {
    if (!this.ensureLogin()) return;
    this.setData({ requesting: true });
    api.post('/api/sessions/' + this.data.id + '/requests', {
      message: this.data.message,
      certainty: this.data.certaintyValues[this.data.certaintyIndex],
    }).then((res) => {
      this.setData({ requesting: false });
      if (res.code === 0) {
        wx.showToast({ title: '申请已发送', icon: 'success' });
        this.setData({ message: '' });
        this.load();
      } else {
        wx.showToast({ title: res.message || '申请失败', icon: 'none' });
      }
    });
  },

  reviewRequest(event) {
    const id = event.currentTarget.dataset.id;
    const status = event.currentTarget.dataset.status;
    api.patch('/api/session-requests/' + id, { status }).then((res) => {
      if (res.code === 0) {
        wx.showToast({ title: status === 'approved' ? '已同意' : '已拒绝', icon: 'success' });
        this.load();
      } else {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
      }
    });
  },

  updateStatus(event) {
    const status = event.currentTarget.dataset.status;
    api.patch('/api/sessions/' + this.data.id + '/status', { status }).then((res) => {
      if (res.code === 0) {
        wx.showToast({ title: '状态已更新', icon: 'success' });
        this.load();
      } else {
        wx.showToast({ title: res.message || '状态更新失败', icon: 'none' });
      }
    });
  },

  goEdit() {
    wx.navigateTo({ url: '/pages/create-session/index?id=' + this.data.id });
  },

  onFeedbackChange(event) {
    const values = event.detail.value || [];
    this.setData({
      feedback: {
        punctual: values.includes('punctual'),
        friendly: values.includes('friendly'),
        wouldPlayAgain: values.includes('wouldPlayAgain'),
      },
    });
  },

  sendFeedback() {
    if (!this.ensureLogin()) return;
    const session = this.data.session;
    if (!session || !session.creator) return;
    api.post('/api/sessions/' + this.data.id + '/feedback', Object.assign({
      toUserId: session.creator.id,
    }, this.data.feedback)).then((res) => {
      wx.showToast({ title: res.code === 0 ? '已保存' : (res.message || '反馈失败'), icon: res.code === 0 ? 'success' : 'none' });
    });
  },

  copyWechat(event) {
    const value = event.currentTarget.dataset.value || (this.data.session && this.data.session.creator && this.data.session.creator.wechat);
    if (!value) {
      wx.showToast({ title: '暂无微信号', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: value,
      success: () => {
        wx.showToast({ title: '已复制微信号', icon: 'success' });
      },
    });
  },

  reportCreator() {
    if (!this.ensureLogin()) return;
    const session = this.data.session;
    if (!session || !session.creator) return;
    wx.showActionSheet({
      itemList: this.data.reportReasons,
      success: (result) => {
        const reason = this.data.reportReasons[result.tapIndex] || '其他';
        api.post('/api/reports', {
          targetUserId: session.creator.id,
          sessionId: session.id,
          reason,
        }).then((res) => {
          wx.showToast({ title: res.code === 0 ? '已提交' : (res.message || '提交失败'), icon: res.code === 0 ? 'success' : 'none' });
        });
      },
    });
  },

  blockCreator() {
    if (!this.ensureLogin()) return;
    const session = this.data.session;
    if (!session || !session.creator) return;
    wx.showModal({
      title: '确认拉黑',
      content: '拉黑后你们将不能继续互动',
      success: (result) => {
        if (!result.confirm) return;
        api.post('/api/block/' + session.creator.id, {}).then((res) => {
          wx.showToast({ title: res.code === 0 ? '已拉黑' : (res.message || '操作失败'), icon: res.code === 0 ? 'success' : 'none' });
          if (res.code === 0) {
            wx.switchTab({ url: '/pages/sessions/index' });
          }
        });
      },
    });
  },

  onShareAppMessage() {
    const session = this.data.session || {};
    const seatsLeft = session.seatsLeft !== undefined ? session.seatsLeft : '';
    const title = session.title
      ? session.title + (seatsLeft !== '' ? '，还差 ' + seatsLeft + ' 人' : '')
      : '来找桌游搭子';
    return {
      title,
      path: '/pages/session-detail/index?id=' + this.data.id + '&source=share',
    };
  },

  onShareTimeline() {
    const session = this.data.session || {};
    return {
      title: session.title || '来找桌游搭子',
      query: 'id=' + this.data.id + '&source=timeline',
    };
  },
});
