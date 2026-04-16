import type { PlayerSide } from '../types/battle';

// Auth
export interface GuestLoginRequest {
  username?: string;
}
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpgradeGuestRequest {
  username: string;
  email: string;
  password: string;
}

export interface LogoutResponse {
  status: 'logged_out';
}

export interface UserDto {
  id: string;
  username: string;
  isGuest: boolean;
  role: string;
  avatarUrl: string | null;
  createdAt?: string;
}

export interface MeDto extends UserDto {
  email: string | null;
  rating: number;
  wins: number;
  losses: number;
  rank: number | null;
  projectedRank: number | null;
}

export interface AuthSuccessResponse {
  token: string;
  user: MeDto;
}

export type GuestLoginResponse = AuthSuccessResponse;
export type RegisterResponse = AuthSuccessResponse;
export type LoginResponse = AuthSuccessResponse;
export type UpgradeGuestResponse = AuthSuccessResponse;

// Matchmaking
export interface JoinQueueResponse {
  status: 'queued';
  queuedAt: number;
  estimatedWaitMs?: number;
}
export interface LeaveQueueResponse {
  status: 'left';
}

// Match
export interface MatchDto {
  id: string;
  playerAId: string;
  playerBId: string;
  winnerId: string | null;
  result: string;
  mapId: string;
  isRanked: boolean;
  durationMs: number;
  turnCount: number;
  startedAt: string;
  endedAt: string;
}

export interface RankingEntryDto {
  rank: number;
  userId: string;
  username: string;
  isGuest: boolean;
  rating: number;
  wins: number;
  losses: number;
}

export interface RankingsResponse {
  seasonId: number;
  entries: RankingEntryDto[];
}

// Error
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// Generic success wrapper
export interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: ApiError;
}

// Configs
export interface ConfigsUnitsResponse {
  units: Record<string, unknown>;
}

export interface DebugCreateMatchRequest {
  userAId: string;
  userBId: string;
}
export interface DebugCreateMatchResponse {
  matchId: string;
  playerASide: PlayerSide;
  playerBSide: PlayerSide;
}
