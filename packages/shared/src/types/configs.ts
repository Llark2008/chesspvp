import type { UnitType, PlayerSide, Position } from './battle';

interface BaseAbilityConfig {
  id: string;
  displayName: string;
  minRange: number;
  maxRange: number;
}

export interface HealAbilityConfig extends BaseAbilityConfig {
  kind: 'heal';
  power: number;
  canTargetSelf: boolean;
}

export interface PoisonBurstAbilityConfig extends BaseAbilityConfig {
  kind: 'poison_burst';
  radius: number;
  applyStacks: number;
  cooldownTurns: number;
  canTargetEmptyTile: boolean;
}

export type AbilityConfig = HealAbilityConfig | PoisonBurstAbilityConfig;

export interface UnitConfig {
  id: UnitType;
  displayName: string;
  hp: number;
  atk: number;
  def: number;
  minRange: number;
  maxRange: number;
  moveRange: number;
  sight: number;
  cost: number;
  upkeep: number;
  description: string;
  attackKind: 'single' | 'aoe';
  canTargetEmptyTile?: boolean;
  splashRadius?: number;
  splashMultiplier?: number;
  abilities?: AbilityConfig[];
}

export interface MapConfig {
  id: string;
  displayName: string;
  width: number;
  height: number;
  basePositions: Record<PlayerSide, Position>;
  resourcePoints: Position[];
  outposts: Position[];
  blockedTiles: Position[];
  initialUnits: Record<PlayerSide, Array<{ type: UnitType; position: Position }>>;
}

export interface BalanceConfig {
  match: {
    turnTimeSeconds: number;
    reserveTimeSeconds: number;
    firstPlayer: PlayerSide;
  };
  economy: {
    startingGold: number;
    baseIncomePerTurn: number;
    resourcePointIncome: number;
  };
  combat: {
    counterBonus: number;
    counterPenalty: number;
    minDamage: number;
  };
  counter: Record<UnitType, Partial<Record<UnitType, 'bonus' | 'penalty'>>>;
  base: {
    maxHp: number;
    def: number;
    sight: number;
  };
  resourcePoint: {
    sight: number;
  };
  outpost: {
    incomePerTurn: number;
    defenseBonus: number;
  };
  status: {
    poison: {
      maxStacks: number;
      decayPerTurn: number;
    };
  };
  unit: {
    populationCap: number;
  };
  recruit: {
    maxOrdersPerTurn: number;
    spawnDelayTurns: number;
  };
}
