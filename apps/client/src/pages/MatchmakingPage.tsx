import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner } from '../components/ui/Spinner';
import { Button } from '../components/ui/Button';
import { t } from '../i18n/zh';
import { http } from '../api/http';
import { connectSocket } from '../api/socket';
import { useAuthStore } from '../store/authStore';
import type { MatchFoundPayload } from '@chesspvp/shared';

export function MatchmakingPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [status, setStatus] = useState<'searching' | 'found'>('searching');
  const [matchInfo, setMatchInfo] = useState<MatchFoundPayload | null>(null);
  const [countdown, setCountdown] = useState(3);
  const cancelledRef = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!token) {
      navigate('/');
      return;
    }

    // Join queue
    void http.post('/matchmaking/join').catch(() => {});

    const socket = connectSocket(token);

    const onMatchFound = (data: MatchFoundPayload) => {
      if (cancelledRef.current) return;
      setStatus('found');
      setMatchInfo(data);
      setCountdown(3);

      // Countdown 3s then navigate — BattlePage will send MATCH_READY
      let c = 3;
      countdownRef.current = setInterval(() => {
        c -= 1;
        setCountdown(c);
        if (c <= 0) {
          clearInterval(countdownRef.current);
          navigate(`/battle/${data.matchId}`);
        }
      }, 1000);
    };

    socket.on('MATCH_FOUND', onMatchFound);

    return () => {
      socket.off('MATCH_FOUND', onMatchFound);
      clearInterval(countdownRef.current);
    };
  }, [token, navigate]);

  const handleCancel = () => {
    cancelledRef.current = true;
    clearInterval(countdownRef.current);
    void http.post('/matchmaking/leave').catch(() => {});
    navigate('/lobby');
  };

  if (status === 'found' && matchInfo) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white gap-6 px-4">
        <div className="text-2xl font-bold text-green-400">{t('matchmaking_opponent_found')}</div>
        <div className="text-lg">
          对手：<span className="font-bold text-yellow-300">{matchInfo.opponent.username}</span>
        </div>
        <div className="text-gray-400">
          你是{' '}
          <span className="font-bold text-white">
            {matchInfo.yourSide === 'A' ? t('matchmaking_side_first') : t('matchmaking_side_second')}
          </span>
        </div>
        <div className="text-4xl font-bold text-white">{countdown}</div>
        <div className="text-gray-400 text-sm">{t('matchmaking_entering')}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center text-white gap-6 px-4">
      <div className="max-w-xl w-full rounded-3xl border border-cyan-900/50 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.12),_transparent_40%),linear-gradient(180deg,_rgba(10,18,33,0.98),_rgba(8,13,24,0.98))] p-8 text-center">
        <div className="mx-auto mb-6 w-fit rounded-full border border-cyan-800/60 bg-cyan-950/60 px-3 py-1 text-sm text-cyan-200">
          Ranked Queue
        </div>
        <Spinner size={48} />
        <h1 className="mt-6 text-3xl font-bold">{t('matchmaking_title')}</h1>
        <p className="mt-3 text-lg text-white">{t('matchmaking_finding')}</p>
        <p className="mt-3 text-sm leading-7 text-gray-400">{t('matchmaking_subtitle')}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left">
          <div className="text-sm text-cyan-200">{t('lobby_rating')}</div>
          <div className="mt-2 text-3xl font-black">{user?.rating ?? '--'}</div>
          <div className="mt-2 text-sm text-gray-400">
            {user ? `${t('lobby_record')}：${user.wins} / ${user.losses}` : ''}
          </div>
        </div>
        <Button className="mt-6" variant="secondary" onClick={handleCancel}>
          {t('matchmaking_cancel')}
        </Button>
      </div>
    </div>
  );
}
