import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Button } from '../components/ui/Button';
import { t } from '../i18n/zh';

type LoginMode = 'guest' | 'login' | 'register';

function getErrorMessage(error: unknown): string {
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
    return error.response.data.error.message;
  }
  return t('login_form_error');
}

export function LoginPage() {
  const navigate = useNavigate();
  const loginAsGuest = useAuthStore((s) => s.loginAsGuest);
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const isAuthed = useAuthStore((s) => s.isAuthed);
  const isReady = useAuthStore((s) => s.isReady);
  const [mode, setMode] = useState<LoginMode>('guest');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthed) {
      navigate('/lobby', { replace: true });
    }
  }, [isAuthed, navigate]);

  const submitLabel = useMemo(() => {
    if (mode === 'login') return t('login_submit');
    if (mode === 'register') return t('login_register_submit');
    return t('login_guest_submit');
  }, [mode]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      if (mode === 'guest') {
        await loginAsGuest(username.trim() || undefined);
      } else if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ username, email, password });
      }
      navigate('/lobby', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isReady && !isAuthed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">
        正在恢复会话…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-5xl grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
        <section className="rounded-3xl border border-cyan-900/60 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.18),_transparent_45%),linear-gradient(135deg,_rgba(10,25,47,0.95),_rgba(6,12,24,0.98))] p-8 lg:p-10">
          <p className="inline-flex rounded-full border border-cyan-700/60 bg-cyan-950/50 px-3 py-1 text-sm text-cyan-200">
            排位上线准备完成
          </p>
          <h1 className="mt-6 text-5xl font-black tracking-tight">{t('login_title')}</h1>
          <p className="mt-4 max-w-xl text-lg text-slate-300 leading-8">
            游客可以直接进入排位。绑定邮箱后，你的 ELO、战绩和历史对局会继续保留在同一个账号上。
          </p>
          <div className="mt-10 grid sm:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-cyan-200">账号模式</div>
              <div className="mt-2 text-xl font-semibold">游客直玩</div>
              <div className="mt-2 text-sm text-slate-300">{t('login_guest_hint')}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-cyan-200">匹配逻辑</div>
              <div className="mt-2 text-xl font-semibold">ELO 约束匹配</div>
              <div className="mt-2 text-sm text-slate-300">系统会优先安排实力接近的对手，再随等待时间放宽范围。</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm text-cyan-200">大厅信息</div>
              <div className="mt-2 text-xl font-semibold">排行榜可见</div>
              <div className="mt-2 text-sm text-slate-300">进入大厅后即可查看当前 ELO、胜负和全局排名。</div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-gray-800 bg-gray-900/90 p-6 lg:p-8 shadow-2xl shadow-cyan-950/10">
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-gray-950/80 p-2">
            <button
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${mode === 'guest' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('guest')}
              type="button"
            >
              {t('login_guest_tab')}
            </button>
            <button
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${mode === 'login' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('login')}
              type="button"
            >
              {t('login_email_tab')}
            </button>
            <button
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${mode === 'register' ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('register')}
              type="button"
            >
              {t('login_register_tab')}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {(mode === 'guest' || mode === 'register') && (
              <label className="block">
                <span className="mb-2 block text-sm text-gray-300">{t('login_username')}</span>
                <input
                  className="w-full rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 outline-none transition-colors focus:border-cyan-500"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={mode === 'guest' ? '可选，不填将自动分配昵称' : '输入你的昵称'}
                />
              </label>
            )}

            {(mode === 'login' || mode === 'register') && (
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
            )}

            {(mode === 'login' || mode === 'register') && (
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
            )}

            {error && <div className="rounded-2xl border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-200">{error}</div>}

            <Button className="w-full" size="lg" onClick={() => void handleSubmit()} disabled={loading}>
              {loading ? t('login_logging_in') : submitLabel}
            </Button>

            <p className="text-sm text-gray-500">
              {mode === 'guest'
                ? t('login_guest_hint')
                : '正式账号使用邮箱+密码登录。游客升级后会继续保留当前分数和战绩。'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
