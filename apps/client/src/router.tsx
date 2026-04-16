import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { LobbyPage } from './pages/LobbyPage';
import { MatchmakingPage } from './pages/MatchmakingPage';
import { BattlePage } from './pages/BattlePage';
import { DebugBattlePage } from './pages/DebugBattlePage';
import { RankingsPage } from './pages/RankingsPage';
import { useAuthStore } from './store/authStore';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthed = useAuthStore((s) => s.isAuthed);
  const isReady = useAuthStore((s) => s.isReady);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        正在恢复会话…
      </div>
    );
  }

  if (!isAuthed) return <Navigate to="/" replace />;
  return <>{children}</>;
}

const routes: RouteObject[] = [
  { path: '/', element: <LoginPage /> },
  {
    path: '/lobby',
    element: (
      <RequireAuth>
        <LobbyPage />
      </RequireAuth>
    ),
  },
  {
    path: '/matchmaking',
    element: (
      <RequireAuth>
        <MatchmakingPage />
      </RequireAuth>
    ),
  },
  {
    path: '/battle/:id',
    element: (
      <RequireAuth>
        <BattlePage />
      </RequireAuth>
    ),
  },
  {
    path: '/debug-battle',
    element: <DebugBattlePage />,
  },
  {
    path: '/rankings',
    element: (
      <RequireAuth>
        <RankingsPage />
      </RequireAuth>
    ),
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const router: ReturnType<typeof createBrowserRouter> = createBrowserRouter(routes) as any;
