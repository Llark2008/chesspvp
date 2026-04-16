import type { BattleState, PlayerSide, Position } from '../types/battle';
import type { GameEvent } from '../types/event';
import { clonePosition } from './utils';

export function captureResourcePointAt(
  draft: BattleState,
  position: Position,
  owner: PlayerSide,
  events: GameEvent[],
): void {
  const tile = draft.tiles[position.y]?.[position.x];
  if (!tile || tile.type !== 'resource') return;

  const previousOwner = tile.resourceOwner ?? null;
  if (previousOwner === owner) return;

  tile.resourceOwner = owner;
  events.push({
    type: 'RESOURCE_POINT_CAPTURED',
    payload: {
      position: clonePosition(tile.position),
      newOwner: owner,
      previousOwner,
    },
  });
}
