import type { ReactNode } from 'react';
import type { RecruitSource } from '@chesspvp/shared';
import { getContextualRecruitSource, useBattleStore } from '../../store/battleStore';
import { GoldDisplay } from './GoldDisplay';
import { TurnTimer } from './TurnTimer';
import { UnitInfoCard } from './UnitInfoCard';
import { UnitActionPanel } from './UnitActionPanel';
import { RecruitPanel } from './RecruitPanel';
import { MiniMap } from './MiniMap';
import { Button } from '../ui/Button';
import { t } from '../../i18n/zh';
import { getHudSides } from '../../battle/perspective';

interface BattleHUDProps {
  children: ReactNode;
  topNotice?: ReactNode;
}

interface ZoomControlsProps {
  zoom: number;
  onZoomOut: () => void;
  onReset: () => void;
  onZoomIn: () => void;
}

export function getRecruitButtonLabel(source: RecruitSource | null): string {
  return source?.kind === 'outpost' ? t('battle_outpost_recruit') : t('battle_recruit');
}

export function formatZoomPercentage(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

export function ZoomControls({ zoom, onZoomOut, onReset, onZoomIn }: ZoomControlsProps) {
  return (
    <div className="rounded-lg bg-gray-800 p-3 text-white">
      <div className="mb-2 text-sm font-bold">{t('battle_zoom_title')}</div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="sm" onClick={onZoomOut}>
          -
        </Button>
        <Button variant="secondary" size="sm" onClick={onReset}>
          {formatZoomPercentage(zoom)}
        </Button>
        <Button variant="secondary" size="sm" onClick={onZoomIn}>
          +
        </Button>
      </div>
    </div>
  );
}

export function BattleHUD({ children, topNotice }: BattleHUDProps) {
  const { requestEndTurn, requestSurrender, openRecruitPanel, mySide, engine, phase } = useBattleStore();
  const cameraZoom = useBattleStore((state) => state.camera?.zoom ?? 1);
  const zoomIn = useBattleStore((state) => state.zoomIn);
  const zoomOut = useBattleStore((state) => state.zoomOut);
  const resetZoom = useBattleStore((state) => state.resetZoom);
  const recruitActionSource = useBattleStore((state) => {
    if (!state.engine || !state.mySide) return null;
    return getContextualRecruitSource(
      state.engine.state,
      state.mySide,
      state.selectedUnitId,
      state.inspectedUnitId,
    );
  });
  const currentPlayer = engine?.state.currentPlayer;
  const isMyTurn = currentPlayer === mySide;
  const isEnded = phase === 'ended';
  const [leftSide, rightSide] = getHudSides(mySide);

  return (
    <div className="h-full w-full bg-gray-950 text-white">
      <div className="mx-auto flex h-full w-full max-w-[1600px] min-h-0 flex-col gap-3 px-3 py-3 md:px-4">
        <div className="flex flex-col gap-2">
          {topNotice ? (
            <div className="rounded-lg bg-gray-900/80 px-3 py-2 text-center text-xs text-gray-300 md:text-sm">
              {topNotice}
            </div>
          ) : null}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-xl bg-gray-900/80 px-3 py-2">
            <div className="min-w-0 justify-self-start">
              <GoldDisplay side={leftSide} />
            </div>
            <div className="min-w-0 text-center">
              <div className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
                {isMyTurn ? t('battle_your_turn') : t('battle_opponent_turn')}
              </div>
              <div className="text-xs text-gray-500">
                第 {engine?.state.turnNumber ?? 1} 回合
              </div>
            </div>
            <div className="flex min-w-0 items-center justify-self-end gap-3">
              <TurnTimer />
              <GoldDisplay side={rightSide} />
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_clamp(240px,24vw,320px)] gap-3 overflow-hidden">
          <div className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-xl bg-gray-900/40 p-2">
            <div className="h-full w-full min-h-0 min-w-0">
              {children}
            </div>
          </div>
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-xl bg-gray-900/60 p-3">
            <MiniMap />
            <ZoomControls
              zoom={cameraZoom}
              onZoomOut={() => zoomOut()}
              onReset={() => resetZoom()}
              onZoomIn={() => zoomIn()}
            />
            <UnitInfoCard />
            <UnitActionPanel />
            <RecruitPanel />
          </div>
        </div>

        <div className="flex min-h-[56px] flex-wrap items-center justify-end gap-3 rounded-xl bg-gray-900/80 px-3 py-2">
          {!isEnded && isMyTurn && (
            <>
              <Button variant="danger" size="sm" onClick={() => requestSurrender()}>
                {t('battle_surrender')}
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => openRecruitPanel(recruitActionSource ?? undefined)}
              >
                {getRecruitButtonLabel(recruitActionSource)}
              </Button>
              <Button variant="primary" size="md" onClick={() => requestEndTurn()}>
                {t('battle_end_turn')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
