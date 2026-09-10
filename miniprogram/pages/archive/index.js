const api = require('../../utils/api');
const navigation = require('../../utils/navigation');

Page({
  data: {
    loading: true,
    loadError: '',
    loadErrorHint: '',
    loggedIn: false,
    summary: {
      total: 0,
      ratedCount: 0,
      averageRating: 0,
      typeCounts: [],
    },
    records: [],
    hasMoreRecords: false,
    nextRecordOffset: 0,
    loadingMoreRecords: false,
    deletingRecordId: 0,
    topType: '还没有偏好',
    typeRows: [],
    averageRatingText: '--',
  },

  onShow() {
    if (!api.getToken()) {
      this.clearOwner('');
      this.setData({ loggedIn: false, loading: false });
      return;
    }
    return this.load();
  },

  clearOwner(token) {
    if (this.ownerToken === token) return;
    this.ownerToken = token;
    this.loadVersion = (this.loadVersion || 0) + 1;
    this.setData({ records: [], summary: { total: 0, ratedCount: 0, averageRating: 0, typeCounts: [] },
      hasMoreRecords: false, nextRecordOffset: 0, loadingMoreRecords: false, deletingRecordId: 0,
      typeRows: [], topType: '还没有偏好', averageRatingText: '--', loadError: '', loadErrorHint: '' });
  },

  loadMoreRecords() {
    if (this.data.loadingMoreRecords || !this.data.hasMoreRecords || this.data.loading) return;
    return this.load(true);
  },

  load(append = false) {
    append = append === true;
    const token = api.getToken();
    this.clearOwner(token);
    const loadVersion = this.loadVersion = (this.loadVersion || 0) + 1;
    this.setData({ loggedIn: true, loading: !append, loadingMoreRecords: append });
    return api.get('/api/play-records' + (append ? '?offset=' + this.data.nextRecordOffset : '')).then((res) => {
      if (token !== api.getToken() || loadVersion !== this.loadVersion) return;
      if (res.code !== 0 || !res.data) {
        this.setData({ loading: false, loadError: res.message || '档案加载失败', loadErrorHint: res.hint || '' });
        return;
      }
      const summary = res.data.summary || {};
      const typeCounts = summary.typeCounts || [];
      const total = Number(summary.total) || 0;
      this.setData({
        loading: false,
        loadError: '',
        loadErrorHint: '',
        summary,
        records: append ? this.data.records.concat((res.data.records || []).filter((item) => !this.data.records.some((old) => old.id === item.id))) : res.data.records || [],
        hasMoreRecords: !!(res.pagination && res.pagination.hasMore),
        nextRecordOffset: res.pagination && res.pagination.nextOffset || 0,
        topType: typeCounts.length ? typeCounts[0].gameType : '还没有偏好',
        typeRows: typeCounts.map((item) => Object.assign({}, item, {
          barWidth: total ? Math.max(8, Math.round((item.count / total) * 100)) : 0,
        })),
        averageRatingText: summary.averageRating ? String(summary.averageRating) : '--',
      });
    }).catch(() => {
      if (token !== api.getToken() || loadVersion !== this.loadVersion) return;
      this.setData({ loading: false, loadError: '档案加载失败，请重试', loadErrorHint: '' });
    }).then(() => {
      if (token === api.getToken() && loadVersion === this.loadVersion) this.setData({ loadingMoreRecords: false });
    });
  },

  editRecord(event) {
    if (this.ownerToken !== api.getToken() || this.data.deletingRecordId) return;
    const record = this.data.records.find((item) => item.id === Number(event.currentTarget.dataset.id));
    if (!record) return;
    wx.setStorageSync('jwm_tools_edit_record', { id: record.id, scriptId: record.scriptId, userId: api.getUserId() });
    wx.switchTab({ url: '/pages/tools/index' });
  },

  async deleteRecord(event) {
    if (this.data.deletingRecordId || this.ownerToken !== api.getToken()) return;
    const id = Number(event.currentTarget.dataset.id);
    const token = api.getToken();
    const confirmed = await new Promise((resolve) => wx.showModal({ title: '删除打本记录？', content: '删除后无法恢复，这次评分也将从推荐依据中移除。',
      success: (result) => resolve(result.confirm), fail: () => resolve(false) }));
    if (!confirmed || token !== api.getToken() || this.data.deletingRecordId) return;
    this.setData({ deletingRecordId: id });
    try {
      const res = await api.delete('/api/play-records/' + id);
      if (token !== api.getToken()) return;
      if (res.code !== 0 && res.code !== 404) return wx.showToast({ title: res.message || '删除失败', icon: 'none' });
      await this.load();
    } catch {
      if (token === api.getToken()) wx.showToast({ title: '删除失败，请重试', icon: 'none' });
    } finally {
      if (token === api.getToken()) this.setData({ deletingRecordId: 0 });
    }
  },

  goLogin() {
    wx.navigateTo({ url: navigation.loginUrlWithRedirect('/pages/archive/index') });
  },

  goTools() {
    if (!api.getToken()) {
      this.goLogin();
      return;
    }
    wx.switchTab({ url: '/pages/tools/index' });
  },

  goScripts() {
    wx.switchTab({ url: '/pages/scripts/index' });
  },
});
