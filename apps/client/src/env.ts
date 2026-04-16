// When no explicit env var is set, use the same hostname the page was served
// from (e.g. 192.168.x.x when accessed over LAN) so --host just works.
const serverHost = import.meta.env.VITE_SERVER_HOST as string | undefined
  ?? (typeof window !== 'undefined' ? window.location.hostname : 'localhost');

export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL as string ?? `http://${serverHost}:3001/api/v1`,
  SOCKET_URL: import.meta.env.VITE_SOCKET_URL as string ?? `http://${serverHost}:3001`,
  ASSET_PROVIDER: (import.meta.env.VITE_ASSET_PROVIDER as string ?? 'primitive') as 'primitive' | 'pixel',
};
