# 05 - 共享规则引擎（`packages/shared`）

这是**整个项目最关键的包**。服务器用它做权威判定，客户端用它做本地范围查询、离线调试与回放。所有规则必须集中在这里，不得在 `apps/client` 或 `apps/server` 中重复实现。

## 1. 目录结构

```
packages/shared/
├── src/
│   ├── index.ts                   # 统一导出
│   ├── types/
│   │   ├── battle.ts              # BattleState, Unit, Base, Tile, ...
│   │   ├── action.ts              # Action 联合类型
│   │   ├── event.ts               # GameEvent 联合类型
│   │   └── index.ts
│   ├── configs/
│   │   ├── units.json
│   │   ├── maps.json
│   │   ├── balance.json
│   │   └── index.ts               # 导出为强类型常量
│   ├── engine/
│   │   ├── BattleEngine.ts        # 主引擎入口
│   │   ├── abilities.ts           # 技能配置与合法目标计算
│   │   ├── initialState.ts        # 地图 → 初始 BattleState
│   │   ├── validators.ts          # 动作合法性校验
│   │   ├── applyAction.ts         # 动作 → 事件 + 新状态
│   │   ├── pathfinding.ts         # BFS 可达格
│   │   ├── combat.ts              # 伤害公式 + 克制
│   │   ├── economy.ts             # 收入 / 维护费计算
│   │   ├── turn.ts                # 回合切换、回合开始结算
│   │   ├── recruit.ts             # 招募流程
│   │   ├── victory.ts             # 胜负判定
│   │   ├── visibility.ts          # 战争迷雾：可见格计算 + 状态/事件过滤
│   │   └── utils.ts               # 小工具（deepClone, isInBounds, etc.）
│   └── protocol/
│       ├── rest.ts
│       ├── socket.ts
│       └── index.ts
├── tests/
│   ├── engine.test.ts
│   ├── pathfinding.test.ts
│   ├── combat.test.ts
│   ├── recruit.test.ts
│   ├── victory.test.ts
│   ├── replay.test.ts
│   ├── ability.test.ts
│   └── visibility.test.ts
├── package.json
└── tsconfig.json
```

## 2. 核心类型

详见 `03-data-model.md` §5。Action / Event 集合如下。

### 2.1 Action

```typescript
export type Action =
  | { type: 'MOVE'; payload: { unitId: string; to: Position } }
  | { type: 'ATTACK'; payload: { unitId: string; targetId?: string; targetPos?: Position } }
  | { type: 'USE_ABILITY'; payload: { unitId: string; abilityId: string; targetId?: string; targetPos?: Position } }
  | { type: 'RECRUIT'; payload: { unitType: UnitType; spawnAt: Position } }
  | { type: 'END_TURN'; payload: {} }
  | { type: 'SURRENDER'; payload: {} };
```

### 2.2 ValidationResult

```typescript
export type ValidationResult =
  | { ok: true }
  | { ok: false; code: ErrorCode; message: string; details?: unknown };
```

## 3. BattleEngine API

**所有方法都是纯函数风格**（apply 虽然内部会 mutate 一个 draft state，但对外只返回新状态 + 事件，不修改传入的任何对象）。

