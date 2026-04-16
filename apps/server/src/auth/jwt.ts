import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

export interface JwtPayload {
  sub: string;
  username: string;
  isGuest: boolean;
  role: string;
  jti: string;
  iat: number;
  exp: number;
}

const secret = new TextEncoder().encode(config.JWT_SECRET);

export async function signJwt(payload: {
  sub: string;
  username: string;
  isGuest: boolean;
  role: string;
}) {
  const jti = crypto.randomUUID();
  const token = await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRES_IN)
    .sign(secret);
  return { token, jti };
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as JwtPayload;
}
