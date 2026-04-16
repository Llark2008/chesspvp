import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/auth', () => ({
  guestLogin: vi.fn(),
  registerAccount: vi.fn(),
  loginWithPassword: vi.fn(),
  upgradeGuestAccount: vi.fn(),
  fetchMe: vi.fn(),
  logoutAccount: vi.fn(),
}));

vi.mock('../api/socket', () => ({
  connectSocket: vi.fn(),
  disconnectSocket: vi.fn(),
}));

import {
  fetchMe,
  guestLogin,
  loginWithPassword,
  logoutAccount,
  registerAccount,
  upgradeGuestAccount,
} from '../api/auth';
import { connectSocket, disconnectSocket } from '../api/socket';
import { useAuthStore } from './authStore';

function createLocalStorageMock() {
  const storage = new Map<string, string>();
  return {
    getItem(key: string) {
      return storage.has(key) ? storage.get(key)! : null;
    },
    setItem(key: string, value: string) {
      storage.set(key, value);
    },
    removeItem(key: string) {
      storage.delete(key);
    },
    clear() {
      storage.clear();
    },
  };
}

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const localStorageMock = createLocalStorageMock();
    vi.stubGlobal('localStorage', localStorageMock);
    useAuthStore.getState().logout({ skipRequest: true });
  });

  it('hydrates a saved session by validating /me and reconnecting the socket', async () => {
    localStorage.setItem('chesspvp_token', 'saved-token');
    vi.mocked(fetchMe).mockResolvedValue({
      id: 'user-1',
      username: 'HydratedHero',
      email: 'hero@example.com',
      isGuest: false,
      role: 'player',
      avatarUrl: null,
      rating: 1210,
      wins: 8,
      losses: 5,
      rank: 4,
      projectedRank: null,
    });

    await useAuthStore.getState().hydrate();

    expect(fetchMe).toHaveBeenCalledOnce();
    expect(connectSocket).toHaveBeenCalledWith('saved-token');
    expect(useAuthStore.getState()).toMatchObject({
      token: 'saved-token',
      isAuthed: true,
      user: expect.objectContaining({ username: 'HydratedHero', rank: 4 }),
    });
  });

  it('clears an invalid saved session during hydrate', async () => {
    localStorage.setItem('chesspvp_token', 'bad-token');
    vi.mocked(fetchMe).mockRejectedValue(new Error('401'));

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().isAuthed).toBe(false);
    expect(localStorage.getItem('chesspvp_token')).toBeNull();
    expect(disconnectSocket).toHaveBeenCalled();
  });

  it('logs in, registers, upgrades, and logs out through the auth API helpers', async () => {
    vi.mocked(loginWithPassword).mockResolvedValue({
      token: 'login-token',
      user: {
        id: 'user-login',
        username: 'LoginHero',
        email: 'login@example.com',
        isGuest: false,
        role: 'player',
        avatarUrl: null,
        rating: 1100,
        wins: 2,
        losses: 1,
        rank: 9,
        projectedRank: null,
      },
    });
    vi.mocked(registerAccount).mockResolvedValue({
      token: 'register-token',
      user: {
        id: 'user-register',
        username: 'RegisterHero',
        email: 'register@example.com',
        isGuest: false,
        role: 'player',
        avatarUrl: null,
        rating: 1000,
        wins: 0,
        losses: 0,
        rank: 100,
        projectedRank: null,
      },
    });
    vi.mocked(guestLogin).mockResolvedValue({
      token: 'guest-token',
      user: {
        id: 'user-guest',
        username: 'GuestHero',
        email: null,
        isGuest: true,
        role: 'player',
        avatarUrl: null,
        rating: 1000,
        wins: 0,
        losses: 0,
        rank: null,
        projectedRank: 50,
      },
    });
    vi.mocked(upgradeGuestAccount).mockResolvedValue({
      token: 'upgrade-token',
      user: {
        id: 'user-guest',
        username: 'GuestHeroPro',
        email: 'guest@example.com',
        isGuest: false,
        role: 'player',
        avatarUrl: null,
        rating: 1042,
        wins: 1,
        losses: 0,
        rank: 41,
        projectedRank: null,
      },
    });

    await useAuthStore.getState().loginAsGuest('GuestHero');
    expect(useAuthStore.getState().user?.isGuest).toBe(true);
    expect(useAuthStore.getState().user?.projectedRank).toBe(50);

    await useAuthStore.getState().upgradeGuest({
      username: 'GuestHeroPro',
      email: 'guest@example.com',
      password: 'password-1234',
    });
    expect(useAuthStore.getState().user).toMatchObject({
      username: 'GuestHeroPro',
      isGuest: false,
      rank: 41,
      projectedRank: null,
    });

    await useAuthStore.getState().register({
      username: 'RegisterHero',
      email: 'register@example.com',
      password: 'password-1234',
    });
    expect(useAuthStore.getState().token).toBe('register-token');

    await useAuthStore.getState().login({
      email: 'login@example.com',
      password: 'password-1234',
    });
    expect(useAuthStore.getState().user).toMatchObject({
      username: 'LoginHero',
      rank: 9,
      projectedRank: null,
    });

    await useAuthStore.getState().logout();
    expect(logoutAccount).toHaveBeenCalledOnce();
    expect(useAuthStore.getState().isAuthed).toBe(false);
    expect(localStorage.getItem('chesspvp_token')).toBeNull();
  });
});
