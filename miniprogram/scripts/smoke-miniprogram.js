const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function readJson(relativePath) {
  const file = path.join(root, relativePath);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const appJson = readJson('app.json');
const projectConfig = readJson('project.config.json');

assert(Array.isArray(appJson.pages) && appJson.pages.length > 0, 'app.json pages 不能为空');
assert(appJson.pages[0] === 'pages/sessions/index', '首屏应为找局页');
assert(Array.isArray(appJson.tabBar && appJson.tabBar.list), 'tabBar 配置缺失');

const tabPages = new Set(appJson.tabBar.list.map((item) => item.pagePath));
[
  'pages/sessions/index',
  'pages/my/index',
  'pages/notifications/index',
  'pages/profile/index',
].forEach((page) => assert(tabPages.has(page), `tabBar 缺少 ${page}`));

[
  'pages/login/index',
  'pages/sessions/index',
  'pages/create-session/index',
  'pages/session-detail/index',
  'pages/my/index',
  'pages/profile/index',
  'pages/notifications/index',
].forEach((page) => {
  assert(appJson.pages.includes(page), `app.json 未注册 ${page}`);
  ['.js', '.json', '.wxml', '.wxss'].forEach((ext) => {
    const file = path.join(root, page + ext);
    assert(fs.existsSync(file), `页面文件缺失：${page}${ext}`);
  });
});

const apiSource = fs.readFileSync(path.join(root, 'utils/api.js'), 'utf8');
assert(apiSource.includes('Authorization'), 'API 请求应携带 Authorization');
assert(apiSource.includes('wx.request'), 'API 请求应使用 wx.request');

const configSource = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
assert(!configSource.includes('TIANDITU'), '小程序端不能包含天地图 Key');
assert(configSource.includes('apiBaseUrl'), '小程序 API 基址配置缺失');
assert(configSource.includes('subscribeTemplateIds'), '小程序订阅消息模板配置缺失');

const loginSource = fs.readFileSync(path.join(root, 'pages/login/index.js'), 'utf8');
assert(loginSource.includes('wx.login'), '登录页应接入 wx.login');
assert(loginSource.includes('/api/wechat/login'), '登录页应调用微信登录 API');
assert(loginSource.includes('navigateAfterLogin'), '登录页应支持登录后回跳');

const sessionDetailSource = fs.readFileSync(path.join(root, 'pages/session-detail/index.js'), 'utf8');
assert(sessionDetailSource.includes('onShareAppMessage'), '局详情页应支持分享');
assert(sessionDetailSource.includes('loginUrlWithRedirect'), '局详情页未登录互动应带回跳地址');
assert(sessionDetailSource.includes('parseSessionId'), '局详情页应支持 scene 参数解析');
assert(sessionDetailSource.includes('wx.setClipboardData'), '局详情页应支持复制微信号');
assert(sessionDetailSource.includes('wx.showShareMenu'), '局详情页应显式启用分享菜单');

const sessionsSource = fs.readFileSync(path.join(root, 'pages/sessions/index.js'), 'utf8');
assert(sessionsSource.includes('onShareAppMessage'), '找局页应支持分享');
assert(sessionsSource.includes('wx.showShareMenu'), '找局页应显式启用分享菜单');

const profileSource = fs.readFileSync(path.join(root, 'pages/profile/index.js'), 'utf8');
assert(profileSource.includes('/api/notification-preferences'), '资料页应接入通知偏好 API');
assert(profileSource.includes('wx.requestSubscribeMessage'), '资料页应接入微信订阅消息请求');

assert(projectConfig.compileType === 'miniprogram', 'project.config.json compileType 应为 miniprogram');

console.log('miniprogram smoke ok');
