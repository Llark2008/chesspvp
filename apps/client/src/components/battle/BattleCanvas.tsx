import { useEffect, useRef } from 'react';
import { BattleScene } from '../../battle/BattleScene';
import { PrimitiveAssetProvider } from '../../battle/assets/PrimitiveAssetProvider';
import { computeBattleDisplaySize } from '../../battle/display';
import { env } from '../../env';

export function BattleCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const provider =
      env.ASSET_PROVIDER === 'pixel'
        ? new PrimitiveAssetProvider() // PixelAssetProvider placeholder
        : new PrimitiveAssetProvider();

    const scene = new BattleScene({
      container: containerRef.current,
      assetProvider: provider,
    });
    scene.mount();
    const resize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const displaySize = computeBattleDisplaySize(rect.width, rect.height);
      if (displaySize > 0) {
        scene.resize(displaySize, displaySize);
      }
    };
    const observer = new ResizeObserver(() => resize());
    observer.observe(containerRef.current);
    resize();

    return () => {
      observer.disconnect();
      scene.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full items-center justify-center overflow-hidden"
    />
  );
}
