import type { Position } from '@chesspvp/shared';
import {
  BATTLE_DEFAULT_ZOOM,
  BATTLE_MAX_ZOOM,
  BATTLE_MIN_ZOOM,
  BATTLE_VIEWPORT_HEIGHT_PX,
  BATTLE_VIEWPORT_WIDTH_PX,
  CAMERA_PAN_SPEED_PX_PER_SEC,
  TILE_SIZE,
} from './constants';

export interface BattleCamera {
  offsetX: number;
  offsetY: number;
  baseViewportWidthPx: number;
  baseViewportHeightPx: number;
  zoom: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
  worldWidthPx: number;
  worldHeightPx: number;
}

function clampZoom(zoom: number): number {
  return Math.max(BATTLE_MIN_ZOOM, Math.min(zoom, BATTLE_MAX_ZOOM));
}

function deriveViewport(baseViewportPx: number, zoom: number): number {
  return baseViewportPx / zoom;
}

function normalizeCamera(camera: BattleCamera): BattleCamera {
  const zoom = clampZoom(camera.zoom);

  return {
    ...camera,
    zoom,
    viewportWidthPx: deriveViewport(camera.baseViewportWidthPx, zoom),
    viewportHeightPx: deriveViewport(camera.baseViewportHeightPx, zoom),
  };
}

export function clampCamera(camera: BattleCamera): BattleCamera {
  const normalized = normalizeCamera(camera);
  const maxOffsetX = Math.max(0, normalized.worldWidthPx - normalized.viewportWidthPx);
  const maxOffsetY = Math.max(0, normalized.worldHeightPx - normalized.viewportHeightPx);

  return {
    ...normalized,
    offsetX: Math.max(0, Math.min(normalized.offsetX, maxOffsetX)),
    offsetY: Math.max(0, Math.min(normalized.offsetY, maxOffsetY)),
  };
}

export function createBattleCamera(opts: {
  baseViewportWidthPx?: number;
  baseViewportHeightPx?: number;
  viewportWidthPx?: number;
  viewportHeightPx?: number;
  worldWidthPx: number;
  worldHeightPx: number;
  offsetX?: number;
  offsetY?: number;
  zoom?: number;
}): BattleCamera {
  return clampCamera({
    offsetX: opts.offsetX ?? 0,
    offsetY: opts.offsetY ?? 0,
    baseViewportWidthPx:
      opts.baseViewportWidthPx ?? opts.viewportWidthPx ?? BATTLE_VIEWPORT_WIDTH_PX,
    baseViewportHeightPx:
      opts.baseViewportHeightPx ?? opts.viewportHeightPx ?? BATTLE_VIEWPORT_HEIGHT_PX,
    zoom: opts.zoom ?? BATTLE_DEFAULT_ZOOM,
    viewportWidthPx: 0,
    viewportHeightPx: 0,
    worldWidthPx: opts.worldWidthPx,
    worldHeightPx: opts.worldHeightPx,
  });
}

export function resizeBattleCamera(
  camera: BattleCamera,
  opts: { worldWidthPx: number; worldHeightPx: number },
): BattleCamera {
  return clampCamera({
    ...camera,
    worldWidthPx: opts.worldWidthPx,
    worldHeightPx: opts.worldHeightPx,
  });
}

export function moveCamera(camera: BattleCamera, dx: number, dy: number): BattleCamera {
  return clampCamera({
    ...camera,
    offsetX: camera.offsetX + dx,
    offsetY: camera.offsetY + dy,
  });
}

export function jumpCameraToTile(camera: BattleCamera, tile: Position): BattleCamera {
  return clampCamera({
    ...camera,
    offsetX: tile.x * TILE_SIZE + TILE_SIZE / 2 - camera.viewportWidthPx / 2,
    offsetY: tile.y * TILE_SIZE + TILE_SIZE / 2 - camera.viewportHeightPx / 2,
  });
}

export function setCameraZoom(
  camera: BattleCamera,
  zoom: number,
  anchorNormX = 0.5,
  anchorNormY = 0.5,
): BattleCamera {
  const safeAnchorX = Math.max(0, Math.min(anchorNormX, 1));
  const safeAnchorY = Math.max(0, Math.min(anchorNormY, 1));
  const nextZoom = clampZoom(zoom);
  const nextViewportWidthPx = deriveViewport(camera.baseViewportWidthPx, nextZoom);
  const nextViewportHeightPx = deriveViewport(camera.baseViewportHeightPx, nextZoom);
  const anchoredWorldX = camera.offsetX + camera.viewportWidthPx * safeAnchorX;
  const anchoredWorldY = camera.offsetY + camera.viewportHeightPx * safeAnchorY;

  return clampCamera({
    ...camera,
    zoom: nextZoom,
    viewportWidthPx: nextViewportWidthPx,
    viewportHeightPx: nextViewportHeightPx,
    offsetX: anchoredWorldX - nextViewportWidthPx * safeAnchorX,
    offsetY: anchoredWorldY - nextViewportHeightPx * safeAnchorY,
  });
}

export function screenToTile(
  camera: BattleCamera,
  screenX: number,
  screenY: number,
  mapWidth: number,
  mapHeight: number,
): Position | null {
  const worldX = screenX + camera.offsetX;
  const worldY = screenY + camera.offsetY;
  const tileX = Math.floor(worldX / TILE_SIZE);
  const tileY = Math.floor(worldY / TILE_SIZE);

  if (tileX < 0 || tileX >= mapWidth || tileY < 0 || tileY >= mapHeight) {
    return null;
  }

  return { x: tileX, y: tileY };
}

export function getCameraPanDelta(
  pressedKeys: ReadonlySet<string>,
  deltaMs: number,
): { dx: number; dy: number } {
  const distance = (CAMERA_PAN_SPEED_PX_PER_SEC * deltaMs) / 1000;
  let dx = 0;
  let dy = 0;

  if (pressedKeys.has('a')) dx -= distance;
  if (pressedKeys.has('d')) dx += distance;
  if (pressedKeys.has('w')) dy -= distance;
  if (pressedKeys.has('s')) dy += distance;

  return { dx, dy };
}
