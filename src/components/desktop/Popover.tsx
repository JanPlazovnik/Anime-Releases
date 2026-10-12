import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export default function Popover({
  anchor,
  width,
  onClose,
  children,
}: {
  anchor: DOMRect;
  width: number;
  onClose: () => void;
  children: (close: () => void) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const close = () => setClosing(true);

  const opensRight = anchor.right + 8 + width < window.innerWidth;
  const left = opensRight
    ? anchor.right + 8
    : Math.max(8, Math.min(anchor.left - 8 - width, window.innerWidth - width - 8));

  useLayoutEffect(() => {
    const el = ref.current!;
    const place = () => {
      el.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - el.offsetHeight - 8))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setClosing(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50" onClick={close}>
      <div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={() => closing && onClose()}
        className={`fixed flex max-h-[calc(100vh-16px)] flex-col overflow-hidden rounded-3xl bg-raised shadow-2xl ring-1 ring-black/5 ${
          opensRight ? "origin-top-left" : "origin-top-right"
        } ${closing ? "animate-popover-out" : "animate-popover-in"}`}
        style={{ left, top: anchor.top, width }}
      >
        {children(close)}
      </div>
    </div>
  );
}
