import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pixi.js', () => ({
  Rectangle: class Rectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number
    ) {}
  },
}));

describe('InputController', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1),
      cancelAnimationFrame: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('normalizes wheel zoom events relative to the battle canvas', async () => {
    const { InputController } = await import('./InputController');

    const listeners = new Map<string, EventListener>();
    const stage = {
      eventMode: 'auto',
      hitArea: null,
      on: vi.fn(),
      off: vi.fn(),
    };
    const board = {
      screenToPosition: vi.fn(() => null),
      setHover: vi.fn(),
    };
    const canvas = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
      getBoundingClientRect: vi.fn(() => ({
        left: 10,
        top: 20,
        width: 200,
        height: 100,
      })),
    };

    const input = new InputController();
    const onZoom = vi.fn();
    input.onZoom = onZoom;
    input.bind(stage as never, board as never, canvas as never);

    const preventDefault = vi.fn();
    listeners.get('wheel')?.({
      deltaY: -120,
      clientX: 110,
      clientY: 70,
      preventDefault,
    } as unknown as Event);

    expect(onZoom).toHaveBeenCalledWith('in', 0.5, 0.5);
    expect(preventDefault).toHaveBeenCalled();
  });
});
