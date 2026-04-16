import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/Button';
import { t } from '../i18n/zh';
import { http } from '../api/http';

export function getRankCardSummary(user: {
  isGuest: boolean;
  rank: number | null;
  projectedRank: number | null;
}): { title: string; value: string } {
  if (user.isGuest) {
    return {
      title: t('lobby_rank_guest_title'),
      value:
        user.projectedRank !== null
          ? `${t('lobby_rank_projected_prefix')} #${user.projectedRank}`
          : t('lobby_rank_projected_empty'),
    };
  }

  return {
    title: t('lobby_rank'),
    value: user.rank !== null ? `#${user.rank}` : t('lobby_rank_unranked'),
  };
}

export function LobbyPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const upgradeGuest = useAuthStore((s) => s.upgradeGuest);
  const logout = useAuthStore((s) => s.logout);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [username, setUsername] = useState(user?.username ?? '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    setUsername(user?.username ?? '');
  }, [user?.username]);

  const handleDebugServerMatch = async () => {
    try {
      const res = await http.post<{ matchId: string }>('/debug/create-match', {
        userAId: user?.id,
        userBId: user?.id,
      });
      navigate(`/battle/${res.data.matchId}`);
    } catch {
      navigate('/debug-battle');
    }
  };

  const handleUpgrade = async () => {
    setUpgradeError(null);
    setUpgrading(true);

    try {
      await upgradeGuest({
        username,
        email,
        password,
      });
      setEmail('');
      setPassword('');
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'response' in error &&
        typeof error.response === 'object' &&
        error.response !== null &&
        'data' in error.response &&
        typeof error.response.data === 'object' &&
        error.response.data !== null &&
        'error' in error.response.data &&
        typeof error.response.data.error === 'object' &&
        error.response.data.error !== null &&
        'message' in error.response.data.error &&
        typeof error.response.data.error.message === 'string'
      ) {
        setUpgradeError(error.response.data.error.message);
      } else {
        setUpgradeError(t('login_form_error'));
      }
    } finally {
      setUpgrading(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const rankCardSummary = getRankCardSummary({
    isGuest: user?.isGuest ?? true,
    rank: user?.rank ?? null,
    projectedRank: user?.projectedRank ?? null,
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-6xl mx-auto grid xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <section className="rounded-3xl border border-cyan-900/50 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_transparent_42%),linear-gradient(180deg,_rgba(8,17,32,0.98),_rgba(6,12,24,0.98))] p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <p className="text-sm uppercase tracking-[0.32em] text-cyan-300/80">Lobby</p>
              <h1 className="mt-3 text-4xl font-black">
                {t('lobby_welcome')}，{user?.username ?? '玩家'}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <span className="rounded-full bg-cyan-950/70 px-3 py-1 text-cyan-200">
                  {user?.isGuest ? t('lobby_guest_badge') : t('lobby_formal_badge')}
                </span>
                {user?.email && (
                  <span className="rounded-full bg-white/5 px-3 py-1 text-gray-300">
                    {t('lobby_email')}：{user.email}
                  </span>
                )}
              </div>
            </div>
            <Button variant="secondary" onClick={() => void handleLogout()}>
              {t('lobby_logout')}
            </Button>
          </div>

          <div className="mt-8 grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm text-cyan-200">{t('lobby_rating')}</div>
              <div className="mt-2 text-4xl font-black text-white">{user?.rating ?? '--'}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm text-cyan-200">{t('lobby_record')}</div>
              <div className="mt-2 text-3xl font-black text-white">
                {user ? `${user.wins} / ${user.losses}` : '--'}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <div className="text-sm text-cyan-200">{rankCardSummary.title}</div>
              <div className="mt-2 text-3xl font-black text-white">{rankCardSummary.value}</div>
            </div>
          </div>

          <div className="mt-8 grid sm:grid-cols-2 gap-4">
            <Button size="lg" onClick={() => navigate('/matchmaking')} className="bg-cyan-600 hover:bg-cyan-700">
              {t('lobby_ranked_queue')}
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/rankings')}>
              {t('lobby_rankings')}
            </Button>
            <Button
              size="lg"
              onClick={() => navigate('/debug-battle')}
              className="bg-purple-700 hover:bg-purple-800"
            >
              单机调试（对 AI）
            </Button>
            {import.meta.env.DEV && (
              <Button
                size="lg"
                onClick={() => void handleDebugServerMatch()}
                className="bg-yellow-700 hover:bg-yellow-800"
              >
                联机调试（同账号）
              </Button>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-gray-800 bg-gray-900/90 p-6 lg:p-8">
          <h2 className="text-2xl font-bold">账号状态</h2>
          <p className="mt-2 text-gray-400">
            {user?.isGuest
              ? '当前仍是游客账号。升级后将保留现在的 ELO、战绩和历史数据。'
              : '你已经在正式账号下进行排位，后续大厅数据会基于当前账号持续累积。'}
          </p>

          {user?.isGuest ? (
            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">{t('login_username')}</span>
                <input
                  className="w-full rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 outline-none transition-colors focus:border-cyan-500"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="升级后展示的昵称"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">{t('login_email')}</span>
                <input
                  className="w-full rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 outline-none transition-colors focus:border-cyan-500"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  type="email"
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">{t('login_password')}</span>
                <input
                  className="w-full rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 outline-none transition-colors focus:border-cyan-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 8 位"
                  type="password"
                />
              </label>
              {upgradeError && (
                <div className="rounded-2xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-200">
                  {upgradeError}
                </div>
              )}
              <Button className="w-full" onClick={() => void handleUpgrade()} disabled={upgrading}>
                {upgrading ? t('login_logging_in') : t('lobby_upgrade_submit')}
              </Button>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-4 text-emerald-200">
              账号升级已完成，现在可以直接用邮箱密码登录并持续参与排位。
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
