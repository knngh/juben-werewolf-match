# 桌游搭子匹配完整开发计划

## 0. 产品边界

这个应用的主线是“桌游/剧本杀/狼人杀/跑团搭子匹配”，不是店铺系统。

纳入范围：

- 剧本杀
- 狼人杀
- 血染钟楼
- 桌游
- 跑团
- 其他桌游/聚会游戏

明确不纳入：

- 麻将
- 德州扑克
- 象棋
- 围棋
- 扑克
- 泛棋牌类目
- 实体店铺入驻
- 商家后台
- 支付、订单、退款
- 店铺库存/排班

## 1. 当前状态

已完成：

- 用户注册、登录、资料偏好
- 发现同好、点赞、互相匹配
- 找局、发布局、编辑局、局详情
- 申请加入、撤回申请、审批申请、通过后展示联系方式
- 桌游偏好字段：类型、风格、时间、预算、人数、线上/线下
- 会话推荐理由：同城、常玩类型、预算匹配、玩法偏好、人数合适
- 天地图后端代理搜索：`GET /api/geo/search`
- 局地点字段：地址、经度、纬度
- 健康检查：`GET /api/health`
- Demo 数据：`npm run seed:demo`
- 后端 smoke：`npm run smoke:sessions`

当前推进位置：

- `Plan 0` 已完成。
- `Plan 1-8` MVP 已完成。
- `Plan 9` 小程序主端正在推进。

## 2. 总体架构决策

- 继续使用单仓库结构：`backend/` Express API，`frontend/` Vue 3。
- 继续使用 SQLite 作为 MVP 数据库，先用 `ensureColumn` 兼容本地数据演进。
- API 保持 `{ code, data, message }` 响应格式。
- 地图 Key 只在后端 `.env`，前端只访问应用 API。
- 联系方式只在互相匹配或申请通过后展示。
- 所有“局”都由普通用户发起，不引入店铺主体。

## 3. 执行顺序

```text
Plan 0 工程基线
  -> Plan 1 账号与资料 onboarding
  -> Plan 2 找局核心体验加固
  -> Plan 3 地点与时间匹配
  -> Plan 4 申请/审核体验增强
  -> Plan 5 社交信任与安全
  -> Plan 6 通知与活动动态
  -> Plan 7 数据运营与维护
  -> Plan 8 上线准备
```

每个 Plan 完成后都要跑：

- `cd backend && npm run smoke:sessions`
- `cd frontend && npm run build`

涉及 demo 数据时加跑：

- `cd backend && npm run seed:demo`

## Plan 0: 工程与产品基线

状态：已完成。

目标：后续开发必须有清晰边界、可验证环境和可重复 demo 数据。

任务：

- P0.1 写明产品边界，锁定桌游搭子方向。
- P0.2 增加 `/api/health`，输出数据库、地图配置和产品范围。
- P0.3 增加 `.env` 读取和 `.env.example`。
- P0.4 增加 `seed:demo`，生成演示账号和演示局。
- P0.5 smoke 覆盖健康检查、天地图代理、找局完整链路。

验收：

- `/api/health` 返回 `status: ok`。
- Demo 账号可登录并看到演示局。
- 真实 Key 不出现在 git 可跟踪文件里。

验证：

- `npm run smoke:sessions`
- `npm run seed:demo`
- `npm run build`

## Plan 1: 账号与资料 Onboarding

状态：MVP 已完成。

目标：新用户注册后能快速变成“可匹配”的用户。

已完成：

- P1.1 `/api/me` 返回 `profileCompleteness`。
- P1.2 资料页展示完整度和缺失项。
- P1.3 找局页对资料未完整用户提示去完善。
- P1.4 登录后根据资料完整度跳转到资料页或找局页。
- P1.5 资料页提供“新手推荐”快速填充。
- P1.6 发现页在资料缺失时显示补资料入口。

验收：

- 新注册用户能清楚知道还缺哪些资料。
- 完整资料后，找局和发现页推荐理由更稳定。
- 资料保存后 Pinia 用户状态同步更新。

主要文件：

- `backend/server.js`
- `frontend/src/stores/user.js`
- `frontend/src/views/Profile.vue`
- `frontend/src/views/Sessions.vue`
- `frontend/src/views/Discover.vue`
- `frontend/src/views/Login.vue`
- `frontend/src/views/Register.vue`

## Plan 2: 找局核心体验加固

状态：MVP 已完成。

目标：把“找局”做成主路径，用户能高效发布、筛选、申请和管理。

任务：

