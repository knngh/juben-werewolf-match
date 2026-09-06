# 选本推荐 MVP 规格

## 目标

首发版先验证一个用户可以独立完成的线上闭环：

`口味测试 -> 结构化剧本库 -> 个性化推荐 -> 剧本详情 -> 打本工具 -> 打卡档案`

这条链路不依赖店家、车源或其他在线用户，适合用内容和小程序工具冷启动。找局、发现同好、匹配能力继续保留，但作为后续承接入口，不承担 MVP 的首要价值证明。

## 页面与接口

| 页面 | 主要接口 | 未登录行为 |
| --- | --- | --- |
| `pages/scripts/index` | `GET /api/scripts`、`GET /api/taste-profile`、`POST /api/scripts/:id/action` | 可浏览、搜索和筛选；匹配度显示为待测试 |
| `pages/taste-test/index` | `GET /api/options`、`GET/POST /api/taste-profile` | 跳转登录，登录后回到测试页 |
| `pages/script-detail/index` | `GET /api/scripts/:id`、`POST /api/scripts/:id/action`、`POST /api/ai/script-explanation` | 可看公开详情；收藏、跳过和 AI 解释需登录 |
| `pages/tools/index` | `GET /api/scripts`、`GET/POST /api/scripts/:id/notes`、`GET/POST /api/play-records` | 登录后使用分幕计时、笔记和打卡 |
| `pages/archive/index` | `GET /api/play-records` | 登录后查看记录、评分和类型偏好 |

## 剧本字段

剧本库首发使用可维护的结构化数据，不伪造 Top200 或全网评分。每本至少包含：

- `title`、`gameType`、`tags`
- `difficulty`、`durationMin`、`minPlayers`、`maxPlayers`
- `highlights`、`warnings`、`description`

首批用 8 本示例数据验证页面、排序和数据闭环；上线前应扩展到 50-100 本可核验内容，再考虑 Top200。

## 推荐规则

规则评分是唯一排序和过滤依据，结果必须可复现并有单元测试：

- 偏好标签命中：每个命中标签增加权重，最多计入两个主要偏好。
- 雷点命中：剧本雷点或标签命中用户避雷项时显著扣分。
- 节奏适配：短局、长时沉浸、节奏紧凑等偏好参与加分。
- 频率适配：高频玩家更适合进阶本，偶尔玩家优先看到入门本。
- 历史行为：收藏相似内容小幅加分，已浏览内容小幅降权，已跳过内容直接过滤。

未完成口味测试时不显示 0% 伪匹配分；登录后完成测试才展示匹配度和推荐理由。

## AI 边界

AI 只做解释和内容辅助，不替用户做决定：

- 输入只包含剧本公开字段、规则产出的理由和口味画像摘要。
- 输出为短说明，不剧透、不提供凶手、真相、核心剧情或联系方式。
- 模型失败、超时或未配置时，详情仍可正常浏览，前端只提示暂时不可用。
- 规则推荐先返回，AI 解释异步按需触发，避免 AI 成为首屏阻塞点。
- 真实评价提取和打后完整复盘放到后续阶段，先解决版权、来源和内容审核问题。

## 验收标准

- 未登录访问 `/api/scripts` 返回完整结构化剧本，`matchScore` 为 `null`。
- 登录并提交口味后，推荐列表至少有一条带正匹配分和理由的剧本。
- 收藏后重新浏览仍保留 `saved` 状态；取消收藏不会删除浏览记录。
- 跳过后列表不再出现该剧本，恢复后重新出现。
- 进入详情后登录用户记录一次 `view`，不影响公开详情展示。
- 打本工具可以调整分幕分钟数、开始/暂停/重置计时，并保存四类结构化笔记。
- 打卡记录至少保存剧本、日期、评分和短评；档案页返回累计次数、平均评分和类型分布。
- AI 能力关闭或调用失败时，详情页不被阻断。
- `node scripts/test-book-recommendation.js`、`npm run smoke:sessions`、`node scripts/smoke-miniprogram.js` 全部通过。

## 下一阶段指标

- 首次推荐进入详情或收藏的点击率不低于 35%。
- 推荐理由“有帮助”反馈不低于 60%。
- 7 日留存不低于 20%。
- 至少 30% 活跃用户完成一次打本记录后，再启动单城市弱匹配试点。
