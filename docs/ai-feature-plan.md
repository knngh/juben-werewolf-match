# AI 能力引入计划

## 产品定位

AI 只做“辅助组局、辅助表达、辅助运营”，不替代用户做最终决定。

适合引入 AI 的方向：

- 帮用户更快发布一局。
- 帮用户写更合适的申请留言。
- 把匹配理由解释得更自然。
- 帮运营归纳举报、反馈和局质量问题。
- 帮团队看懂近期用户行为和供需缺口。

暂不引入 AI 的方向：

- 不做自动审批申请。
- 不做自动封禁用户。
- 不做 AI 私聊机器人。
- 不让 AI 决定联系方式是否展示。
- 不把微信号、手机号等联系方式发给模型，除非后续有明确脱敏策略和用户授权。

## 优先级

### P13.1 AI 发布局助手

用户输入一句话，比如“周五晚上海静安想组个新手友好狼人杀”，AI 返回结构化建议：

- 标题
- 类型
- 城市/区域
- 日期/时间候选
- 人数范围
- 标签
- 局说明
- 联系方式说明建议

验收：

- 用户必须确认后才会写入发布表单。
- AI 输出字段必须走现有表单校验。
- 输出不能包含棋牌类目。

### P13.2 AI 申请留言助手

基于用户资料和目标局信息，生成一段 60-100 字申请留言。

验收：

- 用户点击“帮我写”后生成草稿。
- 用户可编辑后再发送。
- 不夸大未填写的偏好或可靠度。

### P13.3 AI 匹配理由解释

现有匹配逻辑仍由规则完成，AI 只把规则信号转换成更自然的短说明。

验收：

- 输入只包含规则产出的理由、公开局信息和用户偏好摘要。
- 不输出“系统判定你们很合适”这类过度承诺。
- 无 AI 时继续展示当前规则标签。

### P13.4 AI 举报与反馈归类

对举报详情和局后反馈做辅助分类，方便后续人工查看。

验收：

- 只做风险标签和摘要。
- 不自动封号、自动隐藏、自动拒绝申请。
- 高风险内容只进入人工待处理队列。

### P13.5 AI 运营洞察

基于只读统计数据生成简短日报/周报：

- 哪些城市供给不足。
- 哪些类型局更容易满员。
- 哪些时间段申请率高。
- 举报和反馈集中在哪类问题。

验收：

- 只读取聚合数据。
- 不输出单个用户隐私。
- 可关闭，不影响主流程。

## 技术方案

### 后端优先

所有模型调用都放在后端：

- 小程序不保存模型 Key。
- Web 不保存模型 Key。
- 后端统一做限流、脱敏、日志、错误降级。

建议环境变量：

```bash
AI_ENABLED=false
AI_PROVIDER=
AI_API_KEY=
AI_MODEL=
AI_TIMEOUT_MS=8000
AI_DAILY_LIMIT=200
```

### API 切法

第一批只做结构化小接口，不做通用聊天。

```text
POST /api/ai/session-draft
POST /api/ai/request-message
POST /api/ai/match-explanation
POST /api/ai/report-classification
GET  /api/ai/ops-summary
```

响应继续沿用 `{ code, data, message }`。

### 数据与日志

建议新增轻量日志表：

```text
ai_usage_logs
- id
- user_id
- feature
- input_hash
- output_status
- provider
- model
- latency_ms
- provider_request_id
- prompt_tokens
- completion_tokens
- total_tokens
- cost_credits
- created_at
```

默认不落原始输入和输出，记录 hash、状态、延迟、token 和 provider 成本元数据，降低隐私风险并保留成本观察能力。

### 降级策略

- `AI_ENABLED=false` 时，前端隐藏 AI 按钮。
- 模型超时或失败时，显示“暂时不可用”，不阻断发布/申请。
- AI 输出不直接提交，必须由用户确认。

## 实施顺序

