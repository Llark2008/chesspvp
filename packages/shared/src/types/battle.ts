export type PlayerSide = 'A' | 'B';

/** 战争迷雾视角信息。仅存在于下发给客户端的过滤态；服务器内部权威态无此字段。 */
export interface FogInfo {
  /** 本份状态是哪一方的视角 */
  perspective: PlayerSide;
  /** 当前可见格子，"x,y" 字符串集合，便于快速查表 */
  visibleTiles: string[];
}
export type UnitType =
  | 'warrior'
  | 'archer'
  | 'mage'
  | 'knight'
  | 'priest'
  | 'gunner'
  | 'scout'
  | 'poisoner';

export interface Position {
  x: number;
  y: number;
}

export interface UnitStatus {
  poisonStacks: number;
}

export interface Unit {
  id: string;
  owner: PlayerSide;
  type: UnitType;
  position: Position;
  hp: number;
  hasMoved: boolean;
  hasActed: boolean;
  spawnedThisTurn: boolean;
  status: UnitStatus;
  cooldowns: Record<string, number>;
}

export interface Base {
  owner: PlayerSide;
  position: Position;
  hp: number;
}

export type TileType = 'plain' | 'blocked' | 'resource' | 'outpost' | 'base_a' | 'base_b';

export interface Tile {
  position: Position;
  type: TileType;
  resourceOwner?: PlayerSide | null;
  outpostOwner?: PlayerSide | null;
}

export interface RecruitSource {
  kind: 'base' | 'outpost';
  position: Position;
}

export interface PendingRecruit {
  unitType: UnitType;
  source: RecruitSource;
  spawnAt: Position;
  orderedTurn: number;
}

export interface PlayerState {
  userId: string;
  side: PlayerSide;
  gold: number;
  pendingRecruits: PendingRecruit[];
  reserveTimeMs: number;
}

export interface BattleState {
  matchId: string;
  mapId: string;
  turnNumber: number;
  currentPlayer: PlayerSide;
  players: Record<PlayerSide, PlayerState>;
  units: Unit[];
  bases: Base[];
  tiles: Tile[][];
  turnDeadline: number;
  winner: PlayerSide | null;
  endReason: 'base_destroyed' | 'surrender' | 'timeout' | null;
  /** 战争迷雾视角信息。存在则表示为过滤态（联机客户端），不存在则为全量状态（服务器内部/离线调试）。 */
  fog?: FogInfo;
}
