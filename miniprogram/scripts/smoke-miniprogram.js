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
assert(appJson.pages[0] === 'pages/scripts/index', '首屏应为智能选本页');
assert(appJson.pages.length === 7, 'MVP 首发页面应包含选本、工具、档案、测试、详情、我的和登录');
assert(Array.isArray(appJson.tabBar && appJson.tabBar.list), 'tabBar 配置缺失');

const tabPages = new Set(appJson.tabBar.list.map((item) => item.pagePath));
[
  'pages/scripts/index',
  'pages/profile/index',
].forEach((page) => assert(tabPages.has(page), `tabBar 缺少 ${page}`));
assert(!tabPages.has('pages/matches/index'), '匹配不应出现在 MVP 底部导航');
assert(!tabPages.has('pages/discover/index'), '发现不应出现在 MVP 底部导航');

[
  'pages/login/index',
  'pages/scripts/index',
  'pages/taste-test/index',
  'pages/script-detail/index',
  'pages/tools/index',
  'pages/archive/index',
  'pages/profile/index',
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
assert(sessionDetailSource.includes('/api/ai/request-message'), '局详情页应接入 AI 申请留言接口');
assert(sessionDetailSource.includes('/api/ai/match-explanation'), '局详情页应接入 AI 匹配理由解释接口');
assert(sessionDetailSource.includes('/api/ai/game-guide'), '局详情页应接入 AI 玩法攻略接口');
assert(sessionDetailSource.includes('matchExplanation'), '局详情页应按后端能力显示 AI 匹配解释');
assert(sessionDetailSource.includes('gameGuide'), '局详情页应按后端能力显示 AI 玩法攻略');

const sessionsSource = fs.readFileSync(path.join(root, 'pages/sessions/index.js'), 'utf8');
assert(sessionsSource.includes('onShareAppMessage'), '找局页应支持分享');
assert(sessionsSource.includes('wx.showShareMenu'), '找局页应显式启用分享菜单');

const scriptsSource = fs.readFileSync(path.join(root, 'pages/scripts/index.js'), 'utf8');
assert(scriptsSource.includes('/api/scripts'), '选本页应接入剧本库接口');
assert(scriptsSource.includes('/api/taste-profile'), '选本页应读取口味画像状态');
assert(scriptsSource.includes('/api/scripts/' + "' + id + '" + '/action'), '选本页应支持收藏和跳过');
assert(scriptsSource.includes('loginUrlWithRedirect'), '选本页未登录互动应带回跳地址');

const tasteSource = fs.readFileSync(path.join(root, 'pages/taste-test/index.js'), 'utf8');
assert(tasteSource.includes('tasteQuestions'), '口味测试页应使用后端题目配置');
assert(tasteSource.includes('/api/taste-profile'), '口味测试页应保存画像');
assert(tasteSource.includes('最多选择'), '口味测试页应限制多选数量');

const scriptDetailSource = fs.readFileSync(path.join(root, 'pages/script-detail/index.js'), 'utf8');
assert(scriptDetailSource.includes('/api/scripts/'), '剧本详情页应接入详情接口');
assert(scriptDetailSource.includes('/api/ai/script-explanation'), '剧本详情页应接入 AI 推荐解释');
assert(scriptDetailSource.includes('loginUrlWithRedirect'), '剧本详情页未登录互动应带回跳地址');
assert(scriptDetailSource.includes('/pages/tools/index?id='), '剧本详情页应能进入打本工具');

const toolsSource = fs.readFileSync(path.join(root, 'pages/tools/index.js'), 'utf8');
assert(toolsSource.includes('/api/play-records'), '打本工具应接入打卡记录接口');
assert(toolsSource.includes('/api/scripts/' + "' + this.data.scriptId + '" + '/notes'), '打本工具应接入结构化笔记接口');
assert(toolsSource.includes('setInterval'), '打本工具应支持分幕计时');

const archiveSource = fs.readFileSync(path.join(root, 'pages/archive/index.js'), 'utf8');
assert(archiveSource.includes('/api/play-records'), '档案页应接入打本记录接口');

const discoverSource = fs.readFileSync(path.join(root, 'pages/discover/index.js'), 'utf8');
assert(discoverSource.includes('/api/discover'), '发现页应接入推荐用户接口');
assert(discoverSource.includes('/api/like/'), '发现页应支持喜欢操作');

const matchesSource = fs.readFileSync(path.join(root, 'pages/matches/index.js'), 'utf8');
assert(matchesSource.includes('/api/matches'), '匹配页应接入互相喜欢列表接口');

const profileSource = fs.readFileSync(path.join(root, 'pages/profile/index.js'), 'utf8');
assert(profileSource.includes('/api/notification-preferences'), '资料页应接入通知偏好 API');
assert(profileSource.includes('wx.requestSubscribeMessage'), '资料页应接入微信订阅消息请求');

const createSessionSource = fs.readFileSync(path.join(root, 'pages/create-session/index.js'), 'utf8');
assert(createSessionSource.includes('/api/ai/session-draft'), '发布页应接入 AI 发布草稿接口');
assert(createSessionSource.includes('/api/ai/capabilities'), '发布页应按后端能力显示 AI 按钮');

assert(projectConfig.compileType === 'miniprogram', 'project.config.json compileType 应为 miniprogram');

console.log('miniprogram smoke ok');
