import type { Unit, PlayerSide, Position, UnitType, RecruitSource } from './battle';

export interface BaseEvent {
  seq?: number;
}

export type GameEvent =
  | (BaseEvent & {
      type: 'TURN_BEGAN';
      payload: {
        currentPlayer: PlayerSide;
        turnNumber: number;
        goldA: number;
        goldB: number;
        turnDeadline: number;
      };
    })
  | (BaseEvent & {
      type: 'GOLD_CHANGED';
      payload: {
        player: PlayerSide;
        delta: number;
        newAmount: number;
        reason: 'base_income' | 'resource_point' | 'recruit_cost' | 'recruit_refund' | 'unit_upkeep';
      };
    })
  | (BaseEvent & {
      type: 'RESOURCE_POINT_CAPTURED';
      payload: { position: Position; newOwner: PlayerSide; previousOwner: PlayerSide | null };
    })
  | (BaseEvent & {
      type: 'OUTPOST_CAPTURED';
      payload: { position: Position; newOwner: PlayerSide; previousOwner: PlayerSide | null };
    })
  | (BaseEvent & {
      type: 'UNIT_RECRUIT_ORDERED';
      payload: { player: PlayerSide; unitType: UnitType; source: RecruitSource; spawnAt: Position };
    })
  | (BaseEvent & { type: 'UNIT_RECRUITED'; payload: { unit: Unit } })
  | (BaseEvent & {
      type: 'UNIT_RECRUIT_FAILED';
      payload: { player: PlayerSide; source: RecruitSource; reason: 'spawn_blocked'; refundedGold: number };
    })
  | (BaseEvent & {
      type: 'UNIT_MOVED';
      payload: { unitId: string; from: Position; to: Position; path?: Position[] };
    })
  | (BaseEvent & {
      type: 'UNIT_ABILITY_USED';
      payload: {
        unitId: string;
        abilityId: string;
        targetId?: string;
        targetPos?: Position;
      };
    })
  | (BaseEvent & {
      type: 'UNIT_HEALED';
      payload: { unitId: string; amount: number; hpBefore: number; hpAfter: number };
    })
  | (BaseEvent & {
      type: 'UNIT_POISON_CHANGED';
      payload: {
        unitId: string;
        stacksBefore: number;
        stacksAfter: number;
        reason: 'attack' | 'skill' | 'turn_tick';
      };
    })
  | (BaseEvent & {
      type: 'UNIT_ATTACKED';
      payload: {
        attackerId: string;
        targetId?: string;
        targetPos?: Position;
        damage?: number;
        counterMul?: number;
      };
    })
  | (BaseEvent & {
      type: 'UNIT_DAMAGED';
      payload: { unitId: string; damage: number; hpBefore: number; hpAfter: number };
    })
  | (BaseEvent & { type: 'UNIT_KILLED'; payload: { unitId: string } })
  | (BaseEvent & {
      type: 'BASE_DAMAGED';
      payload: { owner: PlayerSide; damage: number; hpBefore: number; hpAfter: number };
    })
  | (BaseEvent & { type: 'BASE_DESTROYED'; payload: { owner: PlayerSide } })
  | (BaseEvent & {
      type: 'TURN_ENDED';
      payload: { player: PlayerSide; elapsedMs: number; reserveRemaining: number };
    })
  | (BaseEvent & {
      type: 'MATCH_ENDED';
      payload: {
        winner: PlayerSide;
        reason: 'base_destroyed' | 'surrender' | 'timeout';
      };
    })
  | (BaseEvent & { type: 'TURN_CHANGED'; payload: { currentPlayer: PlayerSide; turnNumber: number } });
