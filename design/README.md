# 战棋 PVP — 设计文档目录

本目录是项目的**完整设计蓝图**，由 Opus 与用户协作产出，供 Sonnet 实施时按序阅读与执行。

## 核心信息速览

| 项 | 值 |
|---|---|
| 项目 | Web 战棋 PVP（经典回合制 SRPG） |
| 对战 | 实时同步 2 人 PVP |
| 当前范围 | 联机 MVP + 兵种扩展（牧师 / 炮手 / 侦察兵 / 毒师）+ 大地图视口 / 缩放 / 小地图 + 固定维护费经济 + 中毒状态 / 技能冷却 |
| 玩家数 | 每局 2 人 |
| 棋盘 | 配置驱动方格地图；当前默认 `frontier_30` 为 30 × 30，4 方向 |
| 视角 | `768×768` 逻辑主视口 + `WASD` 平移 + 滚轮 / HUD 缩放 + 小地图点击跳转 |
| 每方初始单位 | 3（1 战士 + 1 弓手 + 1 骑士） |
| 人口上限 | 16 |
| 经济 | 单一资源"金币"，基地 +6/回合，资源点 +3/回合，单位固定维护费 |
| 胜负 | 摧毁对方基地 / 投降 / 超时 |
| 每回合时间 | 75 秒 + 每方 300 秒备用（象棋时钟） |
| 战斗计算 | 确定性（无 RNG）+ 8 兵种（含治疗 / AOE / 中毒 / 高视野侦察） |
| 技术栈 | TS 全栈 · React + PixiJS · Fastify + Socket.IO · Postgres + Redis |
| 美术 | MVP 纯色块，预留像素素材替换点 |

## 阅读顺序

| # | 文件 | 内容 |
|---|---|---|
| 00 | [00-overview.md](./00-overview.md) | **总览** — 技术栈 / 架构原则 / monorepo 结构 / 阅读指南 |
| 01 | [01-gameplay-rules.md](./01-gameplay-rules.md) | **游戏规则书** — 棋盘 / 单位 / 战斗 / 经济 / 招募 / 胜负（唯一事实来源）|
| 02 | [02-architecture.md](./02-architecture.md) | **系统架构** — 组件图 / 数据流 / 目录结构 / 环境变量 / Docker |
| 03 | [03-data-model.md](./03-data-model.md) | **数据模型** — Prisma schema / Redis keys / JSON 配置 / 运行时类型 |
| 04 | [04-protocol.md](./04-protocol.md) | **通信协议** — HTTP REST / Socket.IO 事件 / 错误码 / 时序图 |
| 05 | [05-shared-engine.md](./05-shared-engine.md) | **共享规则引擎** — `@chesspvp/shared` 的 BattleEngine 设计 |
| 06 | [06-frontend.md](./06-frontend.md) | **前端设计** — 目录 / 路由 / 状态 / PixiJS 渲染层 / 组件 |
| 07 | [07-backend.md](./07-backend.md) | **后端设计** — 目录 / Auth / Matchmaker / Room / Socket |
| 08 | [08-milestones.md](./08-milestones.md) | **执行里程碑** — M0-M7 逐阶段 TODO（**Sonnet 的实施手册**）|
| 09 | [09-asset-pipeline.md](./09-asset-pipeline.md) | **美术资源** — 纯色块 → 像素素材的切换方案 |
| 10 | [10-acceptance.md](./10-acceptance.md) | **验收标准** — MVP 的功能与非功能清单 |
| 11 | [11-future-extensions.md](./11-future-extensions.md) | **预留扩展点** — 完整产品路线图 / 技术债 |

## 给执行者（Sonnet）的快速启动

1. **先通读** 00 / 01 / 02 / 08 四份，建立全局观
2. 基础实现已完成；新增功能或重构前优先阅读 01 / 04 / 05 / 06
3. 遇到规则不清晰 → **查 01**
4. 遇到类型不清晰 → **查 03 / 05**
5. 遇到协议字段不清晰 → **查 04**
6. 不要跳着做，不要跨 M 修 bug
7. 每个 M 结束跑：`pnpm -r typecheck && pnpm -r lint && pnpm -r test`
8. 当前代码线按 `10-acceptance.md` 的当前版本清单自检

## 给用户（你）的快速导航

- **想改规则/数值** → 01 (游戏规则书) + `packages/shared/src/configs/*.json`
- **想看系统结构** → 02 (架构图)
- **想查数据库字段** → 03 (数据模型)
- **想看消息格式** → 04 (通信协议)
- **想加新功能** → 11 (扩展点，找到对应类别)
- **想验收 MVP** → 10 (验收清单)

## 设计决策摘要

### 为什么选 TypeScript 全栈？
前后端必须共享规则引擎（服务器权威 + 客户端可视化），语言统一最省事。

### 为什么选 PixiJS 而不是 Phaser？
战棋渲染不需要 Phaser 的物理引擎和游戏循环抽象，PixiJS 更轻、更可控、资源切换点更清晰。

### 为什么选 Fastify 而不是 Express？
更快、TypeScript 友好、生态成熟、内置 schema 校验。

### 为什么用 Postgres + Redis 而不是单一 DB？
Postgres 做结构化持久化，Redis 做实时状态（匹配队列、房间快照、会话），分工清晰性能好。

### 为什么战斗是确定性的？
1. PVP 公平性（无 feel-bad RNG）
2. 回放可 100% 复现
3. 服务器权威 + 客户端范围查询 / 回放的一致性检查容易

### 为什么服务器权威？
客户端任何操作都要服务器校验，**本质反作弊**；同时保证双方状态一致。

### 为什么要共享规则引擎？
如果前后端各写一份，会出现"客户端认为能走，服务器认为不能走"的双端不一致噩梦。共享同一份代码是最简单的解。

## 文档维护

- 规则或数值变更 → 同步更新 `01-gameplay-rules.md` 与 `packages/shared/src/configs/*.json`
- 架构变更 → 同步更新 `02-architecture.md`
- 协议 / Action / Event 变更 → 同步更新 `04-protocol.md`、`05-shared-engine.md` 与 `packages/shared/src/protocol/*`
- 前端交互变更（HUD / 动作模式 / 相机 / 小地图 / 面板）→ 同步更新 `06-frontend.md`
- 新里程碑 → 更新 `08-milestones.md`

## 版本

- v1.0 — 2026-04-09 — 初版（MVP 完整设计）
- v1.1 — 2026-04-10 — 同步已实现的牧师 / 炮手、`USE_ABILITY`、显式动作模式与相关验证
- v1.2 — 2026-04-13 — 同步大地图 / 相机 / 小地图、`frontier_40` 默认地图与维护费经济调优
- v1.3 — 2026-04-13 — 同步侦察兵 / 毒师、中毒状态、技能冷却、空地中心技能与对应 HUD / 协议 / 引擎规则
- v1.4 — 2026-04-14 — 同步战场缩放：相机缩放状态、滚轮缩放、HUD 缩放控件与相关前端验收项
- v1.5 — 2026-04-15 — 新增 `frontier_30` 快节奏默认地图，保留 `frontier_40` 作为 40×40 回归 / 对照图
