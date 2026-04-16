# 11 - 为完整产品预留的扩展点

本文件列出所有 MVP **不做但不堵路**的功能，Sonnet 在实现 MVP 时需确保这些扩展点**未被意外堵死**。

## 扩展清单

| 特性 | 依赖模块 | MVP 预留情况 | 未来实施建议 |
|---|---|---|---|
| 邮箱注册/登录 | `users` 表 | `email / password_hash` 字段已建；`is_guest` 布尔；`/auth/register/login` 路由返回 501 | 实现路由内部逻辑，更新 is_guest=false |
| 游客转正式账号 | `users` 表 | 同上 | 一条 SQL 更新即可 |
| 社交登录（OAuth） | 新表 `user_providers` | 暂未建，但 User 表独立可扩展 | 新增关联表，加路由 |
| ELO 天梯 | `rankings` 表 | 表已建，字段齐全；`rating=1000` 默认 | 对局结束 hook 中加 `updateElo(winnerId, loserId)` |
| 排行榜 | `rankings` 表 | 同上 | 加 `GET /rankings?limit=100` 路由 |
| 赛季 | `rankings.season_id` | 字段已建 | 定时任务重置 season |
| 好友系统 | `friendships` 表 | 表已建 | 加 `/friends/*` 路由 + 前端页面 |
| 邀请对战 | Socket `INVITE_*` 事件 | 无 | 新增事件 + 房间创建时传入 "private=true" |
| 聊天 | 新表 `messages` 或 Redis 流 | 未预留表 | 房间内 socket 加 `CHAT_SEND/RECV`，历史消息可选写 DB |
| 战报列表 | `matches` 表 | 数据齐全 | 加 `GET /me/matches?page=1` 分页路由 |
| 战报回放播放器 | `match_replays` 表 + `BattleEngine.replay` | 数据齐全；引擎支持 replay；`ReplayPage.tsx` 已占位 | 实现播放器：时间轴 + 步进 + 暂停；复用 BattleScene |
| 观战模式 | Room + Socket | `Room` 支持广播到 room，未限制只有 2 个 socket | 新增 "spectator" 角色，加入房间只读取事件 |
| 更多地图 | `maps.json` | 配置驱动；可直接加条目 | 加配置 + 大厅地图选择 UI |
| 多游戏模式 | BattleEngine 构造参数 | 可加 `modeConfig` 字段 | 在 `BattleState` 加 `mode`，引擎分支判断 |
| 新兵种 | `units.json` + 前端 HUD/渲染 | 基础数值型兵种配置驱动；当前已接入 `priest` / `gunner` / `scout` / `poisoner` | 普通数值兵优先只改配置；若有新能力种类，同步补 shared / protocol / client |
| 技能系统 | `AbilityConfig` + `USE_ABILITY` + `applyAction` | 已有通用能力层，当前能力为 `heal` 与 `poison_burst`，并带单位冷却与状态层 | 继续扩展 `AbilityConfig.kind`，补 validators / events / HUD |
| 地形效果 | `Tile.effect` 字段 | 未预留，但 tiles 数组结构灵活 | 加字段 + 在 combat/pathfinding 分支 |
| ~~战争迷雾~~ | `BattleState.fog` | **✅ 已实现** | `visibility.ts` 计算视野，`Room.ts` 逐玩家过滤广播，客户端 `FogRenderer` 渲染遮罩 |
| AI 托管（掉线顶替） | 房间 | 未实现 | 掉线后宽限期内自动走最简 AI |
| 运营后台 | `apps/admin` | 未创建；`role='admin'` 已预留 | 新建子应用 + `/admin/*` 路由 |
| 配置热更新 | 配置文件 | MVP 编译期打包 | 改为服务器运行时读 DB / Redis，前端通过 `GET /configs/*` |
| 监控 | pino 日志 | 结构化日志已就绪 | 加 OpenTelemetry / Prometheus exporter |
| 反作弊升级 | 服务器权威 | 基线已做 | 加行为分析、速率限制、封号系统 |
| 多进程水平扩展 | Socket.IO | 单进程 | 加 `@socket.io/redis-adapter` + sticky session |
| 异地多活 | 数据库 | 单库 | Postgres 流复制 + Redis 集群 |
| 移动端触控 | 前端 | 未优化 | 重写 `InputController`；可能要换布局 |
| 国际化（英文等） | 文案 | 建议 MVP 就用 i18n 字典 | 加 `en.ts`，引入 i18next |
| 音效与 BGM | 前端 | 未预留 | 加 `SoundManager` + Howler.js |
| 像素素材 | `PixelAssetProvider` | 接口已定义 | M7 实现 |
| 3D 化 | 渲染层 | PixiJS 2D 为主 | 重写 BattleScene 为 Three.js；其余代码不动 |

