# 01 - 游戏规则书

本文件是**游戏规则的唯一事实来源**。代码实现必须严格对齐本文件。规则冲突时，以本文件为准。

当前版本已在原始 MVP 基线之上，实装了：
- 兵种 `priest`
- 兵种 `gunner`
- 兵种 `scout`
- 兵种 `poisoner`
- 通用动作 `USE_ABILITY`
- 前端显式动作模式（攻击 / 技能）
- 单位状态 `poison`
- 技能冷却 `cooldowns`
- 前哨站 `outpost`

## 1. 棋盘

- **形状**：方格，尺寸由 `packages/shared/src/configs/maps.json` 决定。当前默认对战地图 `frontier_30` 为 **30 × 30**（共 900 格）；保留 `frontier_40` 作为 40 × 40 回归 / 对照图，`mvp_default` 作为 12 × 12 回归 / 调试小图
- **坐标系**：`x ∈ [0, width - 1]`，`y ∈ [0, height - 1]`，`(0, 0)` 位于左上角
- **移动方向**：4 方向（上下左右），**不能斜向移动**
- **距离度量**：曼哈顿距离 `|dx| + |dy|`（用于移动、射程判断）
- **格子类型**：
  - `PLAIN`（平地）：可通行，无特殊效果
  - `BLOCKED`（障碍）：不可通行；当前默认地图 `frontier_30` 实际使用
  - `RESOURCE`（资源点）：可通行，可被占领，被己方单位站上结算时归属己方
  - `OUTPOST`（前哨站）：可通行，可被占领，可作为招募来源，并提供局部防御光环
  - `BASE_A` / `BASE_B`（基地格）：本方单位可通过，对方单位无法进入（基地本身占据该格）
- **当前默认对战地图**（`maps.frontier_30`）：
  - 尺寸：30×30
  - `BASE_A` 位于 `(4, 15)`，`BASE_B` 位于 `(25, 15)`
  - 6 个 `RESOURCE` 点：上环 `(10,10)`、`(19,10)`；中轴 `(13,15)`、`(16,15)`；下环 `(10,20)`、`(19,20)`
  - 2 个 `OUTPOST` 点，位于 `(10, 15)` 与 `(19, 15)`，作为前线支点
  - 24 个 `BLOCKED` 障碍格，组织出中轴直通 + 上下双环争夺区
  - 双方默认开局仍为 3 单位：战士 + 弓手 + 骑士
  - `frontier_40` 保留为 40×40 回归 / 慢节奏对照图
- **地形公开性**：地形、资源点归属与前哨站归属始终公开；战争迷雾只隐藏敌方单位等敏感战场信息，不隐藏地图布局本身

## 2. 玩家与阵营

- **每场对局**恰好 2 名玩家，分别为 **A 方**（先手）与 **B 方**（后手）
- 当前默认先手由配置 `balance.json#match.firstPlayer` 决定，现行为 **A 方固定先手**
- 双方数据完全对称

## 3. 单位 (Unit)

### 3.1 兵种定义

**所有数值定义在 `packages/shared/configs/units.json`，代码不得硬编码。**

| 兵种 | 代号 | HP | ATK | DEF | 射程 | 移动力 | 视野 | 招募价 | 维护费 | 说明 |
|---|---|---|---|---|---|---|---|---|---|---|
| 战士 Warrior | `warrior` | 20 | 8 | 5 | 1 | 3 | **2** | 6 | 1 | 近战、耐久 |
| 弓手 Archer | `archer` | 18 | 10 | 2 | 2–3 | 3 | **4** | 8 | 1 | 远程、脆皮 |
| 法师 Mage | `mage` | 17 | 14 | 1 | 1–4 | 2 | **4** | 10 | 2 | 远程、最高攻 |
| 骑士 Knight | `knight` | 26 | 11 | 4 | 1 | 5 | **3** | 12 | 1 | 机动、综合 |
| 牧师 Priest | `priest` | 16 | 6 | 2 | 1–2 | 3 | **3** | 9 | 1 | 后排辅助；可治疗友军 |
| 炮手 Gunner | `gunner` | 20 | 13 | 2 | 3–4 | 2 | **4** | 11 | 2 | 远程 AOE；可轰空地 |
| 侦察兵 Scout | `scout` | 12 | 4 | 1 | 1 | 6 | **6** | 7 | 1 | 高机动、高视野、低面板 |
| 毒师 Poisoner | `poisoner` | 15 | 4 | 2 | 1–2 | 3 | **4** | 10 | 2 | 普攻叠毒；可范围施毒 |

