import { http } from './http';
import type { RankingsResponse } from '@chesspvp/shared';

export async function fetchRankings(limit = 50): Promise<RankingsResponse> {
  const res = await http.get<RankingsResponse>('/rankings', {
    params: { limit },
  });
  return res.data;
}
