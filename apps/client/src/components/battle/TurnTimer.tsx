import { useEffect, useState } from 'react';
import { useBattleStore } from '../../store/battleStore';

function formatSecs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function TurnTimer() {
  const deadline = useBattleStore((s) => s.engine?.state.turnDeadline ?? 0);
  const mySide = useBattleStore((s) => s.mySide);
  const currentPlayer = useBattleStore((s) => s.engine?.state.currentPlayer ?? 'A');
  const reserveA = useBattleStore((s) => s.engine?.state.players['A'].reserveTimeMs ?? 0);
  const reserveB = useBattleStore((s) => s.engine?.state.players['B'].reserveTimeMs ?? 0);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const tick = () => {
      setRemaining(Math.max(0, deadline - Date.now()));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [deadline]);

  const isMyTurn = currentPlayer === mySide;
  const myReserve = mySide === 'A' ? reserveA : reserveB;
  const frac = Math.min(1, remaining / 75000);

  return (
    <div className="flex flex-col items-center gap-1 min-w-32">
      <div className={`text-lg font-mono font-bold ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
        {formatSecs(remaining)}
      </div>
      <div className="w-full h-2 bg-gray-600 rounded">
        <div
          className={`h-full rounded transition-all ${frac > 0.4 ? 'bg-green-500' : frac > 0.2 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${frac * 100}%` }}
        />
      </div>
      <div className="text-xs text-gray-400">备用 {formatSecs(myReserve)}</div>
    </div>
  );
}
