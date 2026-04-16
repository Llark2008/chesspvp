import { useBattleStore } from '../../store/battleStore';
import { BALANCE, computePlayerUpkeep } from '@chesspvp/shared';
import type { PlayerSide } from '@chesspvp/shared';
import { getRelationLabel } from '../../battle/perspective';

export function GoldDisplay({ side }: { side: PlayerSide }) {
  const gold = useBattleStore((s) => s.engine?.state.players[side].gold ?? 0);
  const upkeep = useBattleStore((s) =>
    s.engine ? computePlayerUpkeep(s.engine.state, side) : 0
  );
  const baseHp = useBattleStore((s) => s.engine?.state.bases.find((b) => b.owner === side)?.hp ?? 0);
  const isCurrentPlayer = useBattleStore((s) => s.engine?.state.currentPlayer === side);
  const mySide = useBattleStore((s) => s.mySide);
  const fog = useBattleStore((s) => s.engine?.state.fog);
  const maxHp = BALANCE.base.maxHp;
  const hpFrac = baseHp / maxHp;
  const hpColor = hpFrac > 0.6 ? 'text-green-400' : hpFrac > 0.3 ? 'text-yellow-400' : 'text-red-400';

  // 战争迷雾：对手金币信息不可知
  const isOpponentInFog = fog !== undefined && fog.perspective !== side;

  return (
    <div className={`flex flex-col gap-0.5 px-3 py-1 rounded ${isCurrentPlayer ? 'bg-yellow-700/50' : 'bg-gray-700/50'}`}>
      <div className="flex items-center gap-1">
        <span className="text-yellow-400 font-bold">💰</span>
        {isOpponentInFog ? (
          <span className="text-gray-400 font-mono">?</span>
        ) : (
          <span className="text-white font-mono">{gold}</span>
        )}
        <span className="text-gray-400 text-sm">{getRelationLabel(side, mySide)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-cyan-300 text-xs font-mono">
          维 {isOpponentInFog ? '?' : `-${upkeep}`}
        </span>
        <span className="text-red-400 text-xs">🏯</span>
        <div className="w-16 h-1.5 bg-gray-600 rounded">
          <div
            className={`h-full rounded ${hpFrac > 0.6 ? 'bg-green-500' : hpFrac > 0.3 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${hpFrac * 100}%` }}
          />
        </div>
        <span className={`text-xs font-mono ${hpColor}`}>{baseHp}</span>
      </div>
    </div>
  );
}
