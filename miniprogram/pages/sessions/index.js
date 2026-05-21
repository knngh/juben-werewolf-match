const api = require('../../utils/api');
const format = require('../../utils/format');

Page({
  data: {
    loading: true,
    nearbyLoading: false,
    sessions: [],
    options: {
      gameTypes: [],
      playModes: [],
      budgetRanges: [],
    },
    filters: {
      gameType: '',
      playMode: '',
      budgetRange: '',
      datePreset: '',
      minSeats: '',
      city: '',
      q: '',
      nearLng: '',
      nearLat: '',
      maxDistanceKm: '',
    },
    pickerIndexes: {
      gameType: 0,
      playMode: 0,
      budgetRange: 0,
      minSeats: 0,
    },
    seatOptions: ['全部席位', '至少 1 位', '至少 2 位', '至少 3 位'],
    seatValues: ['', '1', '2', '3'],
    seatText: '剩余席位',
    datePresets: [
      { label: '今天', value: 'today' },
      { label: '明天', value: 'tomorrow' },
      { label: '周末', value: 'weekend' },
      { label: '7天', value: 'next7' },
    ],
    needsProfile: false,
    missingText: '',
  },

  onLoad() {
    this.loadOptions();
    this.loadMe();
  },

  onShow() {
    this.loadSessions();
  },

  onPullDownRefresh() {
    this.loadSessions().then(() => wx.stopPullDownRefresh());
  },

  loadOptions() {
    api.get('/api/options').then((res) => {
      if (res.code === 0 && res.data) {
        this.setData({
          options: {
            gameTypes: res.data.gameTypes || [],
            playModes: res.data.playModes || [],
            budgetRanges: res.data.budgetRanges || [],
          },
        });
      }
    });
  },

  loadMe() {
    if (!api.getToken()) return;
    api.get('/api/me').then((res) => {
      if (res.code === 0 && res.data && res.data.profileCompleteness) {
        const completeness = res.data.profileCompleteness;
        const missing = completeness.missing || [];
        this.setData({
          needsProfile: completeness.score < 100 && missing.length > 0,
          missingText: missing.map((item) => item.label).join('、'),
        });
      }
    });
  },

  loadSessions() {
    this.setData({ loading: true });
    const query = api.toQuery(this.data.filters);
    return api.get('/api/sessions' + query).then((res) => {
      if (res.code === 0 && Array.isArray(res.data)) {
        this.setData({
          sessions: res.data.map(format.enrichSession),
          loading: false,
        });
      } else {
        this.setData({ loading: false });
        wx.showToast({ title: res.message || '加载失败', icon: 'none' });
      }
    });
  },

  onFilterInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({
      ['filters.' + field]: event.detail.value,
    });
  },

  onPickerFilter(event) {
    const field = event.currentTarget.dataset.field;
    const listName = event.currentTarget.dataset.list;
    const index = Number(event.detail.value);
    const value = this.data.options[listName][index] || '';
    this.setData({
      ['pickerIndexes.' + field]: index,
      ['filters.' + field]: value,
    });
    this.loadSessions();
  },

  onSeatFilter(event) {
    const index = Number(event.detail.value);
    this.setData({
      'pickerIndexes.minSeats': index,
      'filters.minSeats': this.data.seatValues[index],
      seatText: this.data.seatOptions[index],
    });
    this.loadSessions();
  },

  applyDatePreset(event) {
    this.setData({
      'filters.datePreset': event.currentTarget.dataset.value,
    });
    this.loadSessions();
  },

  resetFilters() {
    this.setData({
      filters: {
        gameType: '',
        playMode: '',
        budgetRange: '',
        datePreset: '',
        minSeats: '',
        city: '',
        q: '',
        nearLng: '',
        nearLat: '',
        maxDistanceKm: '',
      },
      pickerIndexes: {
        gameType: 0,
        playMode: 0,
        budgetRange: 0,
        minSeats: 0,
      },
      seatText: '剩余席位',
    });
    this.loadSessions();
  },

  useNearby() {
    this.setData({ nearbyLoading: true });
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          'filters.nearLng': String(res.longitude),
          'filters.nearLat': String(res.latitude),
          'filters.maxDistanceKm': '20',
          nearbyLoading: false,
        });
        this.loadSessions();
      },
      fail: () => {
        this.setData({ nearbyLoading: false });
        wx.showToast({ title: '定位失败，可按城市筛选', icon: 'none' });
      },
    });
  },

  goCreate() {
    wx.navigateTo({ url: '/pages/create-session/index' });
  },

  goProfile() {
    wx.switchTab({ url: '/pages/profile/index' });
  },

  goDetail(event) {
    const id = event.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/session-detail/index?id=' + id });
  },

  onShareAppMessage() {
    return {
      title: '找剧本杀、狼人杀、跑团和桌游搭子',
      path: '/pages/sessions/index?source=share',
    };
  },

  onShareTimeline() {
    return {
      title: '找桌游搭子，一起组局',
      query: 'source=timeline',
    };
  },
});