- **射程为区间**：`[minRange, maxRange]`。例如弓手 2–3 意为曼哈顿距离在 [2, 3] 的目标可被攻击；**距离 1 的目标打不到**（弓手近战劣势）。
- **射程为单点**：战士 / 骑士 `[1, 1]`
- **法师射程为区间**：`[1, 4]`，可近战也可远程输出
- **牧师**的普通攻击射程为 `[1, 2]`
- **炮手**的普通攻击射程为 `[3, 4]`，且该普通攻击是 AOE，不是单体攻击
- **毒师**的普通攻击射程为 `[1, 2]`
- 所有单位**不能越过 BLOCKED 或其他单位攻击**（不做视线 LOS 遮挡，`BLOCKED` 地块挡路但不挡攻击）
- 新兵种目前只进入招募池，不进入默认开局阵容

### 3.2 单位运行时属性

```typescript
interface UnitStatus {
  poisonStacks: number   // 当前中毒层数，默认 0
}

interface Unit {
  id: string               // 唯一ID，如 "u_a_001"
  owner: 'A' | 'B'         // 所属方
  type: UnitType           // warrior/archer/mage/knight/priest/gunner/scout/poisoner
  position: { x: number, y: number }
  hp: number               // 当前 HP，<= 0 即死亡
  hasMoved: boolean        // 本回合是否已移动
  hasActed: boolean        // 本回合是否已攻击/结束行动
  spawnedThisTurn: boolean // 本回合刚被招募出来，仅作状态/UI标记
  status: UnitStatus       // 当前单位状态
  cooldowns: Record<string, number> // 技能剩余冷却；0 时不记录
}
```

### 3.3 人口上限

- 每方**场上同时存在的单位数 ≤ 16**
- 包括初始单位 + 所有已出场的招募单位
- 达到 16 时无法下新招募单（资源不扣）

## 4. 基地 (Base)

```typescript
interface Base {
  owner: 'A' | 'B'
  position: { x: number, y: number }
  hp: number       // 初始 30
  maxHp: 30
  def: 5           // 防御力
}
```

- **不可移动**
- **HP ≤ 0 → 本方失败**
- **基地可被攻击**，攻击计算同单位（基地 DEF=5，无克制加成）
- **基地不可被移动单位进入**，也不会被"占领"（只有资源点与前哨站会）
- 基地格子本身**阻挡对方单位通行**
- 基地不会承受中毒、治疗、层数等单位状态效果

## 5. 资源系统

### 5.1 金币

- 每方独立金币池，初始 **5 金**
- 产出时机：**回合开始**（包括首回合）

### 5.2 基础产出

- 基地存活 → 每回合开始自动 +6 金

### 5.3 资源点

- 中立状态：不产金
- 占领条件：己方单位**移动到**资源点格时，立即将该资源点归属切换为己方
- 一旦归属，直到被对方单位移动到该资源点才会变更归属
- 资源点上无单位时，**保持上一次归属**（沉默归属）
- 产出：**每个己方归属的资源点，每回合开始 +3 金**
- 资源点归属变化发生在移动事件时，金币产出仍在回合开始统一结算

### 5.4 前哨站

- 初始中立；中立前哨站不产金、不能招募、没有防御加成
- 占领条件：任意单位**移动到前哨站本格**时，立即将该前哨站归属切换为该单位所属方
- 一旦归属，直到被对方单位再次移动到该前哨站本格才会变更归属
- 产出：**每个己方归属的前哨站，每回合开始 +5 金**
- 招募：已占领的己方前哨站可作为 `RECRUIT` 的合法来源
- 防御光环：前哨站本格及其上下左右四邻格内的己方单位获得 `+2 DEF`
- 光环只对单位生效，不影响基地；多个前哨站同时覆盖时**不叠加**
- 前哨站归属始终公开，且**不提供额外视野**

### 5.5 单位维护费

