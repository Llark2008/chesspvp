import unitsRaw from './units.json';
import mapsRaw from './maps.json';
import balanceRaw from './balance.json';
import type { UnitConfig, MapConfig, BalanceConfig, UnitType } from '../types';

export const UNITS = unitsRaw as Record<UnitType, UnitConfig>;
export const MAPS = mapsRaw as Record<string, MapConfig>;
export const BALANCE = balanceRaw as BalanceConfig;
export const DEFAULT_BATTLE_MAP_ID = 'frontier_30' as const;
