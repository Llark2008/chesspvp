type EnvSource = {
  PROD?: boolean;
  VITE_SERVER_HOST?: string;
  VITE_API_BASE_URL?: string;
  VITE_SOCKET_URL?: string;
  VITE_ASSET_PROVIDER?: string;
};

export function resolveEnv(
  source: EnvSource,
  runtimeHost: string = typeof window !== 'undefined' ? window.location.hostname : 'localhost',
) {
  const serverHost = source.VITE_SERVER_HOST ?? runtimeHost;

  return {
    API_BASE_URL: source.VITE_API_BASE_URL ?? (source.PROD ? '/api/v1' : `http://${serverHost}:3001/api/v1`),
    SOCKET_URL: source.VITE_SOCKET_URL ?? (source.PROD ? '' : `http://${serverHost}:3001`),
    ASSET_PROVIDER: (source.VITE_ASSET_PROVIDER ?? 'primitive') as 'primitive' | 'pixel',
  };
}

export const env = resolveEnv(import.meta.env);
