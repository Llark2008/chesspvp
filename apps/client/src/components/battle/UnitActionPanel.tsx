import { UNITS, type Unit } from '@chesspvp/shared';
import { useBattleStore, type BattleActionMode } from '../../store/battleStore';
import { Button } from '../ui/Button';
import { t } from '../../i18n/zh';

type UnitActionButton = {
  mode: BattleActionMode;
  label: string;
  disabled: boolean;
};

export function getUnitActionButtons(
  unit: Unit,
  actionMode: BattleActionMode | null
): Array<UnitActionButton & { active: boolean }> {
  const cfg = UNITS[unit.type];
  const buttons: UnitActionButton[] = [
    {
      mode: 'attack',
      label: unit.type === 'gunner' ? t('battle_artillery') : t('battle_attack'),
      disabled: false,
    },
    ...(cfg.abilities ?? []).map((ability) => {
      const cooldown = unit.cooldowns[ability.id] ?? 0;
      return {
        mode: `ability:${ability.id}` as BattleActionMode,
        label: cooldown > 0 ? `${ability.displayName}（冷却 ${cooldown}）` : ability.displayName,
        disabled: cooldown > 0,
      };
    }),
  ];

  return buttons.map((button) => ({
    ...button,
    active: actionMode === button.mode,
  }));
}

export function UnitActionPanel() {
  const { engine, selectedUnitId, mySide, phase, actionMode, setActionMode } = useBattleStore();

  if (!engine || !selectedUnitId || !mySide || phase !== 'unit_selected') return null;

  const unit = engine.state.units.find((candidate) => candidate.id === selectedUnitId);
  if (!unit || unit.owner !== mySide) return null;

  const canAct =
    engine.state.currentPlayer === mySide && !unit.hasActed;

  if (!canAct) return null;
  const actionButtons = getUnitActionButtons(unit, actionMode);

  return (
    <div className="bg-gray-800 rounded-lg p-3 text-white">
      <div className="font-bold text-sm mb-2">{t('battle_action_title')}</div>
      <div className="flex flex-col gap-2">
        {actionButtons.map((action) => {
          return (
            <Button
              key={action.mode}
              size="sm"
              variant={action.active ? 'primary' : 'secondary'}
              className="w-full"
              disabled={action.disabled}
              onClick={() => setActionMode(action.active ? null : action.mode)}
            >
              {action.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
