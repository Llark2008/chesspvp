import type { BattleState, PlayerSide, Position } from '../types/battle';
import type { Action } from '../types/action';
import type { GameEvent } from '../types/event';
import type { ValidationResult } from './validators';
import { validateAction } from './validators';
import { applyAction } from './applyAction';
import { computeAbilityTargets } from './abilities';
import { computeMovableTiles } from './pathfinding';
import { computeAttackableTargets } from './combat';
import { checkVictory } from './victory';
import { beginTurn } from './turn';
import { deepClone, normalizeBattleState } from './utils';

export class InvalidActionError extends Error {
  constructor(public result: Extract<ValidationResult, { ok: false }>) {
    super(result.message);
    this.name = 'InvalidActionError';
  }
}

export class BattleEngine {
  private _state: BattleState;

  constructor(initialState: BattleState) {
    this._state = deepClone(normalizeBattleState(initialState));
  }

  get state(): Readonly<BattleState> {
    return this._state;
  }

  validate(action: Action, actorSide: PlayerSide): ValidationResult {
    return validateAction(this._state, action, actorSide);
  }

  apply(
    action: Action,
    actorSide: PlayerSide,
    nowMs = 0
  ): { events: GameEvent[]; state: BattleState } {
    const v = this.validate(action, actorSide);
    if (!v.ok) throw new InvalidActionError(v);
    const { events, nextState } = applyAction(this._state, action, actorSide, nowMs);
    this._state = nextState;
    return { events, state: nextState };
  }

  getMovableTiles(unitId: string): Position[] {
    return computeMovableTiles(this._state, unitId);
  }

  getAttackableTargets(unitId: string, fromPos?: Position): Position[] {
    return computeAttackableTargets(this._state, unitId, fromPos);
  }

  getAbilityTargets(unitId: string, abilityId: string, fromPos?: Position): Position[] {
    return computeAbilityTargets(this._state, unitId, abilityId, fromPos);
  }

  checkVictory(): { winner: PlayerSide; reason: string } | null {
    return checkVictory(this._state);
  }

  beginTurn(player: PlayerSide, nowMs = 0): GameEvent[] {
    const { events, nextState } = beginTurn(this._state, player, nowMs);
    this._state = nextState;
    return events;
  }

  static replay(
    initialState: BattleState,
    actions: Array<{ action: Action; actorSide: PlayerSide; nowMs?: number }>
  ): { finalState: BattleState; events: GameEvent[] } {
    const engine = new BattleEngine(initialState);
    const allEvents: GameEvent[] = [];
    for (const { action, actorSide, nowMs } of actions) {
      const { events } = engine.apply(action, actorSide, nowMs ?? 0);
      allEvents.push(...events);
    }
    return { finalState: engine.state as BattleState, events: allEvents };
  }
}
