import { useEffect, useRef, useState, type TouchEvent } from "react";
import { CalendarDays, Settings, Tv, type LucideIcon } from "lucide-react";

export type Tab = "calendar" | "watchlist" | "settings";
export type ListTab = "toWatch" | "upNext";

export const TABS: Record<Tab, { label: string; icon: LucideIcon }> = {
  calendar: { label: "Calendar", icon: CalendarDays },
  watchlist: { label: "Watchlist", icon: Tv },
  settings: { label: "Settings", icon: Settings },
};

export const TAB_KEYS = Object.keys(TABS) as Tab[];

export const LIST_TABS: { value: ListTab; label: string }[] = [
  { value: "toWatch", label: "To watch" },
  { value: "upNext", label: "Up next" },
];

export const NAV_CLEARANCE = "pb-[calc(6rem+env(safe-area-inset-bottom))]";
export const SWIPE_HORIZONTAL_BIAS = 0.7;
export const SWIPE_NAVIGATE_DISTANCE = 60;
const SWIPE_LOCK_DISTANCE = 6;

export function useHorizontalDrag(onRelease: (dx: number) => void) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; axis: "x" | "y" | null } | null>(null);

  useEffect(() => {
    if (!element) return;
    const onTouchMove = (e: globalThis.TouchEvent) => {
      const current = start.current;
      if (!current) return;
      const dx = e.touches[0].clientX - current.x;
      const dy = e.touches[0].clientY - current.y;
      if (!current.axis && Math.hypot(dx, dy) > SWIPE_LOCK_DISTANCE) {
        current.axis = Math.abs(dx) > Math.abs(dy) * SWIPE_HORIZONTAL_BIAS ? "x" : "y";
      }
      if (current.axis === "x") {
        e.preventDefault();
        setDragging(true);
        setDragX(dx);
      }
    };
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => element.removeEventListener("touchmove", onTouchMove);
  }, [element]);

  return {
    attach: setElement,
    dragX,
    dragging,
    onTouchStart: (e: TouchEvent) => {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, axis: null };
    },
    onTouchEnd: () => {
      start.current = null;
      if (dragging && dragX !== 0) onRelease(dragX);
      setDragging(false);
      setDragX(0);
    },
  };
}
