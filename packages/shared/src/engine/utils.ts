import type { BattleState, Position, Unit, UnitStatus } from '../types/battle';

export function deepClone<T>(v: T): T {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

export function clonePosition(pos: Position): Position {
  return { x: pos.x, y: pos.y };
}

export function createDefaultUnitStatus(): UnitStatus {
  return {
    poisonStacks: 0,
  };
}

export function createDefaultCooldowns(): Record<string, number> {
  return {};
}

export function cloneUnit(unit: Unit): Unit {
  return {
    ...unit,
    position: clonePosition(unit.position),
    status: { ...unit.status },
    cooldowns: { ...unit.cooldowns },
  };
}

export function normalizeUnit(unit: Unit): Unit {
  return {
    ...unit,
    position: clonePosition(unit.position),
    status: {
      poisonStacks: unit.status?.poisonStacks ?? 0,
    },
    cooldowns: { ...(unit.cooldowns ?? {}) },
  };
}

export function normalizeBattleState(state: BattleState): BattleState {
  return {
    ...state,
    players: {
      A: {
        ...state.players.A,
        pendingRecruits: [...(state.players.A.pendingRecruits ?? [])],
      },
      B: {
        ...state.players.B,
        pendingRecruits: [...(state.players.B.pendingRecruits ?? [])],
      },
    },
    units: state.units.map((unit) => normalizeUnit(unit)),
    tiles: state.tiles.map((row) =>
      row.map((tile) => ({
        ...tile,
        resourceOwner: tile.resourceOwner ?? null,
        outpostOwner: tile.outpostOwner ?? null,
      })),
    ),
  };
}

export function key(p: Position): string {
  return `${p.x},${p.y}`;
}

export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function get4Neighbors(p: Position): Position[] {
  return [
    { x: p.x, y: p.y - 1 },
    { x: p.x, y: p.y + 1 },
    { x: p.x - 1, y: p.y },
    { x: p.x + 1, y: p.y },
  ];
}

export function isInBounds(p: Position, map: { width: number; height: number }): boolean {
  return p.x >= 0 && p.x < map.width && p.y >= 0 && p.y < map.height;
}