- 每个在场存活单位在**己方回合开始**支付固定维护费
- 维护费配置在 `packages/shared/src/configs/units.json`
- 首版数值：
  - `warrior`: 1
  - `archer`: 1
  - `mage`: 2
  - `knight`: 1
  - `priest`: 1
  - `gunner`: 2
  - `scout`: 1
  - `poisoner`: 2
- 维护费结算发生在**收入发放与待招募单位出生之后**
- 新招募单位若本回合成功出生，**当回合立即计入维护费**
- 若金币不足支付全部维护费，则**只扣到 0**；不会进入负债，也不会自动裁军

## 6. 回合制度 (IGOUGO)

### 6.1 回合结构

每一"大回合"由以下阶段组成：

1. **回合开始 (TURN_BEGIN)**
   - 先按当前 `state.units` 顺序结算当前玩家单位的中毒：
     - 按当前层数扣血
     - 若死亡则立刻移除，本回合不再参与后续任何结算
     - 若存活则中毒层数减少 1
   - 结算当前玩家单位的技能冷却：每个剩余冷却值 `-1`，最小到 0；降到 0 后可从字典删除
   - 清空当前玩家所有单位的 `hasMoved` 和 `hasActed` 标记
   - 清空 `spawnedThisTurn` 标记（仅保留一回合作为“刚招募”提示）
   - 结算金币产出（基地 6 + 归属资源点 3×N + 归属前哨站 5×N）
   - 处理上回合下的招募订单：
     - 基地来源：按 `spawnAt` 优先，再尝试剩余 3 个邻格
     - 前哨站来源：前哨站本格优先，若未占用再按 `spawnAt` 与剩余邻格回退
   - 结算当前场上全部己方单位的维护费（金币不足则扣到 0）
   - 启动回合计时器
2. **玩家操作阶段 (PLAYER_TURN)**
   - 玩家可以对自己任意单位执行：`MOVE`、`ATTACK`、`USE_ABILITY`
   - 对己方基地或己方已占领前哨站执行：`RECRUIT`（下招募单，金币立刻扣除，单位下回合出现）
   - 任意时刻可执行 `END_TURN`（手动结束回合）或 `SURRENDER`（投降）
3. **回合结束 (TURN_END)**
   - 停止回合计时器，累加已用时
   - 切换当前玩家
   - 检查胜负条件（见 §10）

### 6.2 单位行动规则

- 一个单位在**同一回合内**最多可以：
  - 移动一次（`MOVE`），消耗移动力
  - 攻击一次（`ATTACK`），或释放一次技能（`USE_ABILITY`），设置 `hasActed = true`
- **顺序限制**：
  - 移动后可以攻击或释放技能
  - 可以直接攻击 / 释放技能而不移动
  - **攻击或释放技能后不可再移动**
  - 也可以只移动不攻击；移动后若未 `hasActed`，当回合仍可选择攻击或技能
- **`hasMoved`**：单位移动后为 true，除非撤销，**不能二次移动**（MVP 不做撤销）
- **`spawnedThisTurn`**：本回合刚招募的单位标记，仅用于 UI/状态提示；不限制其当回合行动

### 6.3 移动规则

- 从单位当前位置，用 **BFS 计算所有可达格**（按曼哈顿距离，穿越自己单位可以，穿越敌方单位不可以，穿越 `BLOCKED` 不可以，穿越资源点/前哨站/平地可以，**基地格不可通行**除非是己方基地）
- 终点必须为空格（不能站在己方/敌方单位上；**可以站在资源点或前哨站上**；**不能站在基地格上**）
- 最多移动 `unit.moveRange` 格

伪代码：
```typescript
function getMovableTiles(unit: Unit, state: BattleState): Tile[] {
  const visited = new Map<string, number>()  // key=x,y → distance
  const queue = [{ pos: unit.position, dist: 0 }]
  const result: Tile[] = []
  while (queue.length > 0) {
    const { pos, dist } = queue.shift()!
    if (dist > unit.moveRange) continue
    for (const neighbor of get4Neighbors(pos)) {
      if (!inBounds(neighbor)) continue
      if (visited.has(key(neighbor))) continue
      if (!canPassThrough(neighbor, unit, state)) continue
      visited.set(key(neighbor), dist + 1)
      queue.push({ pos: neighbor, dist: dist + 1 })
      if (canStandOn(neighbor, unit, state)) result.push(neighbor)
    }
  }
  return result
}
```

