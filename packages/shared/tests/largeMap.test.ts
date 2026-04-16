import { describe, expect, it } from 'vitest';
import { DEFAULT_BATTLE_MAP_ID, MAPS } from '../src/configs';
import { createInitialState } from '../src/engine/initialState';
import { computeMovableTiles } from '../src/engine/pathfinding';

describe('large map configuration', () => {
  it('frontier_30 is the default playable 30x30 battlefield', () => {
    expect(DEFAULT_BATTLE_MAP_ID).toBe('frontier_30');
    expect(MAPS.frontier_30).toBeDefined();

    const state = createInitialState('large-map', DEFAULT_BATTLE_MAP_ID, 'userA', 'userB', 0);

    expect(state.tiles).toHaveLength(30);
    expect(state.tiles[0]).toHaveLength(30);
    expect(state.bases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: 'A', position: { x: 4, y: 15 } }),
        expect.objectContaining({ owner: 'B', position: { x: 25, y: 15 } }),
      ]),
    );

    const resourceTiles = state.tiles.flat().filter((tile) => tile.type === 'resource');
    const blockedTiles = state.tiles.flat().filter((tile) => tile.type === 'blocked');
    const outpostTiles = state.tiles.flat().filter((tile) => tile.type === 'outpost');

    expect(resourceTiles).toHaveLength(6);
    expect(blockedTiles).toHaveLength(24);
    expect(outpostTiles).toHaveLength(2);
    expect(outpostTiles.every((tile) => tile.outpostOwner === null)).toBe(true);
    expect(state.units.filter((unit) => unit.owner === 'A')).toHaveLength(3);
    expect(state.units.filter((unit) => unit.owner === 'B')).toHaveLength(3);
  });

  it('supports pathfinding near the far edge on frontier_30 without 12x12 or 40x40 assumptions', () => {
    const state = createInitialState('large-map-pathing', 'frontier_30', 'userA', 'userB', 0);
    const knight = state.units.find((unit) => unit.owner === 'B' && unit.type === 'knight');

    expect(knight).toBeDefined();

    const movable = computeMovableTiles(state, knight!.id);

    expect(movable.length).toBeGreaterThan(0);
    expect(movable.every((pos) => pos.x >= 0 && pos.x < 30 && pos.y >= 0 && pos.y < 30)).toBe(true);
  });

  it('frontier_40 remains a playable explicit regression map', () => {
    expect(MAPS.frontier_40).toBeDefined();

    const state = createInitialState('large-map-frontier-40', 'frontier_40', 'userA', 'userB', 0);

    expect(state.tiles).toHaveLength(40);
    expect(state.tiles[0]).toHaveLength(40);
    expect(state.bases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ owner: 'A', position: { x: 4, y: 20 } }),
        expect.objectContaining({ owner: 'B', position: { x: 35, y: 20 } }),
      ]),
    );
  });
});
