import type { PlayerSide } from '@chesspvp/shared';

export interface ResourceOwnershipVisual {
  accentColor: number;
  accentCss: string;
  fillColor: number;
  fillAlpha: number;
  centerColor: number;
  centerAlpha: number;
}

const NEUTRAL_VISUAL: ResourceOwnershipVisual = {
  accentColor: 0xf0c030,
  accentCss: '#d4a017',
  fillColor: 0x8b6914,
  fillAlpha: 0.24,
  centerColor: 0xf8dd72,
  centerAlpha: 0.95,
};

const NEUTRAL_OUTPOST_VISUAL: ResourceOwnershipVisual = {
  accentColor: 0xf59e0b,
  accentCss: '#f59e0b',
  fillColor: 0x78350f,
  fillAlpha: 0.34,
  centerColor: 0xfcd34d,
  centerAlpha: 0.95,
};

const OWNER_VISUALS: Record<PlayerSide, ResourceOwnershipVisual> = {
  A: {
    accentColor: 0x60a5fa,
    accentCss: '#60a5fa',
    fillColor: 0x1d4ed8,
    fillAlpha: 0.28,
    centerColor: 0xf8dd72,
    centerAlpha: 0.98,
  },
  B: {
    accentColor: 0xf87171,
    accentCss: '#f87171',
    fillColor: 0xb91c1c,
    fillAlpha: 0.28,
    centerColor: 0xf8dd72,
    centerAlpha: 0.98,
  },
};

export function getResourceOwnershipVisual(
  owner: PlayerSide | null | undefined,
): ResourceOwnershipVisual {
  return owner ? OWNER_VISUALS[owner] : NEUTRAL_VISUAL;
}

export function getResourceOwnershipCssColor(
  owner: PlayerSide | null | undefined,
): string {
  return getResourceOwnershipVisual(owner).accentCss;
}

export function getOutpostOwnershipVisual(
  owner: PlayerSide | null | undefined,
): ResourceOwnershipVisual {
  return owner ? OWNER_VISUALS[owner] : NEUTRAL_OUTPOST_VISUAL;
}

export function getOutpostOwnershipCssColor(
  owner: PlayerSide | null | undefined,
): string {
  return getOutpostOwnershipVisual(owner).accentCss;
}

export function getResourceCapturePulseColor(
  owner: PlayerSide | null | undefined,
): number {
  return getResourceOwnershipVisual(owner).accentColor;
}
