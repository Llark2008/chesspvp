import type { BattleState, PlayerSide, Tile, Unit, Base } from '../types/battle';
import { MAPS, BALANCE, UNITS } from '../configs';
import { createDefaultCooldowns, createDefaultUnitStatus } from './utils';

export function createInitialState(
  matchId: string,
  mapId: string,
  playerAId: string,
  playerBId: string,
  nowMs = 0
): BattleState {
  const mapCfg = MAPS[mapId];
  if (!mapCfg) throw new Error(`Unknown mapId: ${mapId}`);

  // Build tiles grid [y][x]
  const tiles: Tile[][] = [];
  for (let y = 0; y < mapCfg.height; y++) {
    const row: Tile[] = [];
    for (let x = 0; x < mapCfg.width; x++) {
      row.push({ position: { x, y }, type: 'plain' });
    }
    tiles.push(row);
  }

  // Mark bases
  const baseA = mapCfg.basePositions['A'];
  const baseB = mapCfg.basePositions['B'];
  tiles[baseA.y]![baseA.x]!.type = 'base_a';
  tiles[baseB.y]![baseB.x]!.type = 'base_b';

  // Mark resource points
  for (const rp of mapCfg.resourcePoints) {
    tiles[rp.y]![rp.x]!.type = 'resource';
    tiles[rp.y]![rp.x]!.resourceOwner = null;
  }

  for (const outpost of mapCfg.outposts) {
    tiles[outpost.y]![outpost.x]!.type = 'outpost';
    tiles[outpost.y]![outpost.x]!.outpostOwner = null;
  }

  // Mark blocked tiles
  for (const bl of mapCfg.blockedTiles) {
    tiles[bl.y]![bl.x]!.type = 'blocked';
  }

  // Build bases
  const bases: Base[] = [
    { owner: 'A', position: { ...baseA }, hp: BALANCE.base.maxHp },
    { owner: 'B', position: { ...baseB }, hp: BALANCE.base.maxHp },
  ];

  // Build initial units
  const units: Unit[] = [];
  let unitIdx = 0;
  for (const side of ['A', 'B'] as PlayerSide[]) {
    for (const initUnit of mapCfg.initialUnits[side]) {
      unitIdx++;
      units.push({
        id: `u_${side.toLowerCase()}_${String(unitIdx).padStart(3, '0')}`,
        owner: side,
        type: initUnit.type,
        position: { ...initUnit.position },
        hp: UNITS[initUnit.type].hp,
        hasMoved: false,
        hasActed: false,
        spawnedThisTurn: false,
        status: createDefaultUnitStatus(),
        cooldowns: createDefaultCooldowns(),
      });
    }
  }

  const reserveMs = BALANCE.match.reserveTimeSeconds * 1000;

  return {
    matchId,
    mapId,
    turnNumber: 0, // beginTurn() increments to 1 when the first turn starts
    currentPlayer: 'A',
    players: {
      A: {
        userId: playerAId,
        side: 'A',
        gold: BALANCE.economy.startingGold,
        pendingRecruits: [],
        reserveTimeMs: reserveMs,
      },
      B: {
        userId: playerBId,
        side: 'B',
        gold: BALANCE.economy.startingGold,
        pendingRecruits: [],
        reserveTimeMs: reserveMs,
      },
    },
    units,
    bases,
    tiles,
    turnDeadline: nowMs + BALANCE.match.turnTimeSeconds * 1000,
    winner: null,
    endReason: null,
  };
}