### 6.4 攻击规则

- 从单位当前位置（移动后的位置），计算所有**曼哈顿距离在 [minRange, maxRange] 之间**的目标
- **单体普通攻击**的目标必须是：
  - 对方单位（未死亡）
  - 或对方基地
- **炮手普通攻击**的目标是一个**中心格**：
  - 中心格必须在射程内
  - 可以是空地、敌军单位格或敌方基地格
  - 以中心格为原点，对曼哈顿距离 ≤ 1 的敌方单位 / 敌方基地结算伤害
- 同一回合内一个单位只能攻击 1 次
- 攻击是**确定性伤害**，无闪避无暴击
- **无反击**（MVP 不做反击，简化战斗；后续可加）
- 炮手 AOE 的范围定义为：**中心格 + 上下左右四邻格**，不含斜角
- 炮手 AOE：
  - 中心命中按完整伤害结算
  - 溅射命中按 `max(1, floor(标准伤害 × 0.5))`
  - 不误伤友军
  - 允许对迷雾中的空地盲射；事件与结果可见性仍按战争迷雾规则过滤

### 6.5 伤害公式

```
effectiveDef = defender.DEF + outpostBonus(defender)
baseDamage = max(1, attacker.ATK - effectiveDef)
counterMultiplier = getCounterMultiplier(attacker.type, defender.type)
finalDamage = max(1, floor(baseDamage * counterMultiplier))
defender.hp -= finalDamage
```

- `defender.hp <= 0` → 单位死亡，从场上移除
- 如果 `defender` 是基地，同样公式，`effectiveDef = 5`（基地不吃前哨站防御加成）
- `outpostBonus(defender)` 仅在 `defender` 为单位，且位于**己方已占领前哨站本格或其四邻格**时取 `+2`，否则为 `0`
- **基地无克制**（`counterMultiplier = 1.0` 对基地攻击）

### 6.6 兵种克制

**配置在 `packages/shared/configs/balance.json`**

```json
{
  "counter": {
    "warrior": { "archer": 1.25, "knight": 0.8 },
    "archer":  { "mage": 1.25, "warrior": 0.8 },
    "mage":    { "knight": 1.25, "archer": 0.8 },
    "knight":  { "warrior": 1.25, "mage": 0.8 }
  }
}
```

- 克制目标 → 伤害 ×1.25
- 被克制 → 伤害 ×0.8
- 其他 → ×1.0

克制环：`warrior → archer → mage → knight → warrior`

目前 `priest` 与 `gunner` **没有额外克制修正**，默认按 ×1.0 结算。

### 6.7 技能规则

当前已实现两种主动技能：`priest.heal` 与 `poisoner.poison_burst`

- `priest.heal`
  - 射程：1–3
  - 治疗量：5
  - 目标：己方受伤单位
  - 不可目标：自己、敌方单位、基地、满血单位、死亡单位
  - 可先移动再治疗
  - 治疗后 `hasActed = true`

- `poisoner.poison_burst`
  - 施法距离：1–3
  - 目标：施法距离内任意中心格
  - 中心格可以是空地，也可以位于迷雾中
  - 作用范围：中心格及其曼哈顿距离 ≤ 2 的所有敌方单位
  - 效果：每个受影响敌方单位附加 2 层中毒，最多叠到 5 层
  - 不影响友军与基地
  - 使用后进入 2 个**自己的回合**冷却
  - 释放后 `hasActed = true`

### 6.8 特殊状态与被动

- `poisoner` 的普通攻击命中**存活的敌方单位**后，额外附加 1 层中毒
- 普攻施毒顺序：**先结算普通伤害，目标若未死亡，再附加中毒**
- 中毒只作用于单位，不作用于基地
- 中毒层数上限：5
- 中毒在**受害方回合开始最先结算**
  - 当前有几层，就先造成几点伤害
  - 若单位因此死亡，则本回合不能行动，也不会参与后续收入 / 招募 / 维护费等结算
  - 若单位存活，则中毒减少 1 层
- 中毒与技能冷却均属于单位公开状态：单位可见时，层数与剩余冷却也可见
- 炮手的 AOE 炮击仍属于**普通攻击**，不走技能按钮

## 7. 招募系统

### 7.1 流程

