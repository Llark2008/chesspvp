import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RankingEntryDto } from '@chesspvp/shared';
import { fetchRankings } from '../api/rankings';
import { Button } from '../components/ui/Button';
import { t } from '../i18n/zh';

export function RankingsPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<RankingEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setLoading(true);
        const data = await fetchRankings();
        if (!cancelled) {
          setEntries(data.entries);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError(t('err_network'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white px-4 py-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{t('rankings_title')}</h1>
            <p className="text-gray-400 mt-2">{t('rankings_subtitle')}</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/lobby')}>
            {t('rankings_back')}
          </Button>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/80 overflow-hidden">
          <div className="grid grid-cols-[96px_1fr_120px_160px] gap-4 px-5 py-4 text-sm text-gray-400 border-b border-gray-800">
            <div>{t('rankings_column_rank')}</div>
            <div>{t('rankings_column_player')}</div>
            <div>{t('rankings_column_rating')}</div>
            <div>{t('rankings_column_record')}</div>
          </div>

          {loading && <div className="px-5 py-8 text-gray-400">{t('lobby_refreshing')}</div>}
          {!loading && error && <div className="px-5 py-8 text-red-400">{error}</div>}
          {!loading && !error && entries.length === 0 && (
            <div className="px-5 py-8 text-gray-400">{t('rankings_empty')}</div>
          )}
          {!loading &&
            !error &&
            entries.map((entry) => (
              <div
                key={entry.userId}
                className="grid grid-cols-[96px_1fr_120px_160px] gap-4 px-5 py-4 border-b border-gray-800/80 last:border-b-0"
              >
                <div className="font-semibold text-yellow-300">#{entry.rank}</div>
                <div className="font-semibold text-white">{entry.username}</div>
                <div className="font-semibold text-cyan-300">{entry.rating}</div>
                <div className="text-gray-300">
                  {entry.wins} / {entry.losses}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
