import { create } from 'zustand';
import type { LoginRequest, MeDto, RegisterRequest, UpgradeGuestRequest } from '@chesspvp/shared';
import {
  fetchMe,
  guestLogin,
  loginWithPassword,
  logoutAccount,
  registerAccount,
  upgradeGuestAccount,
} from '../api/auth';
import { connectSocket, disconnectSocket } from '../api/socket';

const TOKEN_KEY = 'chesspvp_token';

interface AuthState {
  token: string | null;
  user: MeDto | null;
  isAuthed: boolean;
  isReady: boolean;
  isHydrating: boolean;
  setAuth: (token: string, user: MeDto) => void;
  clearAuth: () => void;
  hydrate: () => Promise<void>;
  refreshMe: () => Promise<MeDto | null>;
  loginAsGuest: (username?: string) => Promise<MeDto>;
  register: (payload: RegisterRequest) => Promise<MeDto>;
  login: (payload: LoginRequest) => Promise<MeDto>;
  upgradeGuest: (payload: UpgradeGuestRequest) => Promise<MeDto>;
  logout: (options?: { skipRequest?: boolean }) => Promise<void>;
}

function persistSession(token: string, user: MeDto, set: (partial: Partial<AuthState>) => void) {
  localStorage.setItem(TOKEN_KEY, token);
  set({ token, user, isAuthed: true, isReady: true, isHydrating: false });
}

function clearSession(set: (partial: Partial<AuthState>) => void) {
  localStorage.removeItem(TOKEN_KEY);
  disconnectSocket();
  set({ token: null, user: null, isAuthed: false, isReady: true, isHydrating: false });
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthed: false,
  isReady: false,
  isHydrating: false,

  setAuth(token, user) {
    persistSession(token, user, set);
  },

  clearAuth() {
    clearSession(set);
  },

  async hydrate() {
    if (get().isHydrating) return;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ isReady: true, isHydrating: false });
      return;
    }

    set({ isHydrating: true, isReady: false, token });

    try {
      const user = await fetchMe();
      localStorage.setItem(TOKEN_KEY, token);
      set({ token, user, isAuthed: true, isReady: true, isHydrating: false });
      connectSocket(token);
    } catch {
      clearSession(set);
    }
  },

  async refreshMe() {
    const token = get().token;
    if (!token) return null;

    try {
      const user = await fetchMe();
      set({ user, isAuthed: true, isReady: true });
      return user;
    } catch {
      clearSession(set);
      return null;
    }
  },

  async loginAsGuest(username) {
    const { token, user } = await guestLogin(username);
    persistSession(token, user, set);
    connectSocket(token);
    return user;
  },

  async register(payload) {
    const { token, user } = await registerAccount(payload);
    persistSession(token, user, set);
    connectSocket(token);
    return user;
  },

  async login(payload) {
    const { token, user } = await loginWithPassword(payload);
    persistSession(token, user, set);
    connectSocket(token);
    return user;
  },

  async upgradeGuest(payload) {
    const { token, user } = await upgradeGuestAccount(payload);
    persistSession(token, user, set);
    connectSocket(token);
    return user;
  },

  async logout(options) {
    try {
      if (!options?.skipRequest && get().token) {
        await logoutAccount();
      }
    } finally {
      clearSession(set);
    }
  },
}));
