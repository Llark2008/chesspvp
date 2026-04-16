import * as PIXI from 'pixi.js';
import { UNITS, type BattleState, type Unit, type Position } from '@chesspvp/shared';
import type { AssetProvider, UnitSpriteHandle } from './assets/AssetProvider';
import { TILE_SIZE } from './constants';

interface UnitView {
  handle: UnitSpriteHandle;
  hpBar: PIXI.Graphics;
  hpBarBg: PIXI.Graphics;
  poisonBadge: PIXI.Container;
  poisonBadgeBg: PIXI.Graphics;
  poisonBadgeText: PIXI.Text;
  wrapper: PIXI.Container;
  maxHp: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class UnitRenderer {
  private container: PIXI.Container;
  private views: Map<string, UnitView> = new Map();
  private assetProvider: AssetProvider;

  constructor(world: PIXI.Container, assetProvider: AssetProvider) {
    this.assetProvider = assetProvider;
    this.container = new PIXI.Container();
    world.addChild(this.container);
  }

  syncWithState(state: BattleState): void {
    const liveIds = new Set(state.units.map((u) => u.id));

    // Remove dead units
    for (const [id, view] of this.views) {
      if (!liveIds.has(id)) {
        view.wrapper.destroy({ children: true });
        this.views.delete(id);
      }
    }

    // Add or update
    for (const unit of state.units) {
      if (!this.views.has(unit.id)) {
        this.addUnit(unit);
      } else {
        const view = this.views.get(unit.id)!;
        this.setUnitPosition(view, unit.position);
        this.updateHpBar(view, unit.hp, view.maxHp);
        this.updatePoisonBadge(view, unit.status.poisonStacks);
      }
    }
  }

  private addUnit(unit: Unit): void {
    const handle = this.assetProvider.createUnitSprite(unit.type, unit.owner, TILE_SIZE);
    const wrapper = new PIXI.Container();
    const maxHp = UNITS[unit.type].hp;

    const hpBarBg = new PIXI.Graphics();
    hpBarBg.beginFill(0x333333);
    hpBarBg.drawRect(4, TILE_SIZE - 10, TILE_SIZE - 8, 6);
    hpBarBg.endFill();

    const hpBar = new PIXI.Graphics();
    const poisonBadge = new PIXI.Container();
    poisonBadge.x = TILE_SIZE - 16;
    poisonBadge.y = 2;
    poisonBadge.visible = false;

    const poisonBadgeBg = new PIXI.Graphics();
    const poisonBadgeText = new PIXI.Text('', {
      fontSize: 10,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    poisonBadgeText.anchor.set(0.5);
    poisonBadgeText.x = 7;
    poisonBadgeText.y = 7;
    poisonBadge.addChild(poisonBadgeBg);
    poisonBadge.addChild(poisonBadgeText);

    wrapper.addChild(handle.container);
    wrapper.addChild(hpBarBg);
    wrapper.addChild(hpBar);
    wrapper.addChild(poisonBadge);
    this.setUnitPosition({ wrapper } as UnitView, unit.position);
    this.container.addChild(wrapper);

    const view: UnitView = {
      handle,
      hpBar,
      hpBarBg,
      poisonBadge,
      poisonBadgeBg,
      poisonBadgeText,
      wrapper,
      maxHp,
    };
    this.views.set(unit.id, view);
    this.updateHpBar(view, unit.hp, maxHp);
    this.updatePoisonBadge(view, unit.status.poisonStacks);
  }

  private setUnitPosition(view: Pick<UnitView, 'wrapper'>, pos: Position): void {
    view.wrapper.x = pos.x * TILE_SIZE;
    view.wrapper.y = pos.y * TILE_SIZE;
  }

  private updateHpBar(view: UnitView, hp: number, maxHp: number): void {
    const frac = Math.max(0, hp / maxHp);
    const color = frac > 0.6 ? 0x44cc44 : frac > 0.3 ? 0xcccc44 : 0xcc4444;
    view.hpBar.clear();
    view.hpBar.beginFill(color);
    view.hpBar.drawRect(4, TILE_SIZE - 10, (TILE_SIZE - 8) * frac, 6);
    view.hpBar.endFill();
  }

  private updatePoisonBadge(view: UnitView, poisonStacks: number): void {
    view.poisonBadge.visible = poisonStacks > 0;
    if (poisonStacks <= 0) return;

    view.poisonBadgeBg.clear();
    view.poisonBadgeBg.lineStyle(1, 0xe9d5ff, 0.9);
    view.poisonBadgeBg.beginFill(0x6d28d9, 0.95);
    view.poisonBadgeBg.drawCircle(7, 7, 7);
    view.poisonBadgeBg.endFill();
    view.poisonBadgeText.text = String(poisonStacks);
  }

  async animateMove(unitId: string, _from: Position, to: Position): Promise<void> {
    const view = this.views.get(unitId);
    if (!view) return;
    const targetX = to.x * TILE_SIZE;
    const targetY = to.y * TILE_SIZE;
    const steps = 10;
    const startX = view.wrapper.x;
    const startY = view.wrapper.y;
    for (let i = 1; i <= steps; i++) {
      view.wrapper.x = lerp(startX, targetX, i / steps);
      view.wrapper.y = lerp(startY, targetY, i / steps);
      await delay(20);
    }
  }

  async animateAttack(attackerId: string, targetPos: Position): Promise<void> {
    const view = this.views.get(attackerId);
    if (!view) return;
    const startX = view.wrapper.x;
    const startY = view.wrapper.y;
    const midX = lerp(startX, targetPos.x * TILE_SIZE, 0.4);
    const midY = lerp(startY, targetPos.y * TILE_SIZE, 0.4);
    // Lunge forward
    for (let i = 1; i <= 5; i++) {
      view.wrapper.x = lerp(startX, midX, i / 5);
      view.wrapper.y = lerp(startY, midY, i / 5);
      await delay(15);
    }
    // Pull back
    for (let i = 1; i <= 5; i++) {
      view.wrapper.x = lerp(midX, startX, i / 5);
      view.wrapper.y = lerp(midY, startY, i / 5);
      await delay(15);
    }
  }

  async animateDamage(unitId: string, _damage: number, hpAfter: number): Promise<void> {
    const view = this.views.get(unitId);
    if (!view) return;
    await view.handle.playHurt();
    this.updateHpBar(view, hpAfter, view.maxHp);
  }

  async animateHeal(unitId: string, hpAfter: number): Promise<void> {
    const view = this.views.get(unitId);
    if (!view) return;
    const startScale = view.wrapper.scale.x || 1;
    this.updateHpBar(view, hpAfter, view.maxHp);
    for (let i = 1; i <= 4; i++) {
      view.wrapper.scale.set(lerp(startScale, 1.12, i / 4));
      await delay(18);
    }
    for (let i = 1; i <= 4; i++) {
      view.wrapper.scale.set(lerp(1.12, startScale, i / 4));
      await delay(18);
    }
  }

  async animateBaseDamage(side: 'A' | 'B', hpAfter: number, maxHp: number): Promise<void> {
    // We don't have a base view here — handled by FxRenderer / HUD
    void side; void hpAfter; void maxHp;
  }

  async animateDeath(unitId: string): Promise<void> {
    const view = this.views.get(unitId);
    if (!view) return;
    await view.handle.playDeath();
    view.wrapper.destroy({ children: true });
    this.views.delete(unitId);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
