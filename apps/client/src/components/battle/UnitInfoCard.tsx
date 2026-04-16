import { useBattleStore } from '../../store/battleStore';
import { BALANCE, UNITS, getUnitEffectiveDefense, getUnitOutpostDefenseBonus, type BattleState, type Unit } from '@chesspvp/shared';
import { getRelationLabel } from '../../battle/perspective';

export function getUnitStatusTexts(unit: Unit): {
  poisonText: string;
  poisonBurstCooldownText: string | null;
} {
  const poisonStacks = unit.status.poisonStacks;
  const poisonMaxStacks = BALANCE.status.poison.maxStacks;
  const poisonBurstCooldown = unit.cooldowns.poison_burst ?? 0;

  return {
    poisonText: `中毒：${poisonStacks}/${poisonMaxStacks}`,
    poisonBurstCooldownText:
      unit.type === 'poisoner'
        ? `毒爆冷却：${poisonBurstCooldown > 0 ? poisonBurstCooldown : '可用'}`
        : null,
  };
}

export function getUnitDefenseSummary(
  state: BattleState | null | undefined,
  unit: Unit,
): {
  effectiveDefense: number;
  outpostDefenseBonus: number;
  outpostDefenseBonusText: string | null;
} {
  const outpostDefenseBonus = state ? getUnitOutpostDefenseBonus(state, unit) : 0;
  return {
    effectiveDefense: state ? getUnitEffectiveDefense(state, unit) : UNITS[unit.type].def,
    outpostDefenseBonus,
    outpostDefenseBonusText: outpostDefenseBonus > 0 ? `前哨掩护 +${outpostDefenseBonus}` : null,
  };
}

export function UnitInfoCard() {
  const inspectedId = useBattleStore((s) => s.inspectedUnitId);
  const mySide = useBattleStore((s) => s.mySide);
  const battleState = useBattleStore((s) => s.engine?.state ?? null);
  const unit = useBattleStore((s) =>
    s.inspectedUnitId ? s.engine?.state.units.find((u) => u.id === s.inspectedUnitId) : null
  );
  if (!inspectedId || !unit) return null;

  const cfg = UNITS[unit.type];
  const hpFrac = unit.hp / cfg.hp;
  const statusTexts = getUnitStatusTexts(unit);
  const defenseSummary = getUnitDefenseSummary(battleState, unit);

  return (
    <div className="bg-gray-800 rounded-lg p-3 text-sm text-white min-w-0">
      <div className="font-bold text-base mb-1">
        {cfg.displayName}
        <span className="text-xs text-gray-400 ml-2">{getRelationLabel(unit.owner, mySide)}</span>
      </div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-gray-400">HP</span>
        <div className="flex-1 h-2 bg-gray-600 rounded">
          <div
            className={`h-full rounded ${hpFrac > 0.6 ? 'bg-green-500' : hpFrac > 0.3 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${hpFrac * 100}%` }}
          />
        </div>
        <span className="text-white font-mono text-xs">{unit.hp}/{cfg.hp}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-gray-300">
        <span>攻 {cfg.atk}</span>
        <span>防 {defenseSummary.effectiveDefense}</span>
        <span>射程 {cfg.minRange}-{cfg.maxRange}</span>
        <span>移 {cfg.moveRange}</span>
      </div>
      {cfg.abilities?.length ? (
        <div className="mt-2 text-xs text-emerald-300">
          技能：{cfg.abilities.map((ability) => ability.displayName).join(' / ')}
        </div>
      ) : null}
      <div className="mt-2 text-xs text-violet-300">{statusTexts.poisonText}</div>
      {statusTexts.poisonBurstCooldownText ? (
        <div className="text-xs text-amber-300">{statusTexts.poisonBurstCooldownText}</div>
      ) : null}
      {defenseSummary.outpostDefenseBonusText ? (
        <div className="text-xs text-sky-300 mt-1">{defenseSummary.outpostDefenseBonusText}</div>
      ) : null}
      {unit.hasActed && <div className="text-xs text-gray-500 mt-1">已行动</div>}
      {unit.spawnedThisTurn && <div className="text-xs text-yellow-500 mt-1">刚招募</div>}
    </div>
  );
}
