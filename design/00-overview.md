# 00 - 总览

## 项目定位

一款面向 Web 浏览器的**实时同步对战战棋游戏 (SRPG PVP)**。双方玩家在一张**配置驱动的大地图**上控制各自单位，通过移动、攻击、占领资源点、招募新兵等操作，以**摧毁对方基地**为最终胜利条件。当前默认对战地图为 `frontier_30`（30×30），客户端采用 `768×768` 逻辑主视口、`WASD` 相机、滚轮 / HUD 缩放与平铺小地图。

## 设计边界

- **当前阶段**：联机 MVP 已完成，并已实现四种扩展兵种：`priest`（治疗）、`gunner`（AOE 炮击）、`scout`（高机动侦察）与 `poisoner`（中毒 / 范围施毒）；默认战场当前为 `frontier_30` 快节奏地图，保留 `frontier_40` 作为 40×40 回归 / 对照图，并接入 `768×768` 逻辑主视口、`WASD` 滚屏、滚轮 / HUD 缩放、小地图、固定维护费经济、中毒状态与技能冷却。
- **当前版本仍未做但架构必须预留**：正式账号系统、ELO 天梯、好友、战报回放播放器、运营后台、地图编辑器、多种游戏模式、完整技能编辑器。
- **美术**：MVP 用纯色块 + 文字（`PrimitiveAssetProvider`），预留素材替换点，后续接入 2D 像素 spritesheet（`PixelAssetProvider`），**除了替换 Provider，其它代码不应改动**。

## 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 语言 | TypeScript | 全栈统一，前后端共享类型 |
| 前端框架 | React 18 + Vite | 负责大厅、账号、HUD 等 UI |
| 战斗渲染 | PixiJS 7 | Canvas 2D 战棋渲染，支持纯色块/像素双模式 |
| 前端状态 | zustand | 轻量，够用 |
| 前端样式 | Tailwind CSS | HUD 快速成型 |
| 路由 | react-router v6 | |
| 后端框架 | Fastify 4 | 快于 Express，原生 TS 友好 |
| 实时通信 | Socket.IO 4 | 自带房间、断线重连基础设施 |
| 数据库 | PostgreSQL 16 | 账号、战报、天梯等持久化数据 |
| ORM | Prisma 5 | |
| 缓存 / 房间状态 | Redis 7 (ioredis) | 匹配队列、会话、房间实时状态 |
| 鉴权 | JWT (jose) | 游客即颁发，升级正式账号零改动 |
| 日志 | pino | |
| 测试 | vitest | 前后端共用 |
| 代码规范 | ESLint + Prettier | |
| 部署 | Docker Compose | 一键起 client / server / postgres / redis |
| 包管理 | pnpm + workspaces | Monorepo |

## 为什么是这个技术栈

1. **TS 全栈**：`packages/shared` 里的**战棋规则引擎**需要前后端同时运行（服务器权威校验 + 客户端查询范围 / 离线调试），必须语言统一。
2. **Fastify + Socket.IO**：Fastify 提供 REST + Socket.IO 接管实时层，分工清晰；Socket.IO 的自动重连、ack 机制对战棋断线重连非常友好。
3. **PixiJS**：战棋渲染不需要 3D 引擎，PixiJS 成熟稳定、性能足够、API 简洁、资源替换点清晰。
4. **Prisma + Postgres + Redis**：业界最主流搭配，Sonnet 熟悉、资料丰富、踩坑少。

## Monorepo 结构

```
chesspvp/
├── package.json                 pnpm workspace root
├── pnpm-workspace.yaml
├── docker-compose.yml           本地开发：postgres + redis
├── .env.example                 环境变量模板
├── design/                      本设计文档
├── apps/
│   ├── client/                  前端 (React + Vite + PixiJS)
│   └── server/                  后端 (Fastify + Socket.IO)
└── packages/
    ├── shared/                  共享类型 + 规则引擎 + 协议 + 配置 JSON
    └── config/                  共享 ESLint / TS / Prettier 配置
```

## 架构核心原则

1. **服务器权威 (Server Authoritative)**
   - 客户端只发送"意图 Action"（我想把 U3 从 (4,5) 移到 (5,5)）。
   - 服务器校验 + 模拟 + 广播结果事件。
   - 客户端不能通过篡改本地状态作弊。

2. **前后端共享规则引擎**
   - `packages/shared/engine/BattleEngine` 是**唯一事实来源**。
   - 服务器：权威执行。
   - 客户端：本地范围查询 + 可视化 + 可离线对 AI 单机跑（调试用）。

3. **确定性（Deterministic）**
   - 战斗无 RNG。
   - 同一个 `initialState + actions[]` 必定产生同一个 `finalState`。
   - 直接支持**战报回放**与**断线重连后状态重建**。

4. **事件驱动的状态变更**
   - 每个 Action 产生一组 `Event`（`UNIT_MOVED`、`UNIT_DAMAGED`、`BASE_DESTROYED`…）。
   - 客户端消费事件做动画；服务器广播事件给双方。
   - 事件带递增 `seq`，支持断线后拉取丢失段。

5. **数据驱动**
   - 单位、地图、数值平衡参数全部放 JSON 配置（`packages/shared/configs/*.json`）。
   - 调数值、加普通兵种优先走配置。
   - 若新增会改变结算或交互的新能力，必须同步 shared / protocol / client 文档与代码。

6. **为完整产品预留**
   - 账号表字段、路由版本 (`/api/v1`)、角色字段 (`role`)、天梯表、好友表、回放表**第一天就建好**，MVP 不写入但不堵路。

## 阅读顺序

| 文件 | 内容 | 目标读者 |
|---|---|---|
| `00-overview.md` | 本文件。总览 + 技术栈 | 所有人 |
| `01-gameplay-rules.md` | 游戏规则书（棋盘、单位、战斗、胜负） | 策划、前后端 |
| `02-architecture.md` | 系统架构图 + monorepo 详细结构 | 架构、后端 |
| `03-data-model.md` | PostgreSQL 表 + Redis key + 配置 JSON | 后端 |
| `04-protocol.md` | HTTP REST + Socket.IO 消息协议 | 前后端 |
| `05-shared-engine.md` | `packages/shared` 规则引擎设计 | 前后端 |
| `06-frontend.md` | 前端目录、页面、组件、PixiJS 渲染 | 前端 |
| `07-backend.md` | 后端目录、模块、房间、匹配 | 后端 |
| `08-milestones.md` | **执行里程碑（Sonnet 按序实现）** | Sonnet |
| `09-asset-pipeline.md` | 纯色块 → 像素素材切换方案 | 前端 |
| `10-acceptance.md` | MVP 验收标准 | 所有人 |
| `11-future-extensions.md` | 完整产品预留扩展点清单 | 所有人 |

## 给执行者（Sonnet）的总体提示

- **严格按 `08-milestones.md` 的顺序推进**，每个里程碑独立验收。
- **不要跳级**。M1 的规则引擎不完整就别动 M3 的实时对战，否则双端不一致会灾难性难调。
- 每个里程碑完成后**跑一次 `pnpm -r test` 与 `pnpm -r typecheck`**。
- 遇到规则不清晰，**先读 `01-gameplay-rules.md`**，再看不清晰再问。
- **不要在代码里写死任何可被配置化的值**（伤害系数、价格、地图大小……），否则违反"数据驱动"。
- **不要实现超出 MVP 范围的功能**，但不能把扩展路堵死（见 `11-future-extensions.md`）。
