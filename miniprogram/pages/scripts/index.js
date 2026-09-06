const api = require('../../utils/api');
const navigation = require('../../utils/navigation');

function durationText(minutes) {
  const value = Number(minutes) || 0;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  if (!hours) return rest + ' 分钟';
  return rest ? hours + ' 小时 ' + rest + ' 分钟' : hours + ' 小时';
}

function matchLevel(score) {
  if (score >= 80) return '高度匹配';
  if (score >= 60) return '值得优先看';
  if (score > 0) return '可以了解';
  return '';
}

function enrichScript(item) {
  const scoreVisible = item.matchScore !== null && item.matchScore !== undefined;
  return Object.assign({}, item, {
    durationText: durationText(item.durationMin),
    playerText: item.minPlayers === item.maxPlayers
      ? item.minPlayers + ' 人'
      : item.minPlayers + '-' + item.maxPlayers + ' 人',
    matchScoreText: scoreVisible ? item.matchScore + '%' : '',
    matchLevel: scoreVisible ? matchLevel(item.matchScore) : '',
    primaryReason: item.matchReasons && item.matchReasons.length ? item.matchReasons[0] : '',
  });
}

Page({
  data: {
    loading: true,
    loggedIn: false,
    tasteCompleted: false,
    scripts: [],
    filters: {
      q: '',
      gameType: '',
      difficulty: '',
    },
    gameTypes: [
      { label: '全部', value: '', active: true },
      { label: '剧本杀', value: '剧本杀', active: false },
      { label: '狼人杀', value: '狼人杀', active: false },
      { label: '血染钟楼', value: '血染钟楼', active: false },
      { label: '桌游', value: '桌游', active: false },
      { label: '跑团', value: '跑团', active: false },
    ],
    difficulties: [
      { label: '全部难度', value: '', active: true },
      { label: '入门', value: '入门', active: false },
      { label: '进阶', value: '进阶', active: false },
    ],
  },

  onLoad() {
    if (wx.showShareMenu) {
      wx.showShareMenu({
        withShareTicket: true,
        menus: ['shareAppMessage', 'shareTimeline'],
      });
    }
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    const loggedIn = !!api.getToken();
    this.setData({ loggedIn, loading: true });
    const tastePromise = loggedIn
      ? api.get('/api/taste-profile')
      : Promise.resolve({ code: 0, data: { completedAt: '' } });
    const query = api.toQuery(this.data.filters);
    return Promise.all([api.get('/api/scripts' + query), tastePromise]).then(([scriptsRes, tasteRes]) => {
      const next = { loading: false };
      if (scriptsRes.code === 0 && Array.isArray(scriptsRes.data)) {
        next.scripts = scriptsRes.data.map(enrichScript);
      } else {
        next.scripts = [];
        wx.showToast({ title: scriptsRes.message || '剧本库加载失败', icon: 'none' });
      }
      next.tasteCompleted = !!(tasteRes.code === 0 && tasteRes.data && tasteRes.data.completedAt);
      this.setData(next);
    });
  },

  onSearchInput(event) {
    this.setData({ 'filters.q': event.detail.value });
  },

  applyFilter(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.currentTarget.dataset.value || '';
    this.setData({ ['filters.' + field]: value });
    this.refreshFilterRows();
    this.load();
  },

  refreshFilterRows() {
    this.setData({
      gameTypes: this.data.gameTypes.map((item) => Object.assign({}, item, {
        active: item.value === this.data.filters.gameType,
      })),
      difficulties: this.data.difficulties.map((item) => Object.assign({}, item, {
        active: item.value === this.data.filters.difficulty,
      })),
    });
  },

  goTasteTest() {
    if (!api.getToken()) {
      wx.navigateTo({
        url: navigation.loginUrlWithRedirect('/pages/taste-test/index'),
      });
      return;
    }
    wx.navigateTo({ url: '/pages/taste-test/index' });
  },

  goDetail(event) {
    wx.navigateTo({
      url: '/pages/script-detail/index?id=' + event.currentTarget.dataset.id,
    });
  },

  toggleSave(event) {
    const id = Number(event.currentTarget.dataset.id);
    const saved = event.currentTarget.dataset.saved === true || event.currentTarget.dataset.saved === 'true';
    if (!api.getToken()) {
      wx.navigateTo({ url: navigation.loginUrlWithRedirect() });
      return;
    }
    api.post('/api/scripts/' + id + '/action', { action: saved ? 'unsave' : 'save' }).then((res) => {
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        return;
      }
      this.setData({
        scripts: this.data.scripts.map((item) => item.id === id
          ? Object.assign({}, item, { saved: !saved })
          : item),
      });
      wx.showToast({ title: saved ? '已取消收藏' : '已收藏', icon: 'success' });
    });
  },

  dismiss(event) {
    const id = Number(event.currentTarget.dataset.id);
    if (!api.getToken()) {
      wx.navigateTo({ url: navigation.loginUrlWithRedirect() });
      return;
    }
    api.post('/api/scripts/' + id + '/action', { action: 'dismiss' }).then((res) => {
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        return;
      }
      this.setData({ scripts: this.data.scripts.filter((item) => item.id !== id) });
      wx.showToast({ title: '已减少此类推荐', icon: 'none' });
    });
  },

  onShareAppMessage() {
    return {
      title: '先测口味，再选不踩雷的剧本',
      path: '/pages/scripts/index?source=share',
    };
  },

  onShareTimeline() {
    return {
      title: '智能选本：按口味看亮点和雷点',
      query: 'source=timeline',
    };
  },
});
