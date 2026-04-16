import { describe, expect, it } from 'vitest';
import {
  clampCamera,
  createBattleCamera,
  getCameraPanDelta,
  jumpCameraToTile,
  moveCamera,
  setCameraZoom,
  screenToTile,
} from './camera';

describe('battle camera helpers', () => {
  const baseCamera = createBattleCamera({
    viewportWidthPx: 768,
    viewportHeightPx: 768,
    worldWidthPx: 40 * 64,
    worldHeightPx: 40 * 64,
  });

  it('clamps offsets inside the world bounds', () => {
    expect(clampCamera({ ...baseCamera, offsetX: -20, offsetY: -10 })).toMatchObject({
      offsetX: 0,
      offsetY: 0,
    });

    expect(moveCamera(baseCamera, 10_000, 10_000)).toMatchObject({
      offsetX: 40 * 64 - 768,
      offsetY: 40 * 64 - 768,
    });
  });

  it('converts screen coordinates to world tiles using the camera offset', () => {
    const camera = moveCamera(baseCamera, 160, 96);

    expect(screenToTile(camera, 0, 0, 40, 40)).toEqual({ x: 2, y: 1 });
    expect(screenToTile(camera, 191, 191, 40, 40)).toEqual({ x: 5, y: 4 });
  });

  it('jumps to a tile by centering the viewport and clamps at map edges', () => {
    expect(jumpCameraToTile(baseCamera, { x: 20, y: 20 })).toMatchObject({
      offsetX: 20 * 64 + 32 - 384,
      offsetY: 20 * 64 + 32 - 384,
    });

    expect(jumpCameraToTile(baseCamera, { x: 0, y: 0 })).toMatchObject({
      offsetX: 0,
      offsetY: 0,
    });

    expect(jumpCameraToTile(baseCamera, { x: 39, y: 39 })).toMatchObject({
      offsetX: 40 * 64 - 768,
      offsetY: 40 * 64 - 768,
    });
  });

  it('builds WASD pan deltas in pixels per second', () => {
    expect(getCameraPanDelta(new Set(['d']), 1000)).toEqual({ dx: 900, dy: 0 });
    expect(getCameraPanDelta(new Set(['w', 'a']), 1000)).toEqual({ dx: -900, dy: -900 });
    expect(getCameraPanDelta(new Set(), 1000)).toEqual({ dx: 0, dy: 0 });
  });

  it('clamps zoom level and updates the effective viewport size', () => {
    expect(setCameraZoom(baseCamera, 2, 0.5, 0.5)).toMatchObject({
      zoom: 1.5,
      viewportWidthPx: 512,
      viewportHeightPx: 512,
      offsetX: 128,
      offsetY: 128,
    });

    expect(setCameraZoom(baseCamera, 0.5, 0.5, 0.5)).toMatchObject({
      zoom: 0.75,
      viewportWidthPx: 1024,
      viewportHeightPx: 1024,
    });
  });

  it('keeps the anchored world point stable while zooming', () => {
    const camera = moveCamera(baseCamera, 160, 96);
    const worldPointBefore = {
      x: camera.offsetX + camera.viewportWidthPx * 0.25,
      y: camera.offsetY + camera.viewportHeightPx * 0.75,
    };

    const zoomed = setCameraZoom(camera, 1.25, 0.25, 0.75);

    expect(zoomed.offsetX + zoomed.viewportWidthPx * 0.25).toBeCloseTo(worldPointBefore.x, 6);
    expect(zoomed.offsetY + zoomed.viewportHeightPx * 0.75).toBeCloseTo(worldPointBefore.y, 6);
  });

  it('clamps zoomed offsets when anchoring near the map edge', () => {
    const edgeCamera = moveCamera(baseCamera, 10_000, 10_000);

    expect(setCameraZoom(edgeCamera, 1.5, 1, 1)).toMatchObject({
      offsetX: 40 * 64 - 512,
      offsetY: 40 * 64 - 512,
    });
  });
});
