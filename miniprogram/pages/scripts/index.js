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
  if (score >= 80) return '优先考虑';
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
    matchScoreText: scoreVisible ? item.matchScore + ' 分' : '',
    matchLevel: scoreVisible ? matchLevel(item.matchScore) : '',
    primaryReason: item.matchReasons && item.matchReasons.length ? item.matchReasons[0] : '',
    highlightText: item.highlights && item.highlights.length ? item.highlights[0] : '查看详情了解亮点',
    warningText: item.warnings && item.warnings.length ? item.warnings[0] : '内容风险待确认',
  });
}

Page({
  data: {
    loading: true,
    loadError: '',
    loadErrorHint: '',
    loggedIn: false,
    tasteCompleted: false,
    heroTitle: '从不踩雷开始选本',
    heroDesc: '先看亮点，再看雷点，把“今天玩什么”变成一个更轻松的决定。',
    resultCountText: '--',
    savedCount: 0,
    highMatchCount: 0,
    hasMore: false,
    nextOffset: 0,
    loadingMore: false,
    actionPending: false,
    scripts: [],
    filters: {
      q: '',
      gameType: '',
      difficulty: '',
      collection: '',
    },
    collections: [
      { label: '推荐', value: '', active: true },
      { label: '收藏', value: 'saved', active: false },
      { label: '已跳过', value: 'dismissed', active: false },
    ],
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

  load(append) {
    append = append === true;
    const loadId = this.loadId = (this.loadId || 0) + 1;
    const token = api.getToken();
    const loggedIn = !!token;
    if (this.ownerToken !== token) {
      this.ownerToken = token;
      this.setData({ scripts: [], tasteCompleted: false, hasMore: false, nextOffset: 0, savedCount: 0, highMatchCount: 0,
        resultCountText: '--', actionPending: false, 'filters.collection': '' });
      this.refreshFilterRows();
    }
    this.setData({ loggedIn, loading: !append, loadingMore: append });
    const tastePromise = loggedIn
      ? api.get('/api/taste-profile')
      : Promise.resolve({ code: 0, data: { completedAt: '' } });
    const query = api.toQuery(Object.assign({}, this.data.filters, { offset: append ? this.data.nextOffset : 0 }));
    return Promise.all([api.get('/api/scripts' + query), tastePromise]).then(([scriptsRes, tasteRes]) => {
      if (loadId !== this.loadId || token !== api.getToken()) return;
      const next = { loading: false, loadingMore: false, loadError: '', loadErrorHint: '' };
      if (scriptsRes.code === 0 && Array.isArray(scriptsRes.data)) {
        const incoming = scriptsRes.data.map(enrichScript);
        next.scripts = append ? this.data.scripts.concat(incoming.filter((item) => !this.data.scripts.some((previous) => previous.id === item.id))) : incoming;
        next.hasMore = !!(scriptsRes.pagination && scriptsRes.pagination.hasMore);
        next.nextOffset = scriptsRes.pagination && scriptsRes.pagination.nextOffset || 0;
        next.resultCountText = (scriptsRes.pagination ? scriptsRes.pagination.total : next.scripts.length) + ' 本候选';
        next.savedCount = next.scripts.filter((item) => item.saved).length;
        next.highMatchCount = next.scripts.filter((item) => item.matchScore >= 80).length;
      } else {
        next.loadError = scriptsRes.message || '剧本库加载失败';
        next.loadErrorHint = scriptsRes.hint || '';
      }
      next.tasteCompleted = this.data.tasteCompleted;
      if (tasteRes.code === 0 && tasteRes.data) {
        next.tasteCompleted = !!tasteRes.data.completedAt;
      } else if (!next.loadError) {
        next.loadError = tasteRes.message || '口味画像暂未更新';
        next.loadErrorHint = tasteRes.hint || '';
      }
      next.heroTitle = next.tasteCompleted ? '你的下一本，已经排好' : '从不踩雷开始选本';
      next.heroDesc = next.tasteCompleted
        ? '推荐会结合你的偏好、雷点和游玩频率动态排序。'
        : '先看亮点，再看雷点，把“今天玩什么”变成一个更轻松的决定。';
      this.setData(next);
    }).catch(() => {
      if (loadId !== this.loadId || token !== api.getToken()) return;
      this.setData({ loading: false, loadingMore: false, loadError: '加载失败，请重试', loadErrorHint: '' });
    });
  },

  loadMore() {
    if (!this.data.loading && !this.data.loadingMore && this.data.hasMore) return this.load(true);
  },

  onSearchInput(event) {
    this.setData({ 'filters.q': event.detail.value });
  },

  applyFilter(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.currentTarget.dataset.value || '';
    if (field === 'collection' && value && !api.getToken()) {
      wx.navigateTo({ url: navigation.loginUrlWithRedirect() });
      return;
    }
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
      collections: this.data.collections.map((item) => Object.assign({}, item, { active: item.value === this.data.filters.collection })),
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
    return this.updateAction(id, saved ? 'unsave' : 'save', saved ? '已取消收藏' : '已收藏');
  },

  dismiss(event) {
    const id = Number(event.currentTarget.dataset.id);
    const dismissed = event.currentTarget.dataset.dismissed === true || event.currentTarget.dataset.dismissed === 'true';
    return this.updateAction(id, dismissed ? 'restore' : 'dismiss', dismissed ? '已恢复推荐' : '已跳过这本');
  },

  updateAction(id, action, message) {
    const token = api.getToken();
    if (!token) {
      wx.navigateTo({ url: navigation.loginUrlWithRedirect() });
      return;
    }
    if (this.data.actionPending || token !== this.ownerToken) return;
    this.setData({ actionPending: true });
    return api.post('/api/scripts/' + id + '/action', { action }).then((res) => {
      if (token !== api.getToken()) return;
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '操作失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: message, icon: 'none' });
      return this.load();
    }).catch(() => {
      if (token === api.getToken()) wx.showToast({ title: '操作失败，请重试', icon: 'none' });
    }).then(() => {
      if (token === api.getToken()) this.setData({ actionPending: false });
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
