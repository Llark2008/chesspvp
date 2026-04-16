# @chesspvp/client

React + Vite + PixiJS 前端。负责大厅、匹配、战斗 HUD 与战场渲染。

## 开发命令

```bash
pnpm --filter @chesspvp/client dev
pnpm --filter @chesspvp/client typecheck
pnpm --filter @chesspvp/client lint
pnpm --filter @chesspvp/client test
```

## 当前功能

- 游客登录与大厅
- 匹配中页面
- 联机战斗页与单机调试页
- PixiJS 战棋渲染
- 地图缩放（滚轮 + HUD 控件）
- 战争迷雾
- 招募、治疗、炮击、结算动画

## 关键目录

```text
src/
├── api/                 HTTP / Socket 封装
├── battle/              PixiJS 渲染层、控制器、资产提供器
├── components/battle/   HUD、面板、弹窗
├── debug/               单机调试 AI
├── pages/               Login / Lobby / Matchmaking / Battle / DebugBattle
└── store/               Zustand 状态
```

## 交互摘要

- 普通单位：侧栏只显示“攻击”
- 牧师：显示“攻击 / 治疗”
- 炮手：显示“炮击”，可直接选择空地中心点
- 主战场支持 `75%`–`150%` 缩放；滚轮以鼠标位置为锚点，侧栏提供 `- / 100% / +` 控件
- 招募面板直接读取共享 `UNITS` 配置

共享规则与协议文档见根目录 [README.md](../../README.md) 和 [design/](../../design/)。
