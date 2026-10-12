import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import { authorizeUrl, type Viewer } from "@/lib/anilist-browser";
import { isWatched, type CalendarEvent } from "@/lib/calendar";

export type View = "month" | "week";
export type OnSelect = (event: CalendarEvent, rect: DOMRect, firstEpisode?: number) => void;

export type LayoutProps = {
  events: CalendarEvent[];
  byDay: Map<string, CalendarEvent[]>;
  viewer: Viewer | null;
  clientId: string;
  busy: boolean;
  view: View;
  setView: (view: View) => void;
  cursor: Date;
  setCursor: Dispatch<SetStateAction<Date>>;
  title: string;
  step: (dir: number) => void;
  filters: ReactNode;
  syncButton: ReactNode;
  signOut: () => void;
};

export const STATUSES: Record<string, { label: string; block: string; box: string; dot: string; bar: string }> = {
  CURRENT: { label: "Watching", block: "bg-watching/20", box: "accent-watching", dot: "bg-watching", bar: "border-watching" },
  PLANNING: { label: "Planning", block: "bg-planning/20", box: "accent-planning", dot: "bg-planning", bar: "border-planning" },
  PAUSED: { label: "Paused", block: "bg-paused/20", box: "accent-paused", dot: "bg-paused", bar: "border-paused" },
};

export function replaceSearchParams(update: (params: URLSearchParams) => void) {
  const params = new URLSearchParams(window.location.search);
  update(params);
  const query = params.toString();
  history.replaceState(history.state, "", `${query ? `?${query}` : window.location.pathname}${window.location.hash}`);
}

export function fadeClass(e: CalendarEvent) {
  const aired = e.airingAt * 1000 < Date.now();
  return `${isWatched(e) ? "line-through" : ""} ${aired ? (e.listStatus ? "opacity-50" : "opacity-65") : ""}`;
}

export function IconButton({
  icon: Icon,
  title,
  onClick,
  disabled,
  className = "",
  children,
}: {
  icon: LucideIcon;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover disabled:opacity-60 ${className}`}
    >
      <Icon className="h-6 w-6" />
      {children}
    </button>
  );
}

export function SignInButton({ clientId }: { clientId: string }) {
  return (
    <a
      href={authorizeUrl(clientId)}
      className="ml-1 flex h-10 items-center justify-center rounded-[10px] bg-primary px-6 text-sm font-medium text-on-primary hover:shadow-md"
    >
      Sign in
    </a>
  );
}

export function ProgressBar({ busy }: { busy: boolean }) {
  return (
    <div className="relative h-0.5 shrink-0 overflow-hidden">
      {busy && <div className="animate-progress-slide absolute inset-y-0 w-2/5 bg-primary" />}
    </div>
  );
}

export function Attribution() {
  return (
    <p className="flex flex-col px-3 text-xs leading-5 text-subtle">
      <span>Not affiliated with AniList</span>
      <span>
        Data from{" "}
        <a href="https://anilist.co" target="_blank" rel="noreferrer" className="hover:text-muted hover:underline">
          AniList
        </a>
      </span>
    </p>
  );
}
