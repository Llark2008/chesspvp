import { http } from './http';
import type {
  GuestLoginResponse,
  GuestLoginRequest,
  LoginRequest,
  LoginResponse,
  LogoutResponse,
  MeDto,
  RegisterRequest,
  RegisterResponse,
  UpgradeGuestRequest,
  UpgradeGuestResponse,
} from '@chesspvp/shared';

export async function guestLogin(username?: string): Promise<GuestLoginResponse> {
  const payload: GuestLoginRequest = username ? { username } : {};
  const res = await http.post<GuestLoginResponse>('/auth/guest', payload);
  return res.data;
}

export async function registerAccount(payload: RegisterRequest): Promise<RegisterResponse> {
  const res = await http.post<RegisterResponse>('/auth/register', payload);
  return res.data;
}

export async function loginWithPassword(payload: LoginRequest): Promise<LoginResponse> {
  const res = await http.post<LoginResponse>('/auth/login', payload);
  return res.data;
}

export async function upgradeGuestAccount(
  payload: UpgradeGuestRequest,
): Promise<UpgradeGuestResponse> {
  const res = await http.post<UpgradeGuestResponse>('/auth/upgrade', payload);
  return res.data;
}

export async function fetchMe(): Promise<MeDto> {
  const res = await http.get<MeDto>('/me');
  return res.data;
}

export async function logoutAccount(): Promise<LogoutResponse> {
  const res = await http.post<LogoutResponse>('/auth/logout');
  return res.data;
}
