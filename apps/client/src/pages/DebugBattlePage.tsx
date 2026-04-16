import { DEFAULT_BATTLE_MAP_ID } from '@chesspvp/shared';
import { useEffect, useRef } from 'react';
import { BattleCanvas } from '../components/battle/BattleCanvas';
import { BattleHUD } from '../components/battle/BattleHUD';
import { MatchResultModal } from '../components/battle/MatchResultModal';
import { useBattleStore } from '../store/battleStore';
import { runDummyAiTurn } from '../debug/dummyAi';

const MATCH_ID = 'debug-match';
const MAP_ID = DEFAULT_BATTLE_MAP_ID;
const PLAYER_A = 'human';
const PLAYER_B = 'ai';

export function DebugBattlePage() {
  const storeInit = useBattleStore((s) => s.init);
  const storeDestroy = useBattleStore((s) => s.destroy);
  const engine = useBattleStore((s) => s.engine);
  const aiRunning = useRef(false);
  const prevCurrentPlayer = useRef<string | null>(null);

  useEffect(() => {
    storeInit(MATCH_ID, MAP_ID, PLAYER_A, PLAYER_B, 'A');
    return () => storeDestroy();
  }, [storeInit, storeDestroy]);

  // Watch for turn change to B → run AI
  useEffect(() => {
    const unsubscribe = useBattleStore.subscribe((s) => {
      const currentPlayer = s.engine?.state.currentPlayer;
      const winner = s.winner;
      const pendingLen = s.pendingEvents.length;

      if (winner) return;
      if (currentPlayer !== 'B') {
        prevCurrentPlayer.current = currentPlayer ?? null;
        return;
      }
      if (aiRunning.current) return;
      if (pendingLen > 0) return;
      // Only trigger once when it becomes B's turn
      if (prevCurrentPlayer.current === 'B') return;
      prevCurrentPlayer.current = 'B';

      aiRunning.current = true;
      setTimeout(() => {
        const { engine: eng } = useBattleStore.getState();
        if (!eng || eng.state.currentPlayer !== 'B' || eng.state.winner) {
          aiRunning.current = false;
          return;
        }
        const aiEvents = runDummyAiTurn(eng, 'B');
        const newState = eng.state;
        useBattleStore.setState((s) => ({
          winner: newState.winner,
          endReason: newState.endReason,
          phase: newState.winner ? 'ended' : 'idle',
          selectedUnitId: null,
          movableTiles: [],
          attackableTargets: [],
          abilityTargets: [],
          actionMode: null,
          pendingEvents: [...s.pendingEvents, ...aiEvents],
        }));
        aiRunning.current = false;
      }, 600);
    });
    return () => unsubscribe();
  }, []);

  if (!engine) {
    return (
      <div className="h-[100dvh] bg-gray-950 flex items-center justify-center text-white">
        加载中…
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-gray-950">
      <BattleHUD topNotice="单机调试模式 — 你是 A 方，AI 控制 B 方">
        <div className="relative h-full">
          <BattleCanvas />
        </div>
      </BattleHUD>
      <MatchResultModal />
    </div>
  );
}
