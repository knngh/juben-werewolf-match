# 本杀匹配 · 桌游搭子匹配

面向剧本杀、狼人杀、血染钟楼、桌游、跑团等桌游类活动的**搭子匹配**应用。用户可以按偏好发现同好，也可以发布一局、申请加入、通过后查看联系方式。

当前方向不做实体店铺、商家后台、支付，也不纳入麻将、德州扑克、象棋、围棋、扑克等棋牌类游戏。

## 功能

- **Plan 0 基线**：健康检查、demo seed、后端环境变量、冒烟测试
- **注册/登录**：手机号或微信号 + 密码
- **小程序微信登录**：小程序端可用 `wx.login` 换取本应用登录态
- **我的资料**：常玩类型、游玩风格、常有空的时间、预算、人数组合、线上/线下、城市、简介
- **找局**：浏览开放中的桌游局，按类型、城市、日期、剩余席位、关键词、预算、线上/线下筛选，并展示匹配理由
- **发布一局**：填写类型、人数、时间、地点、预算、线上/线下、标签和通过后的联系方式说明；地点可通过天地图搜索并保存坐标
- **编辑局**：局主可修改时间、人数、预算、标签、说明和联系方式
- **申请加入**：玩家申请加入，局主审核；待审核可撤回，通过后展示联系方式
- **站内通知**：新申请、审批结果、局状态变化会生成通知和未读提醒
- **信任与安全**：支持举报、拉黑、局后反馈和可靠度摘要
- **AI 规划**：优先做发布局助手、申请留言助手、匹配解释和运营洞察，详见 `docs/ai-feature-plan.md`
- **AI 助手 MVP**：后端支持 mock AI，发布页可“AI 帮我填”，申请区可“AI 帮我写留言”
- **发现**：按偏好相似度推荐用户，左滑跳过、右滑点赞
- **匹配**：互相点赞即匹配，匹配列表可看对方简介与微信号

## 技术栈

- **后端**：Node.js + Express + SQLite + JWT
- **小程序主端**：微信小程序原生页面
- **Web 调试端**：Vue 3 + Vite + Vue Router + Pinia

## 本地运行

### 后端

```bash
cd backend
cp .env.example .env
# 在 .env 中配置 TIANDITU_KEY，用于地点搜索；小程序微信登录需配置 WECHAT_MINIPROGRAM_APPID / WECHAT_MINIPROGRAM_SECRET
npm install
npm start
```

API 默认：`http://localhost:3000`

后端会读取 `backend/.env`，其中 `TIANDITU_KEY` 和 `WECHAT_MINIPROGRAM_SECRET` 只在服务端使用；前端和小程序不直接暴露 key/secret。

AI 功能默认关闭。开发联调可设置：

```bash
AI_ENABLED=true
AI_PROVIDER=mock
AI_MODEL=mock-v1
```

OpenRouter 免费路由联调可设置：

```bash
AI_ENABLED=true
AI_PROVIDER=openrouter
AI_MODEL=openrouter/free
AI_API_KEY=your-openrouter-key
AI_APP_TITLE=juben-werewolf-match
AI_RETRY_COUNT=1
AI_DAILY_COST_LIMIT=0
```

真实模型接入时，模型 Key 只能放在后端 `.env` 的 `AI_API_KEY`。

常用检查：

```bash
curl http://localhost:3000/api/health
npm run smoke:sessions
npm run seed:demo
npm run backup:db
npm run cleanup:expired
```

本地 smoke 会使用 `WECHAT_LOGIN_DEV_MODE=true` 模拟微信登录。生产环境不要开启这个开关。

`npm run seed:demo` 会重建 `demo_` 前缀的演示账号，不会清理其他真实账号。演示账号微信号：`demo_creator`、`demo_joiner`、`demo_social`、`demo_keeper`，密码均为 `123456`。

上线检查见：[docs/launch-checklist.md](docs/launch-checklist.md)。

