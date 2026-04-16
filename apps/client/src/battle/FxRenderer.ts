import * as PIXI from 'pixi.js';
import type { PlayerSide, Position } from '@chesspvp/shared';
import { TILE_SIZE } from './constants';
import { getResourceCapturePulseColor } from './resourceOwnership';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class FxRenderer {
  private container: PIXI.Container;

  constructor(world: PIXI.Container) {
    this.container = new PIXI.Container();
    world.addChild(this.container);
  }

  async showDamageNumber(pos: Position, damage: number): Promise<void> {
    await this.showFloatingText(pos, `-${damage}`, 0xff4444);
  }

  async showHealNumber(pos: Position, amount: number): Promise<void> {
    await this.showFloatingText(pos, `+${amount}`, 0x66dd88);
  }

  async showHealFlash(pos: Position): Promise<void> {
    const flash = new PIXI.Graphics();
    flash.beginFill(0x66dd88, 0.45);
    flash.drawCircle(0, 0, TILE_SIZE * 0.34);
    flash.endFill();
    flash.x = pos.x * TILE_SIZE + TILE_SIZE / 2;
    flash.y = pos.y * TILE_SIZE + TILE_SIZE / 2;
    this.container.addChild(flash);

    for (let i = 0; i < 8; i++) {
      flash.scale.set(1 + i * 0.08);
      flash.alpha = 0.45 - i * 0.05;
      await delay(20);
    }
    flash.destroy();
  }

  async showPoisonPulse(pos: Position): Promise<void> {
    const pulse = new PIXI.Graphics();
    pulse.lineStyle(3, 0x7c3aed, 0.95);
    pulse.beginFill(0x22c55e, 0.2);
    pulse.drawCircle(0, 0, TILE_SIZE * 0.28);
    pulse.endFill();
    pulse.x = pos.x * TILE_SIZE + TILE_SIZE / 2;
    pulse.y = pos.y * TILE_SIZE + TILE_SIZE / 2;
    this.container.addChild(pulse);

    for (let i = 0; i < 8; i++) {
      pulse.scale.set(1 + i * 0.08);
      pulse.alpha = 0.75 - i * 0.08;
      await delay(18);
    }

    pulse.destroy();
  }

  async showResourceCapturePulse(pos: Position, owner: PlayerSide | null): Promise<void> {
    const pulse = new PIXI.Graphics();
    const color = getResourceCapturePulseColor(owner);
    pulse.lineStyle(4, color, 0.95);
    pulse.beginFill(color, 0.16);
    pulse.drawRect(4, 4, TILE_SIZE - 8, TILE_SIZE - 8);
    pulse.endFill();
    pulse.x = pos.x * TILE_SIZE;
    pulse.y = pos.y * TILE_SIZE;
    this.container.addChild(pulse);

    for (let i = 0; i < 10; i++) {
      pulse.scale.set(1 + i * 0.04);
      pulse.alpha = 0.9 - i * 0.08;
      await delay(18);
    }

    pulse.destroy();
  }

  private async showFloatingText(pos: Position, textValue: string, color: number): Promise<void> {
    const text = new PIXI.Text(textValue, {
      fontSize: 18,
      fill: color,
      fontWeight: 'bold',
      stroke: 0x000000,
      strokeThickness: 3,
    });
    text.anchor.set(0.5);
    text.x = pos.x * TILE_SIZE + TILE_SIZE / 2;
    text.y = pos.y * TILE_SIZE + TILE_SIZE / 4;
    this.container.addChild(text);

    const steps = 20;
    for (let i = 0; i < steps; i++) {
      text.y -= 1;
      text.alpha = 1 - i / steps;
      await delay(30);
    }
    text.destroy();
  }

  async showTurnBanner(isMyTurn: boolean, appWidth: number, appHeight: number): Promise<void> {
    const bg = new PIXI.Graphics();
    bg.beginFill(0x000000, 0.5);
    bg.drawRect(0, appHeight / 2 - 40, appWidth, 80);
    bg.endFill();

    const text = new PIXI.Text(`${isMyTurn ? '我方' : '对方'}回合`, {
      fontSize: 36,
      fill: isMyTurn ? 0x88aaff : 0xff8888,
      fontWeight: 'bold',
    });
    text.anchor.set(0.5);
    text.x = appWidth / 2;
    text.y = appHeight / 2;

    this.container.addChild(bg);
    this.container.addChild(text);

    // Fade in
    bg.alpha = 0;
    text.alpha = 0;
    for (let i = 0; i <= 10; i++) {
      bg.alpha = i / 10;
      text.alpha = i / 10;
      await delay(30);
    }
    await delay(800);
    for (let i = 10; i >= 0; i--) {
      bg.alpha = i / 10;
      text.alpha = i / 10;
      await delay(30);
    }
    bg.destroy();
    text.destroy();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
