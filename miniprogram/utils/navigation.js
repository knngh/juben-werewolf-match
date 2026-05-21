const TAB_PAGES = [
  'pages/sessions/index',
  'pages/my/index',
  'pages/notifications/index',
  'pages/profile/index',
];

function toQuery(params) {
  const pairs = [];
  Object.keys(params || {}).forEach((key) => {
    const value = params[key];
    if (value !== undefined && value !== null && value !== '') {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
  });
  return pairs.length ? '?' + pairs.join('&') : '';
}

function currentPageUrl() {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1];
  if (!current) return '/pages/sessions/index';
  return '/' + current.route + toQuery(current.options || {});
}

function loginUrlWithRedirect(redirect) {
  return '/pages/login/index?redirect=' + encodeURIComponent(redirect || currentPageUrl());
}

function navigateAfterLogin(redirect) {
  if (!redirect) {
    wx.switchTab({ url: '/pages/sessions/index' });
    return;
  }
  const target = decodeURIComponent(redirect);
  const normalized = target.startsWith('/') ? target : '/' + target;
  const route = normalized.split('?')[0].replace(/^\//, '');
  if (TAB_PAGES.includes(route)) {
    wx.switchTab({ url: '/' + route });
    return;
  }
  wx.redirectTo({ url: normalized });
}

module.exports = {
  currentPageUrl,
  loginUrlWithRedirect,
  navigateAfterLogin,
};