- P2.1 我的局中展示发布局的待审核/已通过/已拒绝数量。
- P2.2 我的局卡片增加“编辑”“查看申请”快捷入口。
- P2.3 局详情的申请列表展示申请人偏好摘要和可靠度。
- P2.4 申请人通过后，我的申请列表展示清晰的联系方式区块。
- P2.5 发布/编辑局时，对当前人数、已通过人数、目标人数给出前端提示。

验收：

- 局主不进入详情也能看出哪些局需要处理。
- 局主能基于申请人偏好决定是否通过。
- 非局主仍不能编辑或审批。

主要文件：

- `backend/server.js`
- `backend/scripts/smoke-sessions.js`
- `frontend/src/views/MySessions.vue`
- `frontend/src/views/SessionDetail.vue`
- `frontend/src/views/CreateSession.vue`

## Plan 3: 地点与时间匹配

状态：MVP 已完成。

目标：让用户更容易找到“附近、合适时间、合适预算”的局。

任务：

- P3.1 地点搜索结果增强：城市 fallback、地址展示、坐标保存后的可读提示。
- P3.2 找局页增加时间快捷筛选：今天、明天、本周末、未来 7 天。
- P3.3 找局页增加“附近 20km”筛选。
- P3.4 会话推荐打分加入距离和日期临近度。
- P3.5 Demo 数据包含不同地点和时间段。

验收：

- 用户能按时间快捷筛选。
- 有坐标的局可优先展示附近结果。
- 没坐标的局仍能按城市正常展示。

主要文件：

- `backend/server.js`
- `backend/db.js`
- `backend/scripts/seed-demo.js`
- `frontend/src/views/Sessions.vue`
- `frontend/src/views/CreateSession.vue`

## Plan 4: 申请与审核体验增强

状态：MVP 已完成。

目标：把申请加入从“能用”提升到“好判断、好处理”。

任务：

- P4.1 申请时可选择自己的确定性：确定参加、待确认、想先沟通。
- P4.2 申请列表按待审核优先排序，并显示申请时间。
- P4.3 局主审批后可看到已通过成员列表。
- P4.4 已满员时自动关闭申请入口，并给出明确文案。
- P4.5 审批通过/拒绝后的按钮状态避免重复操作。

验收：

- 局主能快速处理申请。
- 申请人能知道自己的申请状态。
- 满员、取消、已关闭状态下申请入口行为一致。

主要文件：

- `backend/db.js`
- `backend/server.js`
- `backend/scripts/smoke-sessions.js`
- `frontend/src/views/SessionDetail.vue`
- `frontend/src/views/MySessions.vue`

## Plan 5: 社交信任与安全

状态：MVP 已完成。

目标：降低鸽局、骚扰、低质量匹配风险。

任务：

- P5.1 增加拉黑用户：被拉黑者不再出现在发现/申请互动中。
- P5.2 增加举报入口：先记录举报，不做复杂审核后台。
- P5.3 增加局后反馈：准时、友好、适合再约。
- P5.4 用户资料展示可靠度摘要，先用局后反馈聚合。
- P5.5 smoke 覆盖拉黑后的发现/申请限制。

验收：

- 用户能阻断不想互动的人。
- 联系方式暴露后仍有基础安全闭环。
- 信任信息不影响新用户基础使用。

主要文件：

- `backend/db.js`
- `backend/server.js`
- `frontend/src/views/Discover.vue`
- `frontend/src/views/Matches.vue`
- `frontend/src/views/SessionDetail.vue`

## Plan 6: 通知与活动动态

状态：MVP 已完成。

目标：用户不用反复刷新，也能知道申请和审批变化。

任务：

- P6.1 增加通知表：申请、通过、拒绝、局状态变化。
- P6.2 增加通知 API：列表、未读数、标记已读。
- P6.3 底部导航和我的页展示通知入口/未读提醒。
- P6.4 申请/审批/取消局时写入通知。
- P6.5 本阶段只做站内通知，后续再接微信模板消息或推送。

验收：

- 申请人能看到审批结果通知。
- 局主能看到新申请通知。
- 通知不会暴露未授权联系方式。

主要文件：

- `backend/db.js`
- `backend/server.js`
- `frontend/src/App.vue`
- `frontend/src/views/MySessions.vue`
- `frontend/src/views/Profile.vue`

## Plan 7: 数据运营与维护

状态：MVP 已完成。

目标：让项目可维护、可排查，不做商家后台。

任务：

- P7.1 增加只读运营统计 API：用户数、开放局数、待审核申请数、举报数。
- P7.2 增加数据库备份脚本：`npm run backup:db`。
- P7.3 增加生产 smoke 脚本：`npm run smoke:prod`。
- P7.4 增加数据清理脚本：`npm run cleanup:expired`。
- P7.5 README 增加常用运维命令。

