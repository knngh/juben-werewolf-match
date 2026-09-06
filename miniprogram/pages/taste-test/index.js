const api = require('../../utils/api');
const navigation = require('../../utils/navigation');

function emptyAnswers() {
  return {
    experience: [],
    avoid: [],
    pace: '',
    frequency: '',
  };
}

Page({
  data: {
    loading: true,
    submitting: false,
    currentIndex: 0,
    progress: 25,
    questions: [],
    currentQuestion: null,
    optionRows: [],
    questionHint: '',
    nextLabel: '下一步',
    answers: emptyAnswers(),
  },

  onLoad() {
    if (!api.getToken()) {
      wx.redirectTo({ url: navigation.loginUrlWithRedirect('/pages/taste-test/index') });
      return;
    }
    this.load();
  },

  load() {
    Promise.all([
      api.get('/api/options'),
      api.get('/api/taste-profile'),
    ]).then(([optionsRes, profileRes]) => {
      if (optionsRes.code !== 0 || !optionsRes.data || !optionsRes.data.tasteQuestions) {
        this.setData({ loading: false });
        wx.showToast({ title: optionsRes.message || '测试题加载失败', icon: 'none' });
        return;
      }
      const answers = emptyAnswers();
      if (profileRes.code === 0 && profileRes.data && profileRes.data.completedAt) {
        const profile = profileRes.data.profile || {};
        answers.experience = profile.favoriteTags || [];
        answers.avoid = profile.avoidTags || [];
        answers.pace = profile.pace || '';
        answers.frequency = profile.frequency || '';
      }
      this.setData({
        loading: false,
        questions: optionsRes.data.tasteQuestions,
        answers,
      });
      this.refreshQuestion();
    });
  },

  refreshQuestion() {
    const question = this.data.questions[this.data.currentIndex];
    if (!question) return;
    const answer = this.data.answers[question.key];
    const selected = Array.isArray(answer) ? answer : answer ? [answer] : [];
    this.setData({
      currentQuestion: question,
      progress: Math.round(((this.data.currentIndex + 1) / this.data.questions.length) * 100),
      questionHint: question.type === 'multi' ? '可多选，最多 ' + question.max + ' 项' : '选择最接近你的一项',
      nextLabel: this.data.currentIndex === this.data.questions.length - 1 ? '生成画像' : '下一步',
      optionRows: question.options.map((value) => ({
        value,
        active: selected.includes(value),
      })),
    });
  },

  selectOption(event) {
    const value = event.currentTarget.dataset.value;
    const question = this.data.currentQuestion;
    if (question.type === 'single') {
      this.setData({ ['answers.' + question.key]: value });
      this.refreshQuestion();
      return;
    }
    const current = this.data.answers[question.key] || [];
    const exists = current.includes(value);
    if (!exists && current.length >= question.max) {
      wx.showToast({ title: '最多选择 ' + question.max + ' 项', icon: 'none' });
      return;
    }
    this.setData({
      ['answers.' + question.key]: exists
        ? current.filter((item) => item !== value)
        : current.concat(value),
    });
    this.refreshQuestion();
  },

  validateCurrent() {
    const question = this.data.currentQuestion;
    const answer = this.data.answers[question.key];
    if (question.key === 'experience' && (!answer || !answer.length)) {
      return '至少选择一种想要的体验';
    }
    if (question.key === 'frequency' && !answer) {
      return '请选择游玩频率';
    }
    return '';
  },

  previous() {
    if (this.data.currentIndex <= 0) return;
    this.setData({ currentIndex: this.data.currentIndex - 1 });
    this.refreshQuestion();
  },

  next() {
    const error = this.validateCurrent();
    if (error) {
      wx.showToast({ title: error, icon: 'none' });
      return;
    }
    if (this.data.currentIndex >= this.data.questions.length - 1) {
      this.submit();
      return;
    }
    this.setData({ currentIndex: this.data.currentIndex + 1 });
    this.refreshQuestion();
  },

  submit() {
    if (!this.data.answers.experience.length || !this.data.answers.frequency) {
      wx.showToast({ title: '请完成偏好和频率选择', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    api.post('/api/taste-profile', this.data.answers).then((res) => {
      this.setData({ submitting: false });
      if (res.code !== 0) {
        wx.showToast({ title: res.message || '保存失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '画像已生成', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/scripts/index' });
      }, 350);
    });
  },
});