1. 玩家在回合操作阶段对己方**基地**或己方**已占领前哨站**发起 `RECRUIT` 动作
2. 动作带参数：
   - `unitType`：要招募的兵种
   - `source`：招募来源 `{ kind: 'base' | 'outpost', position }`
   - `spawnAt`：偏好的出生格
     - 基地来源：必须是基地的 4 邻格之一
     - 前哨站来源：可以是前哨站本格，或其 4 邻格之一
3. 服务器校验：
   - 金币足够？（不足拒绝）
   - 人口未满？（≥16 拒绝）
   - `source` 是否为己方合法建筑？（中立/敌方前哨站拒绝）
   - **同一建筑**当前回合是否已经下过招募单？（基地与每个前哨站各自独立）
4. 通过校验：
   - 金币立刻扣除
   - 招募订单追加到 `state.players[playerSide].pendingRecruits[]`
5. **下一个己方回合开始时**：
   - 检查来源建筑对应的出生候选列表是否仍有空地（非敌方/己方单位占据，非基地格，非障碍）
   - 有空位 → 在首个可用格生成新单位，设置 `spawnedThisTurn = true`
   - 新生成单位会在同一回合开始阶段立刻参与维护费结算
   - 若所有候选格都被堵死 → **招募失败，金币全额返还**
6. 回合开始结算后清空已执行订单，等下一次招募

### 7.2 招募限制与预留

- **每个建筑各 1 单/回合**：基地和每个己方前哨站各自维护一条待执行招募单
- 中立/敌方前哨站不能作为招募来源
- 同一玩家可在同回合从多个己方建筑分别下单
- 后续扩展：建筑种类、生产时间、更复杂队列

## 8. 战争迷雾 (Fog of War)

### 8.1 可见性规则

联机对战中启用战争迷雾，双方只能看到己方视野范围内的信息。

**视野来源（曼哈顿距离圆，数值定义在 `balance.json`，不得硬编码）：**

| 视野来源 | 视野半径 |
|---|---|
| 己方单位（每个）| 取 `units.json[type].sight`（见 §3.1） |
| 己方基地 | `balance.json#base.sight` = 3 |
| 己方占领的资源点 | `balance.json#resourcePoint.sight` = 2 |

**可见内容：**
- 可见格子：处于己方任意视野圆内的格子（地形始终可见）
- 可见单位：位于可见格子上的单位（包括己方与敌方）
- 不可见格子：敌方单位不可见，不发送给客户端

**信息隐藏规则：**
- **敌方金币**：不可见（UI 显示 `?`）
- **敌方维护费**：不可见（UI 显示 `?`）
- **敌方待招募订单**：不可见
- **敌方备用时间**：可见（对等信息，类似象棋时钟）
- **地形**：始终可见（静态地图公开信息）

### 8.2 事件过滤规则

服务器对每个 action 产生的事件按接收方视角过滤后下发：

| 事件类型 | 过滤规则 |
|---|---|
| `TURN_BEGAN / TURN_ENDED / TURN_CHANGED / MATCH_ENDED` | 双方全发 |
| `BASE_DAMAGED / BASE_DESTROYED / RESOURCE_POINT_CAPTURED / OUTPOST_CAPTURED` | 双方全发（地标事件） |
| `GOLD_CHANGED` | 只发给金币变动的一方 |
| `UNIT_RECRUIT_ORDERED / UNIT_RECRUIT_FAILED` | 只发给下令方 |
| `UNIT_RECRUITED` | 己方总发；敌方按出生格是否可见 |
| `UNIT_MOVED` | 己方总发；敌方按 `from`（事前视野）或 `to`（事后视野）任一可见 |
| `UNIT_ABILITY_USED / UNIT_HEALED` | 己方总发；敌方仅在施法者、目标或目标点当时可见时接收 |
| `UNIT_ATTACKED` | 己方单位参与的总发；否则按攻击者位置是否在事前视野 |
| `UNIT_DAMAGED / UNIT_KILLED` | 己方总发；敌方按单位位置在事前视野 |
| `UNIT_POISON_CHANGED` | 己方总发；敌方按单位位置在事前或事后视野 |

### 8.3 离线/调试模式

`BattleState.fog` 字段为 `undefined` 时，战争迷雾禁用（`/debug-battle` 离线模式）。

