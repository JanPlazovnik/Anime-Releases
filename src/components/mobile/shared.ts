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
export const GLASS = "border border-line bg-raised/75 shadow-xl backdrop-blur-xl";
export const SWIPE_HORIZONTAL_BIAS = 0.7;
