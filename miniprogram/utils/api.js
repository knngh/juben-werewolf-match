const config = require('../config');

function getToken() {
  return wx.getStorageSync('jwm_token') || '';
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
    wx.request({
      url: config.apiBaseUrl + url,
      method,
      data: data || {},
      header: headers,
      success(res) {
        const payload = res.data || {};
        if (res.statusCode === 401) {
          wx.removeStorageSync('jwm_token');
          const pages = getCurrentPages();
          const current = pages[pages.length - 1];
          if (!current || current.route !== 'pages/login/index') {
            wx.navigateTo({ url: '/pages/login/index' });
          }
        }
        resolve(Object.assign({ status: res.statusCode }, payload));
      },
      fail() {
        resolve({
          code: 500,
          status: 0,
          message: '网络连接失败',
        });
      },
    });
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
