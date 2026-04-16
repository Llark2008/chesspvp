import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BattleCanvas } from '../components/battle/BattleCanvas';
import { BattleHUD } from '../components/battle/BattleHUD';
import { MatchResultModal } from '../components/battle/MatchResultModal';
import { useBattleStore, setBattleSocketMode } from '../store/battleStore';
import { useAuthStore } from '../store/authStore';
import { connectSocket } from '../api/socket';
import type {
  MatchStartPayload,
  EventBatchPayload,
  TurnChangedPayload,
  MatchEndedPayload,
  StateSnapshotPayload,
  OpponentDisconnectedPayload,
  PlayerSide,
} from '@chesspvp/shared';

export function BattlePage() {
  const { id: matchId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const engine = useBattleStore((s) => s.engine);
  const initFromState = useBattleStore((s) => s.initFromState);
  const storeDestroy = useBattleStore((s) => s.destroy);
  const applyServerEvents = useBattleStore((s) => s.applyServerEvents);
  const applyStateSnapshot = useBattleStore((s) => s.applyStateSnapshot);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const readySent = useRef(false);
  // Use a ref for the reconnect flag so the useEffect closure doesn't go stale
  // and the effect doesn't re-register listeners on every state change.
  const reconnectingRef = useRef(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [opponentDisconnected, setOpponentDisconnected] = useState(false);

  useEffect(() => {
    if (!matchId || !token || !user) {
      navigate('/lobby');
      return;
    }

    setBattleSocketMode(true);
    const socket = connectSocket(token);

    const onMatchStart = (data: MatchStartPayload) => {
      if (data.matchId !== matchId) return;
      const mySide: PlayerSide =
        data.initialState.players.A.userId === user.id ? 'A' : 'B';
      initFromState(data.initialState, mySide);
    };

    const onEventBatch = (data: EventBatchPayload) => {
      if (data.matchId !== matchId) return;
      applyServerEvents(data.events);
    };

    const onTurnChanged = (_data: TurnChangedPayload) => {
        // ENGINE state is already updated via STATE_SNAPSHOT; just reset UI selection.
      useBattleStore.setState({
        phase: 'idle',
        selectedUnitId: null,
        movableTiles: [],
        attackableTargets: [],
        abilityTargets: [],
        actionMode: null,
      });
    };

    const onMatchEnded = (data: MatchEndedPayload) => {
      if (data.matchId !== matchId) return;
      useBattleStore.setState({
        winner: data.winner,
        endReason: data.reason as never,
        phase: 'ended',
      });
    };

    const onStateSnapshot = (data: StateSnapshotPayload) => {
      if (data.matchId !== matchId) return;
      if (reconnectingRef.current) {
        // Full reset on reconnect — rebuild engine + mySide + clear queues
        reconnectingRef.current = false;
        setReconnecting(false);
        const mySide: PlayerSide =
          data.state.players.A.userId === user.id ? 'A' : 'B';
        initFromState(data.state, mySide);
      } else {
        // Mid-game sync — update engine WITHOUT clearing pendingEvents/animations.
        // But if mySide is still null it means MATCH_START hasn't arrived yet
        // (e.g. due to a server-side race on reconnect).  In that case treat the
        // snapshot as an initial load so mySide is also set correctly.
        const curMySide = useBattleStore.getState().mySide;
        if (!curMySide) {
          const mySide: PlayerSide =
            data.state.players.A.userId === user.id ? 'A' : 'B';
          initFromState(data.state, mySide);
        } else {
          applyStateSnapshot(data.state);
        }
      }
    };

    const onOpponentDisconnected = (_data: OpponentDisconnectedPayload) => {
      setOpponentDisconnected(true);
    };

    const onOpponentReconnected = () => {
      setOpponentDisconnected(false);
    };

    // Self-reconnect: when socket reconnects, request snapshot
    const onReconnect = () => {
      reconnectingRef.current = true;
      setReconnecting(true);
      socket.emit('REQUEST_SNAPSHOT', { matchId, fromSeq: 0 });
    };

    socket.on('MATCH_START', onMatchStart);
    socket.on('EVENT_BATCH', onEventBatch);
    socket.on('TURN_CHANGED', onTurnChanged);
    socket.on('MATCH_ENDED', onMatchEnded);
    socket.on('STATE_SNAPSHOT', onStateSnapshot);
    socket.on('OPPONENT_DISCONNECTED', onOpponentDisconnected);
    socket.on('OPPONENT_RECONNECTED', onOpponentReconnected);
    socket.io.on('reconnect', onReconnect);

    if (!readySent.current) {
      readySent.current = true;
      socket.emit('MATCH_READY', { matchId }, (ack) => {
        if (!ack.ok) {
          navigate('/lobby');
        }
      });
    }

    return () => {
      socket.off('MATCH_START', onMatchStart);
      socket.off('EVENT_BATCH', onEventBatch);
      socket.off('TURN_CHANGED', onTurnChanged);
      socket.off('MATCH_ENDED', onMatchEnded);
      socket.off('STATE_SNAPSHOT', onStateSnapshot);
      socket.off('OPPONENT_DISCONNECTED', onOpponentDisconnected);
      socket.off('OPPONENT_RECONNECTED', onOpponentReconnected);
      socket.io.off('reconnect', onReconnect);
      storeDestroy();
    };
  }, [matchId, token, user]);

  if (!engine) {
    return (
      <div className="h-[100dvh] bg-gray-950 flex items-center justify-center text-white">
        连接中…
      </div>
    );
  }

  return (
    <div className="h-[100dvh] overflow-hidden bg-gray-950">
      <BattleHUD>
        <div className="relative h-full w-full">
          <BattleCanvas />
          {reconnecting && (
            <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white text-xl">
              重新连接中…
            </div>
          )}
          {opponentDisconnected && !reconnecting && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-yellow-700/90 px-4 py-2 rounded text-white text-sm">
              对手已断线，等待重连（30 秒）
            </div>
          )}
        </div>
      </BattleHUD>
      <MatchResultModal />
    </div>
  );
}