```typescript
import { BattleState, Action, GameEvent, ValidationResult, PlayerSide } from '../types';

export class BattleEngine {
  private _state: BattleState;

  constructor(initialState: BattleState) {
    this._state = deepClone(initialState);
  }

  get state(): Readonly<BattleState> {
    return this._state;
  }

  /**
   * 校验一个 action 是否合法。不修改状态。
   */
  validate(action: Action, actorSide: PlayerSide): ValidationResult {
    return validateAction(this._state, action, actorSide);
  }

  /**
   * 应用一个 action，内部会：
   *  1. validate
   *  2. 生成事件流
   *  3. 更新 state
   * 返回 { events, newState }
   *
   * 若 validate 失败，抛出 InvalidActionError
   */
  apply(action: Action, actorSide: PlayerSide, nowMs = 0): { events: GameEvent[]; state: BattleState } {
    const v = this.validate(action, actorSide);
    if (!v.ok) throw new InvalidActionError(v);
    const { events, nextState } = applyAction(this._state, action, actorSide, nowMs);
    this._state = nextState;
    return { events, state: nextState };
  }

  /**
   * 计算某单位的可移动格（含终点）
   */
  getMovableTiles(unitId: string): Position[] {
    return computeMovableTiles(this._state, unitId);
  }

  /**
   * 计算某单位的可攻击目标（位置列表，可能包含敌方单位或基地）
   */
  getAttackableTargets(unitId: string, fromPos?: Position): Position[] {
    return computeAttackableTargets(this._state, unitId, fromPos);
  }

  /**
   * 计算某单位某个技能的可选目标位置
   */
  getAbilityTargets(unitId: string, abilityId: string, fromPos?: Position): Position[] {
    return computeAbilityTargets(this._state, unitId, abilityId, fromPos);
  }

  /**
   * 检查胜利。返回 null 代表未结束。
   */
  checkVictory(): { winner: PlayerSide; reason: string } | null {
    return checkVictory(this._state);
  }

  /**
   * 触发回合开始结算（中毒、冷却、金币、招募出兵、维护费）
   * 内部会生成一组事件。
   */
  beginTurn(player: PlayerSide): GameEvent[] {
    const { events, nextState } = beginTurn(this._state, player);
    this._state = nextState;
    return events;
  }

  /**
   * 静态方法：从初始状态 + action 序列重放，返回最终状态 + 完整事件流
   */
  static replay(initialState: BattleState, actions: Array<{ action: Action; actorSide: PlayerSide; nowMs?: number }>): {
    finalState: BattleState;
    events: GameEvent[];
  } {
    const engine = new BattleEngine(initialState);
    const allEvents: GameEvent[] = [];
    for (const { action, actorSide, nowMs } of actions) {
      const { events } = engine.apply(action, actorSide, nowMs ?? 0);
      allEvents.push(...events);
    }
    return { finalState: engine.state as BattleState, events: allEvents };
  }
}
```

## 4. 各模块职责

### 4.1 `initialState.ts`

```typescript
export function createInitialState(matchId: string, mapId: string, playerAId: string, playerBId: string): BattleState;
```

- 读取 `MAPS[mapId]`
- 构造 `tiles[][]`，标记基地格、资源点
- 按 `initialUnits` 生成单位
- 所有初始单位默认带 `status.poisonStacks = 0` 与空 `cooldowns`
- 初始化双方 `PlayerState`（gold=5, reserveTime=300000ms）
- `turnNumber=1, currentPlayer='A', turnDeadline=now+75000`

### 4.2 `validators.ts`

```typescript
export function validateAction(state: BattleState, action: Action, actor: PlayerSide): ValidationResult;
```

内部根据 action type 调用具体校验器。所有校验器返回 `ValidationResult`：

- `validateMove`：单位归属、未行动、终点在 `getMovableTiles` 中
- `validateAttack`：单位归属、未攻击、目标合法、在射程内
- `validateUseAbility`：单位归属、未行动、技能存在、未在冷却、目标在技能合法列表中
- `validateRecruit`：是己方回合、金币足够、人口未满、`source` 是己方基地或己方已占领前哨站、同一 `source` 本回合未下单、`spawnAt` 与来源建筑的合法出生范围匹配
- `validateEndTurn`：是当前玩家
- `validateSurrender`：是对局双方之一

### 4.3 `applyAction.ts`

```typescript
export function applyAction(
  state: BattleState,
  action: Action,
  actor: PlayerSide
): { events: GameEvent[]; nextState: BattleState };
```

