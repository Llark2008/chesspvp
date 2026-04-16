import type { BattleState, PlayerSide, RecruitSource } from '../types/battle';
import type { Action } from '../types/action';
import type { GameEvent } from '../types/event';
import type { MapConfig } from '../types/configs';
import type { UserDto } from './rest';

export interface ClockSnapshot {
  A: { reserveMs: number };
  B: { reserveMs: number };
}

export interface MatchFoundPayload {
  matchId: string;
  opponent: UserDto;
  yourSide: PlayerSide;
  map: MapConfig;
  expiresAt: number;
}

export interface MatchStartPayload {
  matchId: string;
  firstPlayer: PlayerSide;
  initialState: BattleState;
  turnDeadline: number;
  clocks: ClockSnapshot;
}

export interface EventBatchPayload {
  matchId: string;
  events: GameEvent[];
  seq: number;
}

export interface TurnChangedPayload {
  matchId: string;
  currentPlayer: PlayerSide;
  turnNumber: number;
  turnDeadline: number;
  clocks: ClockSnapshot;
}

export interface StateSnapshotPayload {
  matchId: string;
  state: BattleState;
  seq: number;
}

export interface OpponentDisconnectedPayload {
  matchId: string;
  reconnectDeadline: number;
}

export interface MatchEndedPayload {
  matchId: string;
  winner: PlayerSide;
  reason: string;
  durationMs: number;
}

export interface ActionRejectedPayload {
  matchId: string;
  reason: string;
  details?: unknown;
}

// =========================================================
// Client → Server payloads
// =========================================================

export interface ActionMovePayload {
  matchId: string;
  unitId: string;
  to: { x: number; y: number };
}

export interface ActionAttackPayload {
  matchId: string;
  unitId: string;
  targetId?: string;
  targetPos?: { x: number; y: number };
}

export interface ActionUseAbilityPayload {
  matchId: string;
  unitId: string;
  abilityId: string;
  targetId?: string;
  targetPos?: { x: number; y: number };
}

export interface ActionRecruitPayload {
  matchId: string;
  unitType: string;
  source: RecruitSource;
  spawnAt: { x: number; y: number };
}

export interface ActionEndTurnPayload {
  matchId: string;
}

export interface ActionSurrenderPayload {
  matchId: string;
}

export interface RequestSnapshotPayload {
  matchId: string;
  fromSeq: number;
}

// =========================================================
// Ack
// =========================================================

export type Ack = { ok: true } | { ok: false; error: { code: string; message: string } };

// =========================================================
// Socket event maps (design-doc canonical names)
// =========================================================

export interface Server2ClientEvents {
  MATCH_FOUND: (payload: MatchFoundPayload) => void;
  MATCH_START: (payload: MatchStartPayload) => void;
  EVENT_BATCH: (payload: EventBatchPayload) => void;
  TURN_CHANGED: (payload: TurnChangedPayload) => void;
  STATE_SNAPSHOT: (payload: StateSnapshotPayload) => void;
  OPPONENT_DISCONNECTED: (payload: OpponentDisconnectedPayload) => void;
  OPPONENT_RECONNECTED: (payload: { matchId: string }) => void;
  MATCH_ENDED: (payload: MatchEndedPayload) => void;
  ACTION_REJECTED: (payload: ActionRejectedPayload) => void;
  ERROR: (payload: { code: string; message: string }) => void;
  PONG: (payload: { ts: number }) => void;
}

export interface Client2ServerEvents {
  MATCH_READY: (payload: { matchId: string }, ack: (r: Ack) => void) => void;
  ACTION_MOVE: (payload: ActionMovePayload, ack: (r: Ack) => void) => void;
  ACTION_ATTACK: (payload: ActionAttackPayload, ack: (r: Ack) => void) => void;
  ACTION_USE_ABILITY: (payload: ActionUseAbilityPayload, ack: (r: Ack) => void) => void;
  ACTION_RECRUIT: (payload: ActionRecruitPayload, ack: (r: Ack) => void) => void;
  ACTION_END_TURN: (payload: ActionEndTurnPayload, ack: (r: Ack) => void) => void;
  ACTION_SURRENDER: (payload: ActionSurrenderPayload, ack: (r: Ack) => void) => void;
  REQUEST_SNAPSHOT: (payload: RequestSnapshotPayload) => void;
  PING: (payload: { ts: number }) => void;
}

// Backward-compat aliases
export type ServerToClientEvents = Server2ClientEvents;
export type ClientToServerEvents = Client2ServerEvents;

export type { Action };
