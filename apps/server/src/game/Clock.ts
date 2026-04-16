import type { PlayerSide } from '@chesspvp/shared';

export class Clock {
  private reserve: Record<PlayerSide, number>;

  constructor(initialReserveMs: number) {
    this.reserve = { A: initialReserveMs, B: initialReserveMs };
  }

  /** Drain reserve time. Returns how much was actually drained. */
  drainReserve(side: PlayerSide, ms: number): number {
    const old = this.reserve[side];
    this.reserve[side] = Math.max(0, old - ms);
    return old - this.reserve[side];
  }

  getReserve(side: PlayerSide): number {
    return this.reserve[side];
  }

  snapshot() {
    return {
      A: { reserveMs: this.reserve.A },
      B: { reserveMs: this.reserve.B },
    };
  }
}