- 用 `immer` 或手动 `deepClone` 创建 draft
- 按 action 类型执行变更，同时 push 事件
- 对 `MOVE`：产生 `UNIT_MOVED`；若落点是资源点或前哨站且归属变化，分别追加 `RESOURCE_POINT_CAPTURED` / `OUTPOST_CAPTURED`
- 对 `ATTACK`：
  - 单体单位：产生 `UNIT_ATTACKED` + `UNIT_DAMAGED`/`BASE_DAMAGED` + 可能 `UNIT_KILLED`/`BASE_DESTROYED`
  - `poisoner`：若命中后目标单位存活，再追加 `UNIT_POISON_CHANGED(reason='attack')`
  - 炮手：以 `targetPos` 为中心做 AOE 结算；一次攻击可能产生多个 `UNIT_DAMAGED`
- 对 `USE_ABILITY`：
  - `heal`：产生 `UNIT_ABILITY_USED` + `UNIT_HEALED`
  - `poison_burst`：产生 `UNIT_ABILITY_USED` + 多个 `UNIT_POISON_CHANGED(reason='skill')`，并写入施法者冷却
- 对 `RECRUIT`：扣金币，向 `pendingRecruits[]` 追加带 `source` 的订单，产生 `UNIT_RECRUIT_ORDERED` + `GOLD_CHANGED`
- 对 `END_TURN`：
  1. 产生 `TURN_ENDED`（带已用时间、剩余备用时间）
  2. 切换 `currentPlayer`
  3. 调用 `beginTurn(nextPlayer)` 追加该玩家的"回合开始"事件
  4. 最后追加 `TURN_CHANGED`
- 对 `SURRENDER`：标记 winner，产生 `MATCH_ENDED`

### 4.4 `turn.ts`

```typescript
export function beginTurn(state: BattleState, player: PlayerSide): { events: GameEvent[]; nextState: BattleState };
```

执行顺序（产生事件）：

1. `TURN_BEGAN`
2. 按当前单位数组顺序结算该玩家单位的中毒：
   - `UNIT_DAMAGED`
   - 若死亡则 `UNIT_KILLED`
   - 若存活且层数衰减，则 `UNIT_POISON_CHANGED(reason='turn_tick')`
3. 结算该玩家存活单位的技能冷却（递减到 0 时删除键）
4. 清空该玩家单位的 `hasMoved/hasActed/spawnedThisTurn`
5. 计算收入：基地 6 + 归属资源点数量 × 3 + 归属前哨站数量 × 5 → `GOLD_CHANGED`
6. 依次执行 `pendingRecruits`：
   - 成功 → `UNIT_RECRUITED`
   - 失败 → `UNIT_RECRUIT_FAILED`（含 `source`）+ 退还金币 → `GOLD_CHANGED`
   - 基地来源：按 `spawnAt` 优先，再试其它邻格
   - 前哨站来源：前哨站本格优先，再试 `spawnAt` 与其它邻格
7. 计算当前场上单位总维护费（含刚出生的新单位）→ `GOLD_CHANGED(reason='unit_upkeep')`
8. 若金币不足则钳制到 `0`，不进入负债、不自动裁军
9. 刷新 `turnDeadline = now + 75_000`
10. 重置 `turnNumber++`

**注意**：`beginTurn` 必须被 `applyAction(END_TURN)` 或 `Room` 的超时 handler 触发，不对外直接暴露（但为了测试方便保留 public 接口）。

### 4.5 `pathfinding.ts`

BFS 计算某单位的可移动终点。详见 `01-gameplay-rules.md` §6.3 的伪代码。

```typescript
export function computeMovableTiles(state: BattleState, unitId: string): Position[];
```

关键谓词：

- `canPassThrough(pos, unit, state)`：不越界、非 BLOCKED、非对方单位、非对方基地格
- `canStandOn(pos, unit, state)`：可通过 && 无单位 && 非任何基地格

### 4.6 `combat.ts`

```typescript
export function computeDamage(
  attackerType: UnitType,
  defenderType: UnitType | 'base',
  attackerAtk: number,
  defenderDef: number,
  balance: BalanceConfig
): { damage: number; counterMul: number };
```

```typescript
export function getAttackableTargets(state: BattleState, unitId: string, fromPos?: Position): Position[];
```

