import type { UnitType, Position, RecruitSource } from './battle';

export type Action =
  | { type: 'MOVE'; payload: { unitId: string; to: Position } }
  | { type: 'ATTACK'; payload: { unitId: string; targetId?: string; targetPos?: Position } }
  | { type: 'USE_ABILITY'; payload: { unitId: string; abilityId: string; targetId?: string; targetPos?: Position } }
  | { type: 'RECRUIT'; payload: { unitType: UnitType; source: RecruitSource; spawnAt: Position } }
  | { type: 'END_TURN'; payload: Record<string, never> }
  | { type: 'SURRENDER'; payload: Record<string, never> };
