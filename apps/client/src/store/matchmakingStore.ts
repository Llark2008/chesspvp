import { create } from 'zustand';
import type { UserDto } from '@chesspvp/shared';
import type { PlayerSide } from '@chesspvp/shared';

type MatchmakingStatus = 'idle' | 'queued' | 'found' | 'ready';

interface MatchmakingState {
  status: MatchmakingStatus;
  matchId: string | null;
  opponent: UserDto | null;
  yourSide: PlayerSide | null;
  setQueued: () => void;
  setFound: (matchId: string, opponent: UserDto, side: PlayerSide) => void;
  setReady: () => void;
  reset: () => void;
}

export const useMatchmakingStore = create<MatchmakingState>((set) => ({
  status: 'idle',
  matchId: null,
  opponent: null,
  yourSide: null,
  setQueued: () => set({ status: 'queued' }),
  setFound: (matchId, opponent, side) =>
    set({ status: 'found', matchId, opponent, yourSide: side }),
  setReady: () => set({ status: 'ready' }),
  reset: () => set({ status: 'idle', matchId: null, opponent: null, yourSide: null }),
}));
