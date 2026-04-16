import type { PlayerSide } from '@chesspvp/shared';

export function getOpponentSide(mySide: PlayerSide): PlayerSide {
  return mySide === 'A' ? 'B' : 'A';
}

export function isOwnSide(targetSide: PlayerSide, mySide: PlayerSide | null): boolean {
  return mySide ? targetSide === mySide : targetSide === 'A';
}

export function getRelationLabel(targetSide: PlayerSide, mySide: PlayerSide | null): '我方' | '对方' {
  return isOwnSide(targetSide, mySide) ? '我方' : '对方';
}

export function getHudSides(mySide: PlayerSide | null): [PlayerSide, PlayerSide] {
  if (!mySide) {
    return ['A', 'B'];
  }

  return [mySide, getOpponentSide(mySide)];
}
