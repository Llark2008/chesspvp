import { useBattleStore } from '../../store/battleStore';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { t } from '../../i18n/zh';
import { useNavigate } from 'react-router-dom';

export function MatchResultModal() {
  const navigate = useNavigate();
  const winner = useBattleStore((s) => s.winner);
  const endReason = useBattleStore((s) => s.endReason);
  const mySide = useBattleStore((s) => s.mySide);
  const destroy = useBattleStore((s) => s.destroy);

  if (!winner) return null;

  const iWon = winner === mySide;
  const reasonLabels: Record<string, string> = {
    base_destroyed: t('result_base_destroyed'),
    surrender: t('result_surrender'),
    timeout: t('result_timeout'),
  };

  const handleReturn = () => {
    destroy();
    navigate('/lobby');
  };

  return (
    <Modal>
      <div className="flex flex-col items-center gap-4 py-2">
        <div className={`text-4xl font-bold ${iWon ? 'text-yellow-400' : 'text-gray-400'}`}>
          {iWon ? t('result_win') : t('result_lose')}
        </div>
        {endReason && (
          <div className="text-gray-300 text-sm">{reasonLabels[endReason] ?? endReason}</div>
        )}
        <Button onClick={handleReturn} size="lg">
          {t('result_back_lobby')}
        </Button>
      </div>
    </Modal>
  );
}
