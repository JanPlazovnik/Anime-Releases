import { useState, type ReactNode } from "react";
import { SWIPE_NAVIGATE_DISTANCE, useHorizontalDrag } from "./shared";

export default function SwipePager({
  onChange,
  pageKey,
  renderPage,
}: {
  onChange: (direction: 1 | -1) => void;
  pageKey: (offset: -1 | 0 | 1) => string;
  renderPage: (offset: -1 | 0 | 1) => ReactNode;
}) {
  const [settling, setSettling] = useState(false);
  const [target, setTarget] = useState<-1 | 0 | 1>(0);
  const { attach, dragX, onTouchStart, onTouchEnd } = useHorizontalDrag((dx) => {
    setTarget(Math.abs(dx) > SWIPE_NAVIGATE_DISTANCE ? (dx < 0 ? 1 : -1) : 0);
    setSettling(true);
  });

  const finish = () => {
    if (target !== 0) onChange(target);
    setTarget(0);
    setSettling(false);
  };

  return (
    <div
      ref={attach}
      className="flex min-h-0 flex-1 touch-pan-y overflow-hidden"
      onTouchStart={(e) => {
        if (settling) finish();
        onTouchStart(e);
      }}
      onTouchEnd={onTouchEnd}
    >
      <div
        className={`flex min-h-0 w-[300%] shrink-0 ${settling ? "transition-transform duration-300 ease-out" : ""}`}
        style={{ transform: `translateX(calc(${((-1 - target) * 100) / 3}% + ${dragX}px))` }}
        onTransitionEnd={(e) => e.target === e.currentTarget && finish()}
      >
        {([-1, 0, 1] as const).map((offset) => (
          <div key={pageKey(offset)} className="flex min-h-0 w-1/3 flex-col">
            {renderPage(offset)}
          </div>
        ))}
      </div>
    </div>
  );
}