## 9. 初始状态 (开局)  <!-- 原§8 -->

- 双方各 **1 基地**（位置见 §1）
- 双方各 **3 个初始单位**：1 战士 + 1 弓手 + 1 骑士
- **A 方初始单位部署**（默认地图 `frontier_30`）：`warrior(3,15)`, `archer(4,14)`, `knight(4,16)`
- **B 方初始单位部署**（默认地图 `frontier_30`）：`warrior(26,15)`, `archer(25,16)`, `knight(25,14)`
- `priest` / `gunner` / `scout` / `poisoner` 当前只通过招募进入战场
- 双方**金币 = 5**
- **所有资源点初始中立**
- **所有前哨站初始中立**（`frontier_30` 与 `frontier_40` 均有 2 个；`mvp_default` 无前哨站）
- **先手 = A 方**

*具体位置也可由地图配置 `maps.json` 指定，引擎按配置加载，不硬编码。*

## 10. 胜负条件

按以下优先级检查，**满足任一即判定，立刻结束对局**：

1. **基地被摧毁**
   - 某方 `base.hp <= 0` → 该方失败，对方胜利
2. **投降**
   - 某方发送 `ACTION_SURRENDER` → 该方失败，对方胜利
3. **超时**
   - 某方总时钟耗尽（剩余备用时间 ≤ 0 且回合计时器到零） → 该方失败，对方胜利

**不使用** "对方无单位且无金币" 作为胜利条件（因为基地存在就持续产金，永远不会真正无解）。

**没有平局**（MVP）。

## 11. 时间制度

- **回合计时器**：每个回合开始时重置，倒数 75 秒。回合内必须完成所有动作并点击 `END_TURN`，否则超时会扣备用时间。
- **备用时间（象棋时钟式）**：每方初始 300 秒（5 分钟）。**只有在回合计时器归零后**，时间从备用时间扣除。
- **超时判负**：备用时间 ≤ 0 且回合计时器归零 → 判负（见 §10-3）
- **服务器权威计时**：所有时钟以服务器时间为准，客户端只用于显示。

## 12. 动作列表（Action 集合）

| Action | 参数 | 描述 |
|---|---|---|
| `MOVE` | `unitId, to: {x,y}` | 移动单位 |
| `ATTACK` | `unitId, targetId` 或 `targetPos` | 攻击单位/基地 |
| `USE_ABILITY` | `unitId, abilityId, targetId?` 或 `targetPos?` | 使用主动技能 |
| `RECRUIT` | `unitType, source: { kind, position }, spawnAt: {x,y}` | 从基地或前哨站下招募单 |
| `END_TURN` | — | 手动结束回合 |
| `SURRENDER` | — | 投降 |

**不存在** `END_UNIT_TURN`（单位行动完自动锁定），不存在 `UNDO`（MVP 不支持撤销）。

## 13. 事件列表（Event 集合）

服务器执行 Action 后广播的事件（用于客户端动画与状态同步）：

| Event | 载荷 |
|---|---|
| `TURN_BEGAN` | `{ currentPlayer, turnNumber, goldA, goldB, turnDeadline }` |
| `GOLD_CHANGED` | `{ player, delta, newAmount, reason: 'base_income' \| 'resource_point' \| 'recruit_cost' \| 'recruit_refund' \| 'unit_upkeep' }` |
| `RESOURCE_POINT_CAPTURED` | `{ position, newOwner, previousOwner }` |
| `OUTPOST_CAPTURED` | `{ position, newOwner, previousOwner }` |
| `UNIT_RECRUIT_ORDERED` | `{ player, unitType, source, spawnAt }` |
| `UNIT_RECRUITED` | `{ unit: Unit }` |
| `UNIT_RECRUIT_FAILED` | `{ player, source, reason: 'spawn_blocked', refundedGold }` |
| `UNIT_MOVED` | `{ unitId, from, to, path? }` |
| `UNIT_ABILITY_USED` | `{ unitId, abilityId, targetId?, targetPos? }` |
| `UNIT_HEALED` | `{ unitId, amount, hpBefore, hpAfter }` |
| `UNIT_POISON_CHANGED` | `{ unitId, stacksBefore, stacksAfter, reason: 'attack' \| 'skill' \| 'turn_tick' }` |
| `UNIT_ATTACKED` | `{ attackerId, targetId?, targetPos?, damage?, counterMul? }` |
| `UNIT_DAMAGED` | `{ unitId, damage, hpBefore, hpAfter }` |
| `UNIT_KILLED` | `{ unitId }` |
| `BASE_DAMAGED` | `{ owner, damage, hpBefore, hpAfter }` |
| `BASE_DESTROYED` | `{ owner }` |
| `TURN_ENDED` | `{ player, elapsedMs, reserveRemaining }` |
| `TURN_CHANGED` | `{ currentPlayer, turnNumber }` |
| `MATCH_ENDED` | `{ winner: 'A' \| 'B', reason: 'base_destroyed' \| 'surrender' \| 'timeout' }` |