## 关键的"不要做的事" —— MVP 中要避免的陷阱

### ❌ 不要在 BattleEngine 里引入 RNG
否则回放失效。所有"随机性"如果有一天要加，必须通过 **seed + 伪随机数生成器**（例如 mulberry32），seed 从 `Match.seed` 字段读取。

### ❌ 不要在规则里硬编码数值
会导致"改个数值要重新编译引擎"。所有数值 → `configs/*.json`。

### ❌ 不要让客户端直接修改 `engine.state`
会导致服务器/客户端状态漂移。只能通过 `engine.apply` 间接变更。

### ❌ 不要把业务逻辑塞进 socket handler
socket 只负责收发 + 路由到 Room 方法。业务都在 Room / BattleEngine 里。

### ❌ 不要跳过 Prisma migration
所有 schema 变更都通过 migration。否则 DB 状态会漂。

### ❌ 不要把 Room 状态只存内存
存内存但**同时快照到 Redis**，这样服务器重启后可以恢复（虽然 MVP 不实现恢复，但 Redis 里有快照对调试极有帮助）。

### ❌ 不要跳过 `api/v1` 前缀
加一遍很便宜，未来升级协议时有救。

### ❌ 不要直接从后端返回 Prisma 对象
用 `mapUserDto / mapMatchDto` 等函数做 DTO 转换。防止意外泄露敏感字段（如 `password_hash`）。

### ❌ 不要在多个地方重复 hardcode 兵种信息
显示名优先来自 `UNITS[type].displayName`；色块模式下颜色/缩写集中在 `PrimitiveAssetProvider` 一处维护。

## 扩展点的优先级（MVP 之后建议顺序）

**阶段 1 — 可玩性提升（2-4 周）**
1. M7 像素素材
2. M11 回放播放器
3. 音效与 BGM
4. 首屏、加载、Loading 体验打磨

**阶段 2 — 账号与社交（2-3 周）**
1. M8 邮箱注册/登录
2. M10 好友系统
3. 邀请对战

**阶段 3 — 竞技性（2-3 周）**
1. M9 ELO + 排行榜
2. 赛季与奖励
3. 观战

**阶段 4 — 内容扩充（持续）**
1. 新地图
2. 更多能力种类
3. 新兵种
4. 地形效果

**阶段 5 — 运营化（2-4 周）**
1. M12 运营后台
2. 配置热更新
3. 监控告警
4. 反作弊

## 技术债追踪

MVP 完成后预计会留下的技术债（提前记录，方便后续偿还）：

1. **前端无乐观更新**：动作提交后等服务器 echo，延迟约 1 RTT。后期可加乐观更新 + 回滚。
2. **单进程部署**：并发上限 ~1000 场。达到上限前要做多进程 + Redis adapter。
3. **无压力测试**：MVP 未跑压测，不知道真实瓶颈。
4. **Matchmaker 简陋**：FIFO 无 ELO 考量，无地区考量。
5. **无反作弊速率限制**：同一用户短时间大量 action 无限流。
6. **无观战**：Room 设计支持但未实现。
7. **前端错误恢复弱**：网络抖动时 UX 仅 Toast。
8. **无回放 UI**：数据有，播放器没做。

## 给 Sonnet 的一句话

> MVP 追求"能跑完整流程"，但架构上要有**为 10 倍未来需求预留的余量**。代码尽量写成可扩展的、但**不要提前实现扩展**。
