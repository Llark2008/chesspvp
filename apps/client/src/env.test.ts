import { describe, expect, it } from 'vitest';
import { resolveEnv } from './env';

describe('resolveEnv', () => {
  it('uses same-origin API and socket defaults in production', () => {
    const resolved = resolveEnv({ PROD: true }, 'prod.example.com');

    expect(resolved.API_BASE_URL).toBe('/api/v1');
    expect(resolved.SOCKET_URL).toBe('');
    expect(resolved.ASSET_PROVIDER).toBe('primitive');
  });

  it('keeps LAN-friendly host:3001 defaults in development', () => {
    const resolved = resolveEnv({ PROD: false }, '192.168.1.15');

    expect(resolved.API_BASE_URL).toBe('http://192.168.1.15:3001/api/v1');
    expect(resolved.SOCKET_URL).toBe('http://192.168.1.15:3001');
  });

  it('prefers explicit API and socket environment variables', () => {
    const resolved = resolveEnv({
      PROD: true,
      VITE_API_BASE_URL: 'https://api.example.com/v1',
      VITE_SOCKET_URL: 'https://socket.example.com',
      VITE_ASSET_PROVIDER: 'pixel',
    }, 'prod.example.com');

    expect(resolved.API_BASE_URL).toBe('https://api.example.com/v1');
    expect(resolved.SOCKET_URL).toBe('https://socket.example.com');
    expect(resolved.ASSET_PROVIDER).toBe('pixel');
  });
});