- 普通单位返回敌军单位 / 敌方基地位置
- `gunner` 返回射程内所有合法中心格，允许空地
- 调用方在单位受击时必须先计算**有效防御**：`UNITS[unit.type].def + outpostDefenseBonus`
- 前哨站防御加成由 `outposts.ts#getUnitEffectiveDefense` 提供：仅对单位生效，基地不吃加成，多个前哨站覆盖时不叠加

### 4.7 `abilities.ts`

```typescript
export function getAbilityConfig(unitType: UnitType, abilityId: string): AbilityConfig | null;
export function computeAbilityTargets(state: BattleState, unitId: string, abilityId: string, fromPos?: Position): Position[];
```

- 当前已实现 `heal` 与 `poison_burst`
- `poison_burst` 的目标列表返回施法距离内的所有格子，允许空地中心点
- 用于 BattleEngine 查询高亮与 validators 校验

### 4.8 `recruit.ts`

```typescript
export function tryRecruitOrder(state: BattleState, player: PlayerSide, unitType: UnitType, source: RecruitSource, spawnAt: Position): ValidationResult;
export function executePendingRecruit(state: BattleState, player: PlayerSide): { events: GameEvent[]; nextState: BattleState };
```

- `tryRecruitOrder` 检查来源建筑是否合法、是否已占用招募槽、`spawnAt` 是否落在来源建筑允许的出生范围内
- `executePendingRecruit` 在回合开始调用：遍历执行当前玩家的 `pendingRecruits[]`，成功则生成单位，失败则退钱
- `outposts.ts` 还提供：
  - `captureOutpostAt`：处理占领与 `OUTPOST_CAPTURED`
  - `computePlayerOutpostIncome`：统计前哨站收入
  - `getRecruitSourceCandidateTiles`：统一基地/前哨站的出生候选顺序
  - `getUnitOutpostDefenseBonus / getUnitEffectiveDefense`：统一防御光环计算

### 4.9 `victory.ts`

```typescript
export function checkVictory(state: BattleState): { winner: PlayerSide; reason: VictoryReason } | null;
```

按 §9 的优先级检查：`base_destroyed`（通过 base.hp）、`timeout`（通过 reserveTimeMs 与 turnDeadline）、`surrender`（调用方传入）。

### 4.10 `utils.ts`

- `deepClone<T>(v: T): T`：structuredClone 优先，退化到 JSON
- `key(p: Position): string`：`"x,y"`，用于 Map / Set
- `manhattan(a: Position, b: Position): number`
- `get4Neighbors(p: Position): Position[]`
- `isInBounds(p: Position, map: { width, height }): boolean`

### 4.11 `visibility.ts`

战争迷雾的核心逻辑。**不修改 BattleEngine 内部状态**，作为广播边界的过滤层被服务器调用。

```typescript
/**
 * 计算 side 一方当前可见的所有格子（曼哈顿距离视野圆）。
 * 视野来源：己方单位 + 己方基地 + 己方占领的资源点。
 * 前哨站当前不额外提供视野。
 */
export function computeVisibleTiles(state: BattleState, side: PlayerSide): Set<string>;

/** 快速检查某个格子是否在可见集合中 */
export function isTileVisible(visible: Set<string>, pos: Position): boolean;

/**
 * 生成 side 一方的过滤视角状态（用于向客户端下发）：
 * - 删除不可见的敌方单位
 * - 清空敌方 gold / pendingRecruits
 * - 附加 BattleState.fog 字段
 */
export function filterStateForPlayer(state: BattleState, side: PlayerSide): BattleState;

/**
 * 对一次 action 产生的事件列表，按 side 视角过滤。
 * 详细规则见 01-gameplay-rules.md §8.2。
 */
export function filterEventsForPlayer(
  events: GameEvent[],
  side: PlayerSide,
  preState: BattleState,   // action 执行前的完整权威状态
  postState: BattleState,  // action 执行后的完整权威状态
): GameEvent[];
```

