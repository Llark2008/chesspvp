export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <div
      className="inline-block rounded-full border-2 border-gray-400 border-t-white animate-spin"
      style={{ width: size, height: size }}
    />
  );
}
