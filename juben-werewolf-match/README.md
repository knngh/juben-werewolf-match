# 本杀匹配 · 剧本杀 / 狼人杀交友

类似 Taste 的**偏好匹配**：根据游戏类型、游玩风格、偏好角色等找到同好，互相点赞即匹配，可查看微信号联系。

## 功能

- **注册/登录**：手机号或微信号 + 密码
- **我的资料**：常玩类型（剧本杀/狼人杀/血染钟楼等）、游玩风格（推理/欢乐/沉浸等）、偏好角色、频率、城市、简介
- **发现**：按偏好相似度推荐用户，左滑跳过、右滑点赞
- **匹配**：互相点赞即匹配，匹配列表可看对方简介与微信号

## 技术栈

- **后端**：Node.js + Express + SQLite + JWT
- **前端**：Vue 3 + Vite + Vue Router + Pinia

## 本地运行

### 后端

```bash
cd backend
cp .env.example .env
npm install
npm start
```

API 默认：`http://localhost:3000`

### 前端

```bash
cd frontend
npm install
npm run dev
```

开发环境已配置代理，前端请求 `/api` 会转发到 `http://localhost:3000`。浏览器打开：`http://localhost:5173`。

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
   例如：`juben-werewolf-match`，不要勾选 “Add a README”等初始化选项。

2. **在本机进入项目目录并推送到新仓库**  

   ```bash
   cd /Volumes/ZGH/程序库/mtxz-all/juben-werewolf-match
   git init
   git add .
   git commit -m "feat: 剧本杀狼人杀交友匹配（Taste 式偏好匹配）"
   git branch -M main
   git remote add origin https://github.com/你的用户名/juben-werewolf-match.git
   git push -u origin main
   ```

   若使用 SSH：

   ```bash
   git remote add origin git@github.com:你的用户名/juben-werewolf-match.git
   git push -u origin main
   ```

3. **若项目当前在 mtxz-all 仓库内**  

   先复制整个 `juben-werewolf-match` 文件夹到仓库外（例如桌面），再在新文件夹内执行上面的 `git init` 和后续命令，这样会形成独立仓库再推送到 GitHub。

## 目录结构

```
juben-werewolf-match/
├── backend/           # API
│   ├── server.js
│   ├── db.js
│   ├── auth.js
│   ├── package.json
│   └── .env.example
├── frontend/          # Vue 3 前端
│   ├── src/
│   │   ├── views/     # 登录、注册、资料、发现、匹配
│   │   ├── stores/
│   │   ├── router/
│   │   └── api.js
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── .gitignore
└── README.md
```

## License

MIT
