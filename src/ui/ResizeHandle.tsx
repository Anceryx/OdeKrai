import { useRef, type PointerEvent } from 'react';

export function ResizeHandle({
  label,
  value,
  min,
  max,
  onResize,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onResize: (width: number) => void;
}) {
  const pointerStart = useRef<{ x: number; width: number } | null>(null);

  function startResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    pointerStart.current = { x: event.clientX, width: value };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveResize(event: PointerEvent<HTMLDivElement>) {
    if (!pointerStart.current) return;
    const next = pointerStart.current.width + event.clientX - pointerStart.current.x;
    onResize(Math.max(min, Math.min(max, next)));
  }

  return (
    <div
      className="panel-resize-handle"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      onPointerDown={startResize}
      onPointerMove={moveResize}
      onPointerUp={() => {
        pointerStart.current = null;
      }}
      onPointerCancel={() => {
        pointerStart.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const direction = event.key === 'ArrowRight' ? 1 : -1;
        onResize(Math.max(min, Math.min(max, value + direction * (event.shiftKey ? 24 : 8))));
      }}
    />
  );
}