**设计约束：**
- `computeVisibleTiles` 不修改状态，可在任意时机安全调用
- 过滤逻辑在服务器广播层执行，引擎内部始终持有完整权威状态
- `BattleState.fog` 字段仅存在于过滤态；引擎自身的 `state` 中无此字段

## 5. 不可变性策略

**选型**：直接用 `immer` 的 `produce(state, draft => { ... })`

理由：
- 代码写起来像 mutation，实际产生新对象
- 结构化相等 → 零成本 deep clone
- 广泛使用、文档好

示例：
```typescript
import { produce } from 'immer';

function applyMove(state: BattleState, action: MoveAction, actor: PlayerSide) {
  const events: GameEvent[] = [];
  const nextState = produce(state, draft => {
    const unit = draft.units.find(u => u.id === action.payload.unitId)!;
    const from = { ...unit.position };
    unit.position = action.payload.to;
    unit.hasMoved = true;
    events.push({ type: 'UNIT_MOVED', payload: { unitId: unit.id, from, to: unit.position, path: [] } });
  });
  return { events, nextState };
}
```

## 6. 确定性与回放

BattleEngine 必须是**确定性**的：
- 无 `Math.random`
- 无 `Date.now()`（时间戳由调用方传入：例如 `turnDeadline` 在构造初始状态时计算，`TURN_ENDED.elapsedMs` 由 Room 层计算后注入事件）
- 无 I/O

**规则**：`BattleEngine.apply` 的函数签名**不读取 Date.now**；所有与时间相关的参数（例如当前时刻）都通过 action 的 payload 或 Room 层提前计算好的字段传入。

→ 这保证了 `BattleEngine.replay(initialState, actions)` 结果一致。

## 7. 错误处理

```typescript
export class InvalidActionError extends Error {
  constructor(public result: Extract<ValidationResult, { ok: false }>) {
    super(result.message);
  }
}
```

`apply` 抛出 `InvalidActionError` 时，调用方（服务器 Room 或离线调试入口）需捕获：
- 服务器：回 `ACTION_REJECTED`
- 客户端：回滚 UI，显示提示

## 8. 配置加载策略

`packages/shared/src/configs/index.ts`：

```typescript
import unitsRaw from './units.json';
import mapsRaw from './maps.json';
import balanceRaw from './balance.json';
import type { UnitConfig, MapConfig, BalanceConfig } from '../types/configs';

export const UNITS: Record<UnitType, UnitConfig> = unitsRaw;
export const MAPS: Record<string, MapConfig> = mapsRaw;
export const BALANCE: BalanceConfig = balanceRaw;
```

**引擎内部永远通过 `UNITS / BALANCE / MAPS` 访问数值**，不硬编码常量。

## 9. 单元测试清单（`tests/`）

### `pathfinding.test.ts`
- 空地图，单位在中心，移动力 3 → 曼哈顿距离 ≤3 的格子全部可达
- 己方单位挡路 → 可穿越但不能停留
- 敌方单位挡路 → 不可穿越
- 基地格 → 不可停留（不论归属）
- 资源点 → 可通过也可停留
- 地图边界 → 不越界

### `combat.test.ts`
- 战士 vs 弓手：伤害 `= floor((8-2)*1.25) = 7`
- 战士 vs 骑士：伤害 `= floor(max(1, 8-4)*0.8) = 3`
- 法师 vs 基地：伤害 `= max(1, 14-5) = 9`（无克制）
- 最低 1 点伤害
- 炮手中心命中与溅射命中分别结算
- 炮手不误伤友军

### `recruit.test.ts`
- 基地 / 前哨站下单成功 → 金币扣除、`pendingRecruits` 正确追加
- 金币不足 → 拒绝
- 人口已满 → 拒绝
- 同一建筑重复下单同一回合 → 拒绝
- 中立 / 敌方前哨站下单 → 拒绝
- `spawnAt` 与来源建筑不匹配 → 拒绝
- 执行阶段：基地来源按邻格回退，前哨站来源按“本格优先、再四邻格”回退
- 执行阶段：全堵死 → 退钱

