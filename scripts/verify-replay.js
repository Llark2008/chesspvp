#!/usr/bin/env node
/**
 * verify-replay.js <matchId>
 *
 * Fetches a match replay from the DB and verifies that
 * BattleEngine.replay(initialState, actions) produces a final
 * state with the same winner as recorded in the match.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/verify-replay.js <matchId>
 */

import { PrismaClient } from '@prisma/client';
import { BattleEngine } from '../packages/shared/src/engine/BattleEngine.js';

const matchId = process.argv[2];
if (!matchId) {
  console.error('Usage: node scripts/verify-replay.js <matchId>');
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  const [match, replay] = await Promise.all([
    prisma.match.findUnique({ where: { id: matchId } }),
    prisma.matchReplay.findUnique({ where: { matchId } }),
  ]);

  if (!match) {
    console.error(`Match ${matchId} not found`);
    process.exit(1);
  }
  if (!replay) {
    console.error(`Replay for match ${matchId} not found`);
    process.exit(1);
  }

  const actions = replay.actions;
  const initialState = replay.initialState;

  // replay() returns the final BattleEngine instance
  const finalEngine = BattleEngine.replay(initialState, actions.map((a) => a));
  const finalState = finalEngine.state;

  const replayWinner = finalState.winner;
  const recordedWinnerId = match.winnerId;

  // Determine recorded winner side
  const winnerSide =
    recordedWinnerId === match.playerAId ? 'A' :
    recordedWinnerId === match.playerBId ? 'B' : null;

  if (replayWinner === winnerSide) {
    console.log(`PASS: match ${matchId} winner=${replayWinner} (${match.result})`);
    process.exit(0);
  } else {
    console.error(
      `FAIL: recorded winner=${winnerSide}, replayed winner=${replayWinner}`,
    );
    process.exit(1);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
