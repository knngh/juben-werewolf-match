# 上线检查清单

## 环境变量

- `PORT`
- `JWT_SECRET`
- `DB_PATH`
- `TIANDITU_KEY`
- `TIANDITU_SEARCH_URL`
- `WECHAT_MINIPROGRAM_APPID`
- `WECHAT_MINIPROGRAM_SECRET`
- `WECHAT_CODE2SESSION_URL`
- `AI_ENABLED`
- `AI_PROVIDER`
- `AI_API_KEY`
- `AI_MODEL`
- `AI_BASE_URL`
- `AI_SITE_URL`
- `AI_APP_TITLE`
- `AI_TIMEOUT_MS`
- `AI_RETRY_COUNT`
- `AI_DAILY_LIMIT`

## 部署步骤

1. 后端安装依赖：`cd backend && npm install`
2. 配置后端 `.env`
3. 前端构建：`cd frontend && npm install && npm run build`
4. 部署 `frontend/dist`
5. 启动后端：`cd backend && npm start`
6. 反向代理 `/api` 到后端服务

## 发布前验证

```bash
cd backend
npm run smoke:sessions
npm run smoke:prod

cd ../frontend
npm run build
```

手动检查：

- 注册
- 登录
- 完善资料
- 找局
- 发布局
- 申请加入
- 审批申请
- 通过后查看联系方式
- 通知未读数
- 举报/拉黑入口

## 备份与回滚

发布前备份：

```bash
cd backend
npm run backup:db
```

代码回滚：

1. 回到上一版本代码。
2. 重新安装依赖。
3. 重启后端。
4. 重新部署上一版前端 `dist`。

数据库回滚：

1. 停止后端。
2. 用 `backend/backups/` 中的备份覆盖当前 `DB_PATH`。
3. 启动后端。
4. 执行 `npm run smoke:prod`。

## 日常维护

```bash
cd backend
npm run cleanup:expired
npm run backup:db
```
