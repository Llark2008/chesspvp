# 战棋 PVP

回合制战棋双人对战游戏。当前默认对局地图为 `frontier_30`（30×30），主战场采用 `768×768` 逻辑主视口，支持 `WASD` 滚屏、滚轮 / HUD 缩放与小地图点击跳转。

当前代码线已完成联机 MVP，并额外实现了四种可招募扩展兵种 / 机制：
- `priest`：普通攻击 + 治疗友军
- `gunner`：可轰空地的远程 AOE 炮击
- `scout`：高机动、高视野、低面板的侦察兵
- `poisoner`：普攻叠毒 + 范围施毒技能 `poison_burst`

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + Vite + PixiJS 7 + Zustand + Tailwind CSS |
| 后端 | Node 20 + Fastify 4 + Socket.IO 4 |
| 共享逻辑 | `@chesspvp/shared`（前后端共用规则引擎） |
| 数据库 | PostgreSQL 16 + Prisma 5 |
| 缓存/队列 | Redis 7 + ioredis |
| 认证 | JWT (jose) |
| 工程 | pnpm workspaces + TypeScript 5 + Vitest + ESLint |

## 本地启动

### 前置条件

- Node 20+
- pnpm 9+
- Docker（用于 PostgreSQL + Redis）

### 步骤

```bash
# 1. 克隆并安装依赖
pnpm install

# 2. 启动数据库
docker compose up -d

# 3. 初始化数据库
cp .env.example .env
pnpm --filter @chesspvp/server prisma migrate dev

# 4. 启动开发服务器
pnpm dev
```

前端：`http://localhost:5173`
后端：`http://localhost:3001`

## 运行测试

```bash
pnpm -r typecheck
pnpm -r lint
pnpm -r test
```

## 构建

```bash
pnpm -r build
```

## Demo 流程

1. 打开浏览器 A：`http://localhost:5173` → 游客登录 → 开始匹配
2. 打开浏览器 B（无痕模式）：同样流程
3. 双方自动配对 → 进入战斗
4. 互相移动、攻击 / 治疗 / 炮击 / 招募，摧毁对方基地
5. 结算弹窗 → 返回大厅

### 单机调试（无需后端）

登录后点击"单机调试（对 AI）"可在本地体验完整游戏逻辑，默认同样使用当前大地图配置，并支持牧师治疗、炮手 AOE、毒师施毒与中毒回合结算。

## 验证对局回放

```bash
DATABASE_URL=postgresql://chesspvp:chesspvp@localhost:5432/chesspvp \
  node scripts/verify-replay.js <matchId>
```

## 环境变量

见 `.env.example`。

## 项目结构

```
chesspvp/
├── apps/
│   ├── client/          # React 前端
│   └── server/          # Fastify 后端
├── packages/
│   └── shared/          # 共享规则引擎 + 类型 + 配置
├── design/              # 12 份设计文档
└── scripts/             # 工具脚本
```

## 当前规则摘要

- 当前默认地图：`frontier_30`，30×30，6 个资源点，24 个障碍格，2 个前哨站，1 个基地/方（保留 `frontier_40` 作为 40×40 回归 / 对照图，`mvp_default` 作为 12×12 小图）
- 主战场交互：`768×768` 逻辑主视口，支持 `75%`–`150%` 缩放、`WASD` 平移视角与小地图点击跳转
- 可招募兵种：`warrior`、`archer`、`mage`、`knight`、`priest`、`gunner`、`scout`、`poisoner`
- 当前地形类型：`plain`、`blocked`、`resource`、`outpost`、`base_a`、`base_b`
- 当前经济：初始金币 5，基地 +6/回合，资源点 +3/回合，单位固定维护费，人口上限 16
- 牧师：攻击与治疗二选一，可先移动再治疗
- 炮手：普通攻击为远程 AOE，可直接指定空地中心点
- 侦察兵：6 移动 / 6 视野，但面板很脆，主要承担探路与抢点
- 毒师：普攻命中存活敌军后附加 1 层中毒；`poison_burst` 可对施法距离 1–3 内任意中心格的曼哈顿半径 2 敌军附加 2 层中毒，技能冷却 2 个自己的回合
- 中毒：只作用于单位，不作用于基地；上限 5 层；受害方回合开始先按当前层数扣血，再衰减 1 层

详细规则见 [design/01-gameplay-rules.md](./design/01-gameplay-rules.md)。