1. 加后端 AI 配置、开关、日志表和 smoke。（已完成基础层）
2. 做 `POST /api/ai/session-draft`，先接发布局助手。（后端 mock 已完成）
3. 小程序发布页增加“帮我填”按钮。（已完成）
4. 做 `POST /api/ai/request-message`。（后端 mock 已完成）
5. 小程序局详情申请区增加“帮我写留言”按钮。（已完成）
6. 做匹配解释，先把规则理由转成可降级短说明。（mock 已完成）
7. 做举报归类和运营摘要，先用 mock 输出复核建议。（mock 已完成）

## 风险

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 模型输出不稳定 | 表单内容错误 | 使用结构化 JSON 和现有校验兜底 |
| 成本失控 | 试用成本上涨 | 默认关闭、限流、记录用量 |
| 隐私泄露 | 用户信任受损 | 不传联系方式，日志不存原文 |
| 错误判断用户 | 社交伤害 | AI 不做审批、封禁、联系方式展示决策 |
| 审核风险 | 小程序审核受阻 | AI 文案作为辅助草稿，用户确认后提交 |

## 已完成基础层

- 后端环境变量：`AI_ENABLED`、`AI_PROVIDER`、`AI_API_KEY`、`AI_MODEL`、`AI_TIMEOUT_MS`、`AI_RETRY_COUNT`、`AI_DAILY_COST_LIMIT`、`AI_DAILY_LIMIT`。
- AI 用量日志表：`ai_usage_logs`。
- 能力查询：`GET /api/ai/capabilities`。
- 能力查询会返回当前用户今日 AI 请求用量、剩余次数、全站今日 cost 用量和剩余成本预算。
- 发布草稿接口：`POST /api/ai/session-draft`。
- 申请留言接口：`POST /api/ai/request-message`。
- 匹配理由解释接口：`POST /api/ai/match-explanation`。
- 举报归类接口：`POST /api/ai/report-classification`。
- 运营摘要接口：`GET /api/ai/ops-summary`。
- 本地 mock provider：`AI_PROVIDER=mock`。
- provider 能力表：未实现供应商不会向前端暴露 ready 功能。
- provider 模块：AI 能力、mock 输出和结构化归一化集中在 `backend/ai.js`。
- OpenRouter provider：`AI_PROVIDER=openrouter` 时走 OpenRouter Chat Completions 兼容接口，默认模型 `openrouter/free`。
- OpenRouter 用量元数据：provider request id、tokens 和 cost credits 会写入 `ai_usage_logs`，并在运营摘要中提供聚合统计。
- 真实供应商预检：`npm run smoke:ai-provider` 可用后端 `.env` 中的 `AI_API_KEY` 做最小结构化联调，输出请求模型、实际路由模型和用量元数据，不打印密钥或生成正文。
- OpenCode Zen provider：`AI_PROVIDER=opencode` 时走 OpenCode Zen OpenAI-compatible Chat Completions 接口，默认模型 `nemotron-3-super-free`，`AI_BASE_URL` 可填 `https://opencode.ai/zen/v1`。
- 临时空响应重试：供应商 HTTP 200 但缺少 `message.content` 时按临时上游异常重试；content 存在但不是合法结构化 JSON 时仍直接失败，避免重复消耗。
- 成本预算可观测：`GET /api/ai/capabilities` 的 `quota` 字段暴露当天请求和 cost 预算消耗，便于按真实调用校准阈值。
- AI 输出归一化：发布草稿、留言、匹配解释、举报归类和运营摘要返回前都会走结构化校验。
- smoke 覆盖 mock 发布草稿、申请留言、匹配解释、举报归类、运营摘要、未实现 provider guard、OpenRouter fake provider、临时失败重试、成本预算拦截、用量记录和结构化异常。

小程序 UI 已接入：

- 发布页增加“AI 帮我填”。
- 申请区增加“AI 帮我写留言”。
- 局详情增加“AI 解读匹配理由”。
- 根据 `GET /api/ai/capabilities` 决定是否显示按钮。

下一步是真实模型供应商完善：

- 用真实 OpenRouter key 做生产前联调。
- 根据首批真实调用校准成本告警阈值。