验收：

- 能快速判断服务是否健康。
- 能备份本地/生产 SQLite。
- 过期局不会长期污染找局列表。

主要文件：

- `backend/scripts/`
- `backend/server.js`
- `README.md`

## Plan 8: 上线准备

状态：MVP 已完成。

目标：准备真实用户可用版本。

任务：

- P8.1 配置生产环境变量清单：`PORT`、`JWT_SECRET`、`DB_PATH`、`TIANDITU_KEY`。
- P8.2 写部署步骤：后端启动、前端构建、反向代理。
- P8.3 写回滚步骤：代码回滚、数据库备份恢复。
- P8.4 做发布前检查表：安全、隐私、核心路径、移动端。
- P8.5 最终 smoke 覆盖注册、补资料、找局、发布、申请、审批、联系方式和新能力。

验收：

- 新机器能按文档部署。
- 出问题能回滚。
- 核心用户路径上线前可重复验证。

主要文件：

- `README.md`
- `docs/`
- `backend/scripts/`

## 4. 每次开发的固定检查

修改后至少执行：

```bash
cd backend
npm run smoke:sessions

cd ../frontend
npm run build
```

如果改了 demo 或本地数据：

```bash
cd backend
npm run seed:demo
```

如果改了环境配置：

```bash
curl http://127.0.0.1:3000/api/health
```

## 5. 当前推荐下一步

进入真实用户试用前，建议做一次移动端手动验收：

1. 用 `demo_joiner / 123456` 登录。
2. 浏览找局、申请加入、查看通知。
3. 用 `demo_creator / 123456` 登录。
4. 审批申请，确认通知和联系方式展示。
5. 验证举报、拉黑、局后反馈入口。

## Plan 9: 微信小程序主端

状态：首版已完成。

目标：把正式用户端迁移到微信小程序，Web 端保留为调试和 H5 备份。

任务：

- P9.1 新增 `miniprogram/` 原生微信小程序工程。
- P9.2 小程序请求封装复用现有 Express API，不改变后端契约。
- P9.3 小程序找局页：筛选、附近 20km、匹配理由、详情入口。
- P9.4 小程序发布/编辑页：类型、地点、时间、人数、预算、标签、联系方式说明。
- P9.5 小程序局详情页：申请、审批、联系方式、举报、拉黑、局后反馈。
- P9.6 小程序我的局、通知、我的资料页。
- P9.7 增加小程序静态 smoke，检查页面注册、文件完整性、API 封装和敏感 key。

验收：

- 微信开发者工具能打开 `miniprogram/`。
- 本地后端启动后，小程序能完成登录、找局、发布、申请、审批、通知流程。
- 小程序端不包含天地图 Key。
- `node miniprogram/scripts/smoke-miniprogram.js` 通过。

主要文件：

- `miniprogram/app.json`
- `miniprogram/config.js`
- `miniprogram/utils/api.js`
- `miniprogram/pages/**`

## Plan 10: 小程序真实试用能力

状态：开发中。

目标：补齐真实微信环境试用前的账号和提醒能力，不引入店铺、支付或棋牌类目。

任务：

- P10.1 后端新增微信小程序登录：`POST /api/wechat/login`。
- P10.2 用户表追加小程序 openid/session_key/最近登录字段。
- P10.3 本地 smoke 支持 `WECHAT_LOGIN_DEV_MODE=true` 模拟微信登录。
- P10.4 小程序登录页接入 `wx.login`，同时保留密码登录兜底。
- P10.5 后端新增通知偏好 API：`GET/POST /api/notification-preferences`。
- P10.6 小程序我的页增加提醒设置和 `wx.requestSubscribeMessage` 入口。
- P10.7 文档补充微信 AppID/Secret、订阅模板 ID、合法域名和本地/生产注意事项。

验收：

- 未配置微信 AppID/Secret 且未开启 dev mode 时，微信登录返回明确错误。
- dev mode 下 smoke 能创建并复用小程序用户。
- 小程序端不包含微信 Secret 或天地图 Key。
- 订阅模板 ID 未配置时，小程序不误发订阅请求。
- `npm run smoke:sessions`、`npm run build`、`node miniprogram/scripts/smoke-miniprogram.js` 通过。

主要文件：

- `backend/db.js`
- `backend/server.js`
- `backend/scripts/smoke-sessions.js`
- `miniprogram/config.js`
- `miniprogram/pages/login/index.*`
- `miniprogram/pages/profile/index.*`