### 前端

```bash
cd frontend
npm install
npm run dev
```

开发环境已配置代理，前端请求 `/api` 会转发到 `http://localhost:3000`。浏览器打开：`http://localhost:5173`。

### 微信小程序

当前正式用户端以小程序为主，Web 端保留为调试和 H5 备份。

1. 先启动后端：

   ```bash
   cd backend
   npm start
   ```

2. 用微信开发者工具打开 `miniprogram/` 目录。
3. 本地调试默认请求 `http://127.0.0.1:3000`，配置在 `miniprogram/config.js`。
4. 真机或线上版本需要把 `apiBaseUrl` 改成 HTTPS API 域名，并在微信公众平台配置 request 合法域名。
5. 小程序微信登录需要后端 `.env` 配置 `WECHAT_MINIPROGRAM_APPID` 和 `WECHAT_MINIPROGRAM_SECRET`。
6. 订阅消息模板 ID 配置在 `miniprogram/config.js` 的 `subscribeTemplateIds`，未配置时只保存站内提醒偏好。

小程序首版页面：

- 找局：筛选开放局、附近 20km、查看详情
- 登录：支持微信登录，也保留手机号/微信号 + 密码登录
- 发布：发布/编辑桌游局、地点搜索走后端天地图代理
- 局详情：申请、审批、联系方式、举报、拉黑、局后反馈
- 分享：可分享局详情卡片，支持小程序码 `scene` 进入；未登录用户从分享进入后登录会回到原局
- 联系：申请通过后可复制局主微信号
- 我的局：发布记录、申请记录、撤回待审核申请
- 通知：申请/审批/局状态通知
- 我的：资料完整度、偏好维护、退出登录
- 提醒设置：保存申请、审批、局状态提醒偏好；模板配置完成后可请求微信订阅消息

静态检查：

```bash
node miniprogram/scripts/smoke-miniprogram.js
```

### 生产构建

```bash
# 前端
cd frontend
npm run build
# 将 dist/ 部署到任意静态服务器；接口地址通过环境变量配置，见下方

# 后端
cd backend
# 设置 PORT、JWT_SECRET、DB_PATH 等环境变量后
npm start
```

前端生产环境需指定 API 地址：构建时设置 `VITE_API_BASE=https://你的API域名`，或部署后通过 Nginx 反向代理 `/api` 到后端。

## 上传到 GitHub（新建仓库）

1. **在 GitHub 新建空仓库**  
   例如：`juben-werewolf-match`，不要勾选 “Add a README” 等初始化选项。

2. **在本机进入项目目录并推送到新仓库**  

   ```bash
   cd juben-werewolf-match
   git init
   git add .
   git commit -m "feat: 桌游搭子匹配"
   git branch -M main
   git remote add origin https://github.com/你的用户名/juben-werewolf-match.git
   git push -u origin main
   ```

   若使用 SSH：

   ```bash
   git remote add origin git@github.com:你的用户名/juben-werewolf-match.git
   git push -u origin main
   ```

3. **若项目已在其他仓库内**  
   先复制整个 `juben-werewolf-match` 文件夹到仓库外，再在新文件夹内执行 `git init` 和上述命令，形成独立仓库后推送到 GitHub。

## 目录结构

```
juben-werewolf-match/
├── backend/           # API
│   ├── server.js
│   ├── db.js
│   ├── auth.js
│   ├── env.js
│   ├── package.json
│   └── .env.example
├── frontend/          # Vue 3 前端
│   ├── src/
│   │   ├── views/     # 登录、注册、资料、找局、发现、匹配
│   │   ├── stores/
│   │   ├── router/
│   │   └── api.js
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── miniprogram/       # 微信小程序主端
│   ├── pages/         # 找局、发布、详情、我的局、通知、资料
│   ├── utils/
│   ├── config.js
│   ├── app.json
│   └── project.config.json
├── .gitignore
└── README.md
```

## License

MIT
