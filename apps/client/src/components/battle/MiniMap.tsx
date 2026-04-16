import type { MouseEvent } from 'react';
import { useBattleStore } from '../../store/battleStore';
import { TILE_SIZE } from '../../battle/constants';
import { getOutpostOwnershipCssColor, getResourceOwnershipCssColor } from '../../battle/resourceOwnership';

function getTileColor(
  type: 'plain' | 'blocked' | 'resource' | 'outpost' | 'base_a' | 'base_b',
  resourceOwner?: 'A' | 'B' | null,
  outpostOwner?: 'A' | 'B' | null,
) {
  switch (type) {
    case 'blocked':
      return '#475569';
    case 'resource':
      return getResourceOwnershipCssColor(resourceOwner);
    case 'outpost':
      return getOutpostOwnershipCssColor(outpostOwner);
    case 'base_a':
      return '#1d4ed8';
    case 'base_b':
      return '#b91c1c';
    case 'plain':
    default:
      return '#355e2f';
  }
}

export function MiniMap() {
  const engine = useBattleStore((state) => state.engine);
  const camera = useBattleStore((state) => state.camera);
  const jumpCameraToTile = useBattleStore((state) => state.jumpCameraToTile);

  if (!engine || !camera) return null;

  const state = engine.state;
  const mapHeight = state.tiles.length;
  const mapWidth = state.tiles[0]?.length ?? 0;
  const viewportTileWidth = camera.viewportWidthPx / TILE_SIZE;
  const viewportTileHeight = camera.viewportHeightPx / TILE_SIZE;

  const handleClick = (event: MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const tileX = Math.max(0, Math.min(mapWidth - 1, Math.floor(((event.clientX - rect.left) / rect.width) * mapWidth)));
    const tileY = Math.max(0, Math.min(mapHeight - 1, Math.floor(((event.clientY - rect.top) / rect.height) * mapHeight)));
    jumpCameraToTile({ x: tileX, y: tileY });
  };

  return (
    <div className="bg-gray-800 rounded-lg p-3 text-white">
      <div className="font-bold text-sm mb-2">小地图</div>
      <svg
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        className="w-full rounded border border-gray-700 bg-gray-950 cursor-pointer"
        style={{ aspectRatio: `${mapWidth} / ${mapHeight}` }}
        onClick={handleClick}
      >
        {state.tiles.flat().map((tile) => (
          <rect
            key={`${tile.position.x},${tile.position.y}`}
            x={tile.position.x}
            y={tile.position.y}
            width={1}
            height={1}
            fill={getTileColor(tile.type, tile.resourceOwner, tile.outpostOwner)}
          />
        ))}

        {state.units.map((unit) => (
          <circle
            key={unit.id}
            cx={unit.position.x + 0.5}
            cy={unit.position.y + 0.5}
            r={0.34}
            fill={unit.owner === 'A' ? '#93c5fd' : '#fca5a5'}
            stroke="#111827"
            strokeWidth={0.08}
          />
        ))}

        <rect
          x={camera.offsetX / TILE_SIZE}
          y={camera.offsetY / TILE_SIZE}
          width={viewportTileWidth}
          height={viewportTileHeight}
          fill="none"
          stroke="#f8fafc"
          strokeWidth={0.18}
        />
      </svg>
    </div>
  );
}
