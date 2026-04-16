import { useBattleStore } from '../../store/battleStore';
import { UNITS, BALANCE, isRecruitSourceEqual } from '@chesspvp/shared';
import type { BattleState, Position, RecruitSource, UnitType } from '@chesspvp/shared';
import { t } from '../../i18n/zh';
import { get4Neighbors, isInBounds } from '@chesspvp/shared';

const UNIT_TYPES: UnitType[] = [
  'warrior',
  'archer',
  'mage',
  'knight',
  'priest',
  'gunner',
  'scout',
  'poisoner',
];

export function RecruitPanel() {
  const { engine, mySide, phase, recruitSource, requestRecruit, cancelSelection } = useBattleStore();
  if (phase !== 'recruiting' || !engine || !mySide) return null;

  const state = engine.state;
  const myGold = state.players[mySide].gold;
  const myUnitCount = state.units.filter((u) => u.owner === mySide).length;
  const popCap = BALANCE.unit.populationCap;
  const myBase = state.bases.find((b) => b.owner === mySide);
  const map = { width: state.tiles[0]?.length ?? 12, height: state.tiles.length };
  const currentSource = recruitSource ?? (myBase
    ? { kind: 'base', position: { x: myBase.position.x, y: myBase.position.y } }
    : null);
  const alreadyOrdered = currentSource
    ? state.players[mySide].pendingRecruits.some((pending) => isRecruitSourceEqual(pending.source, currentSource))
    : false;

  const handleRecruit = (type: UnitType) => {
    if (!currentSource) return;
    const spawnAt = getFirstAvailableSpawnTile(state, currentSource, map);
    if (!spawnAt) return;
    requestRecruit(type, spawnAt);
  };

  if (!currentSource) return null;

  return (
    <div className="bg-gray-800 rounded-lg p-3 text-white">
      <div className="font-bold text-sm mb-2">{t('battle_recruit_title')}</div>
      <div className="text-xs text-cyan-300 mb-2">
        当前建筑：{formatRecruitSourceLabel(currentSource)}
      </div>
      {alreadyOrdered && (
        <div className="text-yellow-400 text-xs mb-2">该建筑本回合已下招募单</div>
      )}
      {myUnitCount >= popCap && (
        <div className="text-red-400 text-xs mb-2">人口已满</div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {UNIT_TYPES.map((type) => {
          const cfg = UNITS[type];
          const canAfford = myGold >= cfg.cost;
          const canRecruit = canAfford && myUnitCount < popCap && !alreadyOrdered;
          return (
            <button
              key={type}
              onClick={() => canRecruit && handleRecruit(type)}
              disabled={!canRecruit}
              className={`p-2 rounded border text-left transition-colors ${
                canRecruit
                  ? 'border-gray-500 hover:border-blue-400 hover:bg-gray-700 cursor-pointer'
                  : 'border-gray-700 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="font-medium text-sm">{cfg.displayName}</div>
              <div className="text-yellow-400 text-xs">💰 {cfg.cost} · 维 {cfg.upkeep}</div>
              <div className="text-gray-400 text-xs">HP:{cfg.hp} 攻:{cfg.atk}</div>
            </button>
          );
        })}
      </div>
      <button
        onClick={cancelSelection}
        className="mt-2 text-xs text-gray-400 hover:text-white w-full text-center"
      >
        取消
      </button>
    </div>
  );
}

function formatRecruitSourceLabel(source: RecruitSource): string {
  const label = source.kind === 'base' ? '基地' : '前哨站';
  return `${label} (${source.position.x},${source.position.y})`;
}

function getFirstAvailableSpawnTile(
  state: BattleState,
  source: RecruitSource,
  map: { width: number; height: number },
): Position | null {
  const candidates = source.kind === 'outpost'
    ? [source.position, ...get4Neighbors(source.position).filter((pos) => isInBounds(pos, map))]
    : get4Neighbors(source.position).filter((pos) => isInBounds(pos, map));

  return candidates.find((pos) => {
    const tile = state.tiles[pos.y]?.[pos.x];
    if (!tile) return false;
    if (tile.type === 'blocked' || tile.type === 'base_a' || tile.type === 'base_b') return false;
    return !state.units.some((unit) => unit.position.x === pos.x && unit.position.y === pos.y);
  }) ?? null;
}