### `outpost.test.ts`
- 中立前哨站首次被踩即占领；敌方踩上去会立即翻转归属
- 每个已占领前哨站在己方回合开始稳定提供 `+5` 金
- 前哨站光环使单位防御 `+2`；仅作用于所有者单位；基地不吃加成；多前哨覆盖不叠加

### `ability.test.ts`
- 牧师治疗成功，`hasActed=true`
- 满血 / 自疗 / 敌方目标 / 非法目标会被拒绝
- 炮手可轰空地，并分别命中中心 / 溅射

### `victory.test.ts`
- 基地 HP → 0 → 触发 `base_destroyed`
- 投降 → 触发 `surrender`
- 备用时间耗尽 → 触发 `timeout`

### `engine.test.ts`
- 一次完整回合：招募 → 移动 → 攻击 → 结束
- 回合切换后的结算（资源点归属、产金）
- 非法 action 抛出

### `replay.test.ts`
- 构造一个 20 动作的对局
- 用 `BattleEngine.replay` 重放
- `finalState` 应该和原 engine 的 `state` 严格相等（用 JSON 序列化比对）

### `visibility.test.ts`
- 单位位置本身始终在视野内
- 己方基地位置可见
- 占领资源点后该点附近格子可见
- 曼哈顿距离超过 sight 的格子不可见
- A/B 两方视野独立
- `filterStateForPlayer`：己方单位全部保留，迷雾中的敌方单位被删除
- `filterStateForPlayer`：敌方 gold 置零，pendingRecruits 置空，fog 字段正确设置
- `filterEventsForPlayer`：`GOLD_CHANGED` 只发给对应玩家
- `filterEventsForPlayer`：`TURN_BEGAN / MATCH_ENDED` 双方都收到
- `filterEventsForPlayer`：`OUTPOST_CAPTURED` 双方都收到
- `filterEventsForPlayer`：迷雾中的敌方 `UNIT_MOVED` 被过滤
- `filterEventsForPlayer`：己方单位的移动事件始终通过

## 10. 与服务器的集成点

服务器侧 `Room.ts` 对 BattleEngine 的使用：

```typescript
class Room {
  engine: BattleEngine;
  actionLog: Array<{ action: Action; actorSide: PlayerSide; seq: number }> = [];
  eventSeq = 0;

  constructor(initialState: BattleState) {
    this.engine = new BattleEngine(initialState);
  }

  handleAction(userId: string, rawAction: Action) {
    const side = this.getSideByUserId(userId);
    try {
      const { events } = this.engine.apply(rawAction, side);
      events.forEach(e => { e.seq = ++this.eventSeq; });
      this.actionLog.push({ action: rawAction, actorSide: side, seq: this.eventSeq });
      this.broadcastEvents(events);
      this.checkVictory();
    } catch (err) {
      if (err instanceof InvalidActionError) {
        this.rejectAction(userId, err.result);
      } else throw err;
    }
  }
}
```

## 11. 与客户端的集成点

客户端 `battleStore.ts`：

```typescript
interface BattleStoreState {
  engine: BattleEngine;
  // 派生
  selectedUnitId: string | null;
  movableTiles: Position[];
  // actions
  selectUnit(id: string): void;
  requestMove(to: Position): void;
  // ...
}

const movable = engine.getMovableTiles(selectedUnitId);
const attackable = engine.getAttackableTargets(selectedUnitId);
const abilityTargets = engine.getAbilityTargets(selectedUnitId, 'heal');
```

联机模式下，客户端不直接 `engine.apply(action)`；只用共享引擎做：
- 合法移动格查询
- 合法攻击中心格查询
- 合法技能目标查询
- 回放重建

## 12. 不在本包内的东西

- **不含渲染代码**（PIXI / DOM）
- **不含网络代码**（Socket.IO / fetch）
- **不含数据库代码**（Prisma）

这让 `@chesspvp/shared` 可以在 Node 后端、浏览器前端、甚至 Node 测试脚手架下都能纯净地运行。
