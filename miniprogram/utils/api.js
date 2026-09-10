const config = require('../config');

function getToken() {
  return wx.getStorageSync('jwm_token') || '';
}

function getUserId() {
  const id = Number(wx.getStorageSync('jwm_user_id'));
  return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function request(method, url, data) {
  const headers = {
    'Content-Type': 'application/json',
  };
  const token = getToken();
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }

  return new Promise((resolve) => {
    const options = {
      url: config.apiBaseUrl + url,
      method,
      data: data || {},
      header: headers,
      timeout: 12000,
      success(res) {
        const payload = res.data || {};
        if (res.statusCode === 401 && getToken() === token) {
          wx.removeStorageSync('jwm_token');
          wx.removeStorageSync('jwm_user_id');
          const pages = getCurrentPages();
          const current = pages[pages.length - 1];
          if (!current || current.route !== 'pages/login/index') {
            wx.navigateTo({ url: '/pages/login/index' });
          }
        }
        resolve(Object.assign({ status: res.statusCode }, payload));
      },
      fail(error) {
        const errorType = error && String(error.errMsg || error.message || '').toLowerCase().includes('timeout')
          ? 'timeout'
          : 'network';
        const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(config.apiBaseUrl);
        resolve({
          code: 500,
          status: 0,
          errorType,
          message: errorType === 'timeout' ? '请求超时，请稍后重试' : '暂时无法连接服务',
          hint: isLocal
            ? '本地联调：请在 backend 目录运行 npm run dev 并保持运行。真机调试不能使用 127.0.0.1。'
            : '请检查网络连接后重试。',
        });
      },
    };
    try {
      wx.request(options);
    } catch (error) {
      options.fail(error);
    }
  });
}

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

module.exports = {
  getToken,
  getUserId,
  toQuery,
  get(url) {
    return request('GET', url);
  },
  post(url, data) {
    return request('POST', url, data);
  },
  patch(url, data) {
    return request('PATCH', url, data);
  },
  delete(url) {
    return request('DELETE', url);
  },
};