事件带递增 `seq` 字段。

## 14. 示例：一个回合的完整流程

假设当前是 **A 方第 3 回合**。

1. 服务器：`TURN_BEGAN`（A 方，第 3 回合）
2. 服务器：A 金币 +6 (基地) +3 (1 个已归属资源点) +5 (1 个已归属前哨站) = +14 → `GOLD_CHANGED(A, +14)`
3. 服务器：A 上回合从前哨站下了战士招募单 → 生成新单位 → `UNIT_RECRUITED`
4. 服务器：A 支付当前全部单位维护费 → `GOLD_CHANGED(A, -4, reason='unit_upkeep')`
5. 客户端：A 方玩家选中骑士，移动到 (5,4)
6. 客户端 → 服务器：`ACTION_MOVE { unitId: kA, to: {x:5, y:4} }`
7. 服务器：校验通过，apply → `UNIT_MOVED`
8. 若 (5,4) 是资源点且归属变化 → `RESOURCE_POINT_CAPTURED`
9. 客户端：A 方玩家对敌方法师发起攻击
10. 客户端 → 服务器：`ACTION_ATTACK { unitId: kA, targetId: mB }`
11. 服务器：计算伤害（骑士克法师 ×1.25）→ `UNIT_ATTACKED`, `UNIT_DAMAGED`, 若死 `UNIT_KILLED`
12. 客户端：A 方玩家点 `END_TURN`
13. 客户端 → 服务器：`ACTION_END_TURN`
14. 服务器：`TURN_ENDED`
15. 服务器：检查胜负，无 → 切换到 B 方，`TURN_BEGAN(B)`

## 15. 平衡性初版数值可调参数

**所有下列数值定义在 `balance.json`，不得硬编码：**

- `match.turnTimeSeconds`: 75
- `match.reserveTimeSeconds`: 300
- `economy.baseIncomePerTurn`: 6
- `economy.resourcePointIncome`: 3
- `economy.startingGold`: 5
- `combat.counterBonus`: 1.25
- `combat.counterPenalty`: 0.8
- `combat.minDamage`: 1
- `map.width`: 由当前地图配置决定（默认地图 `frontier_30` 为 30）
- `map.height`: 由当前地图配置决定（默认地图 `frontier_30` 为 30）
- `unit.populationCap`: 16
- `base.maxHp`: 30
- `base.def`: 5
- `base.sight`: 3
- `resourcePoint.sight`: 2
- `outpost.incomePerTurn`: 5
- `outpost.defenseBonus`: 2
- `unit.sight.warrior`: 2（定义在 `units.json`）
- `unit.sight.archer`: 4
- `unit.sight.mage`: 4
- `unit.sight.knight`: 3
- `unit.sight.priest`: 3
- `unit.sight.gunner`: 4
- `unit.sight.scout`: 6
- `unit.sight.poisoner`: 4
- `unit.upkeep.warrior`: 1（定义在 `units.json`）
- `unit.upkeep.archer`: 1
- `unit.upkeep.mage`: 2
- `unit.upkeep.knight`: 1
- `unit.upkeep.priest`: 1
- `unit.upkeep.gunner`: 2
- `unit.upkeep.scout`: 1
- `unit.upkeep.poisoner`: 2
- `status.poison.maxStacks`: 5
- `status.poison.decayPerTurn`: 1
- `recruit.maxOrdersPerTurn`: 1（保留配置字段；当前实际规则仍以“每个建筑各 1 单”为准）
- `recruit.spawnDelayTurns`: 1
