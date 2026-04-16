import { describe, expect, it, vi } from 'vitest';
import type { RecruitSource } from '@chesspvp/shared';
import { ZoomControls, formatZoomPercentage, getRecruitButtonLabel } from './BattleHUD';

describe('BattleHUD recruit button', () => {
  it('uses outpost-specific label when recruit source is an outpost', () => {
    const source: RecruitSource = {
      kind: 'outpost',
      position: { x: 5, y: 5 },
    };

    expect(getRecruitButtonLabel(source)).toBe('前哨站招募');
  });

  it('keeps the default label for base recruitment', () => {
    const source: RecruitSource = {
      kind: 'base',
      position: { x: 5, y: 0 },
    };

    expect(getRecruitButtonLabel(source)).toBe('招募');
  });

  it('formats the zoom percentage for the HUD control', () => {
    expect(formatZoomPercentage(1)).toBe('100%');
    expect(formatZoomPercentage(1.125)).toBe('113%');
  });

  it('wires zoom control buttons to the provided callbacks', () => {
    const onZoomOut = vi.fn();
    const onReset = vi.fn();
    const onZoomIn = vi.fn();

    const element = ZoomControls({
      zoom: 1.125,
      onZoomOut,
      onReset,
      onZoomIn,
    });

    const [, buttonRow] = element.props.children as [unknown, { props: { children: Array<{ props: { onClick: () => void; children: string } }> } }];
    const [minusButton, resetButton, plusButton] = buttonRow.props.children;

    expect(resetButton.props.children).toBe('113%');

    minusButton.props.onClick();
    resetButton.props.onClick();
    plusButton.props.onClick();

    expect(onZoomOut).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
    expect(onZoomIn).toHaveBeenCalledOnce();
  });
});
