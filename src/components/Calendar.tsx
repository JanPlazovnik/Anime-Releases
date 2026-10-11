"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "vaul";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  List,
  ListFilter,
  LogOut,
  Menu as MenuIcon,
  RefreshCw,
  Settings,
  X,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "./icons";
import Menu, { MenuItem } from "./Menu";
import {
  authorizeUrl,
  clearSession,
  InvalidTokenError,
  loadSession,
  readTokenFromHash,
  refreshEntries,
  signIn,
  type Session,
} from "@/lib/anilist-browser";
import { SITE_NAME } from "@/lib/site";

export type CalendarEvent = {
  id: number;
  episode: number;
  airingAt: number;
  mediaId: number;
  title: string;
  coverImage: string | null;
  bannerImage: string | null;
  format: string | null;
  season: string | null;
  seasonYear: number | null;
  averageScore: number | null;
  genres: string[];
  studio: string | null;
  siteUrl: string;
  episodes: number | null;
  listStatus: string | null;
  progress: number;
};

type Airing = Pick<CalendarEvent, "id" | "mediaId" | "episode" | "airingAt">;
type Show = Omit<CalendarEvent, keyof Airing | "listStatus" | "progress"> & { id: number };

type Theme = "system" | "light" | "dark";
type OnSelect = (event: CalendarEvent, rect: DOMRect, firstEpisode?: number) => void;

const STATUSES: Record<string, { label: string; block: string; box: string; dot: string; bar: string }> = {
  CURRENT: { label: "Watching", block: "bg-watching/20", box: "accent-watching", dot: "bg-watching", bar: "border-watching" },
  PLANNING: { label: "Planning", block: "bg-planning/20", box: "accent-planning", dot: "bg-planning", bar: "border-planning" },
  PAUSED: { label: "Paused", block: "bg-paused/20", box: "accent-paused", dot: "bg-paused", bar: "border-paused" },
};

type Tab = "calendar" | "watchlist" | "settings";
type ListTab = "toWatch" | "upNext";

const TABS: Record<Tab, { label: string; icon: LucideIcon }> = {
  calendar: { label: "Calendar", icon: CalendarDays },
  watchlist: { label: "Watchlist", icon: Tv },
  settings: { label: "Settings", icon: Settings },
};

const LIST_TABS: { value: ListTab; label: string }[] = [
  { value: "toWatch", label: "To watch" },
  { value: "upNext", label: "Up next" },
];

const TAB_KEYS = Object.keys(TABS) as Tab[];

const MOBILE_VIEWS = [
  { value: "month", label: "Month", icon: CalendarDays },
  { value: "week", label: "List", icon: List },
] as const;

const THEMES: Record<Theme, string> = { system: "Use device default", light: "Light", dark: "Dark" };

const HOUR_HEIGHT = 48;
const EPISODE_SECONDS = 30 * 60;
const MONTH_CHIP_HEIGHT = 22;
const POPOVER_WIDTH = 448;
const LIST_POPOVER_WIDTH = 320;
const MAX_LANES = 3;
const LIST_TTL_MS = 15 * 60 * 1000;
const SYNC_COOLDOWN_MS = 60 * 1000;
const SIDEBAR_LIMIT = 8;
const UP_NEXT_PAGE_LIMIT = 30;
const NAV_CLEARANCE = "pb-[calc(6rem+env(safe-area-inset-bottom))]";
const MOBILE_ROW_HEIGHT = 48;
const SWIPE_THRESHOLD = 24;
const SWIPE_LOCK_DISTANCE = 6;
const SWIPE_HORIZONTAL_BIAS = 0.7;
const SWIPE_NAVIGATE_DISTANCE = 60;
const EDGE_RESISTANCE = 0.3;
const DESCRIPTION_COLLAPSED_HEIGHT = 80;
const SHEET_MAX_FIRST_SNAP = 0.85;
const SHEET_HEIGHT = 0.96;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function startOfWeek(d: Date) {
  return addDays(startOfDay(d), -((d.getDay() + 6) % 7));
}

function formatDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const match = params.get("date")?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return {
    view: params.get("view") === "week" ? ("week" as const) : ("month" as const),
    tab: TAB_KEYS.find((t) => t === params.get("tab")) ?? "calendar",
    listTab: params.get("list") === "upNext" ? ("upNext" as const) : ("toWatch" as const),
    cursor: date && !Number.isNaN(date.getTime()) ? date : startOfDay(new Date()),
  };
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isWatched(e: CalendarEvent) {
  return e.listStatus !== null && e.episode <= e.progress;
}

function fadeClass(e: CalendarEvent) {
  const aired = e.airingAt * 1000 < Date.now();
  return `${isWatched(e) ? "line-through" : ""} ${aired ? (e.listStatus ? "opacity-50" : "opacity-65") : ""}`;
}

function eventLabel(e: CalendarEvent) {
  return `${e.title} · Ep ${e.episode}${e.episodes ? `/${e.episodes}` : ""}`;
}

function episodeRange(first: number, last: number) {
  return first === last ? String(last) : `${first}-${last}`;
}

const descriptions = new Map<number, Promise<string | null>>();

function loadDescription(mediaId: number) {
  let description = descriptions.get(mediaId);
  if (!description) {
    description = fetch(`/api/media/${mediaId}`)
      .then((res) => res.json())
      .then(
        (data) =>
          data.description
            ?.replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .trim() ?? null,
      )
      .catch(() => {
        descriptions.delete(mediaId);
        return null;
      });
    descriptions.set(mediaId, description);
  }
  return description;
}

function applyTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem("theme");
  else localStorage.setItem("theme", theme);
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function groupEpisodes(events: CalendarEvent[]) {
  const groups = new Map<string, { event: CalendarEvent; firstEpisode: number; airingAt: number }>();
  for (const event of events) {
    const key = `${event.mediaId}-${event.airingAt}`;
    const group = groups.get(key);
    if (!group) groups.set(key, { event, firstEpisode: event.episode, airingAt: event.airingAt });
    else if (event.episode > group.event.episode) group.event = event;
  }
  return [...groups.values()];
}

type EpisodeGroup = ReturnType<typeof groupEpisodes>[number];

function overlaps(a: EpisodeGroup, b: EpisodeGroup) {
  return a.airingAt < b.airingAt + EPISODE_SECONDS && b.airingAt < a.airingAt + EPISODE_SECONDS;
}

function layoutDay(groups: EpisodeGroup[]) {
  const clusters: EpisodeGroup[][] = [];
  let clusterEnd = 0;
  for (const group of groups) {
    if (clusters.length === 0 || group.airingAt >= clusterEnd) clusters.push([]);
    clusters[clusters.length - 1].push(group);
    clusterEnd = Math.max(clusterEnd, group.airingAt + EPISODE_SECONDS);
  }

  const placed: { group: EpisodeGroup; lane: number; span: number; columns: number }[] = [];
  const overflow: { airingAt: number; groups: EpisodeGroup[]; lane: number; columns: number }[] = [];

  for (const cluster of clusters) {
    const mineFirst = [...cluster].sort(
      (a, b) => Number(!a.event.listStatus) - Number(!b.event.listStatus) || a.airingAt - b.airingAt,
    );
    const lanes: EpisodeGroup[][] = [];
    const extra: EpisodeGroup[] = [];
    for (const group of mineFirst) {
      const lane = lanes.findIndex((laneGroups) => laneGroups.every((other) => !overlaps(other, group)));
      if (lane !== -1) lanes[lane].push(group);
      else if (lanes.length < MAX_LANES) lanes.push([group]);
      else extra.push(group);
    }

    const columns = lanes.length + (extra.length > 0 ? 1 : 0);
    lanes.forEach((laneGroups, lane) => {
      for (const group of laneGroups) {
        let span = 1;
        while (lane + span < lanes.length && lanes[lane + span].every((other) => !overlaps(other, group))) span++;
        placed.push({ group, lane, span, columns });
      }
    });

    const slots = new Map<number, EpisodeGroup[]>();
    for (const group of extra) {
      const slot = group.airingAt - (group.airingAt % EPISODE_SECONDS);
      slots.set(slot, [...(slots.get(slot) ?? []), group]);
    }
    for (const [airingAt, slotGroups] of slots) {
      overflow.push({ airingAt, groups: slotGroups, lane: lanes.length, columns });
    }
  }

  return { placed, overflow };
}

const subscribeNothing = () => () => {};

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsMobile() {
  return useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
}

function IconButton({
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

export default function Calendar({
  airings,
  shows,
  clientId,
  initialShowAll,
  lastSync,
  syncError,
  serverSyncing,
}: {
  airings: Airing[];
  shows: Show[];
  clientId: string;
  initialShowAll: boolean;
  lastSync: number;
  syncError: string;
  serverSyncing: boolean;
}) {
  const router = useRouter();
  const isClient = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [view, setView] = useState<"month" | "week">(() =>
    typeof window === "undefined" ? "month" : readUrlState().view,
  );
  const [cursor, setCursor] = useState(() =>
    typeof window === "undefined" ? startOfDay(new Date()) : readUrlState().cursor,
  );
  const [enabled, setEnabled] = useState(() => new Set(Object.keys(STATUSES)));
  const [showAll, setShowAll] = useState(initialShowAll);
  const [moreList, setMoreList] = useState<{ groups: EpisodeGroup[]; rect: DOMRect } | null>(null);
  const [session, setSession] = useState<Session | null>(() =>
    typeof window === "undefined" ? null : loadSession(),
  );
  const [syncing, setSyncing] = useState(
    () => typeof window !== "undefined" && window.location.hash.includes("access_token"),
  );
  const [selected, setSelected] = useState<{ id: number; rect: DOMRect; firstEpisode?: number } | null>(null);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<Tab>(() => (typeof window === "undefined" ? "calendar" : readUrlState().tab));
  const [listTab, setListTab] = useState<ListTab>(() =>
    typeof window === "undefined" ? "toWatch" : readUrlState().listTab,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const listIndex = LIST_TABS.findIndex(({ value }) => value === listTab);
  const listDrag = useHorizontalDrag((dx) => {
    const next = listIndex + (dx < 0 ? 1 : -1);
    if (Math.abs(dx) > SWIPE_NAVIGATE_DISTANCE && next >= 0 && next < LIST_TABS.length) {
      setListTab(LIST_TABS[next].value);
    }
  });
  const atListEdge =
    (listIndex === 0 && listDrag.dragX > 0) || (listIndex === LIST_TABS.length - 1 && listDrag.dragX < 0);
  const listDragOffset = atListEdge ? listDrag.dragX * EDGE_RESISTANCE : listDrag.dragX;
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === "undefined" ? "system" : ((localStorage.getItem("theme") as Theme | null) ?? "system"),
  );
  const busy = syncing || serverSyncing;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (view === "week") params.set("view", view);
    else params.delete("view");
    if (tab !== "calendar") params.set("tab", tab);
    else params.delete("tab");
    if (listTab === "upNext") params.set("list", listTab);
    else params.delete("list");
    if (dayKey(cursor) === dayKey(new Date())) params.delete("date");
    else params.set("date", formatDateParam(cursor));
    const query = params.toString();
    history.replaceState(history.state, "", `${query ? `?${query}` : window.location.pathname}${window.location.hash}`);
  }, [view, cursor, tab, listTab]);

  useEffect(() => {
    const source = new EventSource("/api/events");
    source.onmessage = () => router.refresh();
    return () => source.close();
  }, [router]);

  useEffect(() => {
    const fromHash = readTokenFromHash();
    if (!fromHash) return;
    signIn(fromHash.token, fromHash.expiresAt)
      .then(setSession)
      .catch((err) => {
        console.error("Sign in failed:", err);
        alert("Signing in with AniList failed, please try again.");
      })
      .finally(() => setSyncing(false));
  }, []);

  const [, setCooldownEnded] = useState(0);
  const fetchedAt = session?.fetchedAt;
  useEffect(() => {
    if (!fetchedAt) return;
    const remaining = fetchedAt + SYNC_COOLDOWN_MS - Date.now();
    if (remaining <= 0) return;
    const timeout = setTimeout(() => setCooldownEnded(Date.now()), remaining);
    return () => clearTimeout(timeout);
  }, [fetchedAt]);

  const token = session?.token;
  useEffect(() => {
    if (!token) return;
    const refreshIfStale = () => {
      const current = loadSession();
      if (current && Date.now() - current.fetchedAt > LIST_TTL_MS) refreshList(current);
    };
    refreshIfStale();
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => document.removeEventListener("visibilitychange", refreshIfStale);
  }, [token]);

  function refreshList(current: Session) {
    setSyncing(true);
    refreshEntries(current)
      .then(setSession)
      .catch((err) => {
        if (err instanceof InvalidTokenError) {
          clearSession();
          setSession(null);
        } else {
          console.error("List sync failed:", err);
        }
      })
      .finally(() => setSyncing(false));
  }

  if (!isClient) return null;

  const viewer = session?.viewer ?? null;
  const entries = session?.entries ?? [];
  const showsById = new Map(shows.map((show) => [show.id, show]));
  const entriesByMedia = new Map(entries.map((entry) => [entry.mediaId, entry]));
  const events: CalendarEvent[] = airings.map((a) => {
    const entry = entriesByMedia.get(a.mediaId);
    return { ...showsById.get(a.mediaId)!, ...a, listStatus: entry?.listStatus ?? null, progress: entry?.progress ?? 0 };
  });

  const selectedEvent = selected && events.find((e) => e.id === selected.id);
  const onSelect: OnSelect = (event, rect, firstEpisode) => {
    setMoreList(null);
    setSelected({ id: event.id, rect, firstEpisode });
  };

  const visible = events.filter((e) => (e.listStatus ? enabled.has(e.listStatus) : showAll || !viewer));
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of visible) {
    const key = dayKey(new Date(e.airingAt * 1000));
    byDay.set(key, [...(byDay.get(key) ?? []), e]);
  }

  const step = (dir: number) => {
    setCursor(
      view === "month"
        ? new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1)
        : addDays(cursor, dir * 7),
    );
  };

  const onCooldown = session !== null && Date.now() - session.fetchedAt < SYNC_COOLDOWN_MS;

  const signOut = () => {
    clearSession();
    setSession(null);
  };

  const toggleShowAll = () => {
    document.cookie = `show=${showAll ? "mine" : "all"}; path=/; max-age=31536000; samesite=lax`;
    setShowAll(!showAll);
  };

  const toggle = (status: string) => {
    const next = new Set(enabled);
    if (next.has(status)) next.delete(status);
    else next.add(status);
    setEnabled(next);
  };

  const changeTheme = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  const showDay = (day: Date) => {
    setCursor(day);
    setView("week");
  };

  const weekStart = startOfWeek(cursor);
  const weekEnd = addDays(weekStart, 6);
  const title =
    view === "month" || weekStart.getMonth() === weekEnd.getMonth()
      ? cursor.toLocaleDateString([], { month: "long", year: "numeric" })
      : `${weekStart.toLocaleDateString([], { month: "short" })} – ${weekEnd.toLocaleDateString([], { month: "short", year: "numeric" })}`;
  const scheduleStatus = syncError
    ? `Schedule sync failed: ${syncError}`
    : lastSync
      ? `Schedule synced ${new Date(lastSync).toLocaleString()}`
      : "Schedule not synced yet";
  const listStatus = session && `List synced ${new Date(session.fetchedAt).toLocaleString()}`;
  const syncTitle = listStatus ? `${listStatus} · ${scheduleStatus}` : scheduleStatus;

  const syncButton = viewer && (
    <IconButton
      icon={RefreshCw}
      title={busy ? "Syncing…" : syncTitle}
      onClick={() => session && refreshList(session)}
      disabled={busy || onCooldown}
      className={busy ? "[&>svg]:animate-spin" : ""}
    >
      {syncError && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />}
    </IconButton>
  );
  const themeOptions = (onPick: () => void) =>
    (Object.keys(THEMES) as Theme[]).map((t) => (
      <MenuItem
        key={t}
        onClick={() => {
          changeTheme(t);
          onPick();
        }}
      >
        <Check className={`h-5 w-5 shrink-0 ${theme === t ? "" : "invisible"}`} />
        {THEMES[t]}
      </MenuItem>
    ));
  const viewToggle = (
    <div className="mx-2 flex h-10 rounded-[10px] border border-subtle p-0.5 text-sm font-medium">
      {(["month", "week"] as const).map((v) => (
        <button
          key={v}
          onClick={() => setView(v)}
          className={`rounded-lg px-4 ${view === v ? "bg-primary text-on-primary" : "hover:bg-hover"}`}
        >
          {v === "month" ? "Month" : "Week"}
        </button>
      ))}
    </div>
  );
  const showFilters = (
    <>
      {Object.entries(STATUSES).map(([status, s]) => (
        <label key={status} className="flex h-8 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm hover:bg-hover">
          <input
            type="checkbox"
            checked={enabled.has(status)}
            onChange={() => toggle(status)}
            className={`h-[18px] w-[18px] ${s.box}`}
          />
          {s.label}
        </label>
      ))}
      <label className="flex h-8 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm hover:bg-hover">
        <input type="checkbox" checked={showAll} onChange={toggleShowAll} className="h-[18px] w-[18px] accent-other" />
        Everything else
      </label>
    </>
  );
  const attribution = (
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
  const signInButton = (
    <a
      href={authorizeUrl(clientId)}
      className="ml-1 flex h-10 items-center justify-center rounded-[10px] bg-primary px-6 text-sm font-medium text-on-primary hover:shadow-md"
    >
      Sign in
    </a>
  );
  const progressBar = (
    <div className="relative h-0.5 shrink-0 overflow-hidden">
      {busy && <div className="animate-progress-slide absolute inset-y-0 w-2/5 bg-primary" />}
    </div>
  );

  const listIndicatorPercent = Math.min(
    100 * (LIST_TABS.length - 1),
    Math.max(0, listIndex * 100 - (listDragOffset / window.innerWidth) * 100),
  );
  const tabPanelClass = (t: Tab) => `absolute inset-0 flex flex-col ${tab === t ? "" : "invisible"}`;

  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex h-14 shrink-0 select-none items-center gap-1 px-2">
          {tab === "calendar" ? (
            <>
              <IconButton icon={ChevronLeft} title={view === "month" ? "Previous month" : "Previous week"} onClick={() => step(-1)} />
              <IconButton icon={ChevronRight} title={view === "month" ? "Next month" : "Next week"} onClick={() => step(1)} />
              <h1 className="ml-1 min-w-0 truncate text-lg">{title}</h1>
              <div className="ml-auto flex shrink-0 items-center">
                <IconButton icon={ListFilter} title="Show" onClick={() => setFiltersOpen(true)} />
                <button
                  onClick={() => setCursor(startOfDay(new Date()))}
                  title="Today"
                  aria-label="Today"
                  className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-hover"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-muted text-xs font-semibold text-muted">
                    {new Date().getDate()}
                  </span>
                </button>
              </div>
            </>
          ) : tab === "watchlist" ? (
            <div className="relative mx-auto flex h-10 w-full max-w-xs rounded-full bg-chip p-1 text-sm font-medium">
              <span
                className={`absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-raised shadow-sm ${
                  listDrag.dragging ? "" : "transition-transform duration-300 ease-out"
                }`}
                style={{ transform: `translateX(${listIndicatorPercent}%)` }}
              />
              {LIST_TABS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setListTab(value)}
                  className={`relative flex-1 rounded-full transition-colors ${listTab === value ? "text-ink" : "text-muted"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <h1 className="px-2 text-lg">{TABS[tab].label}</h1>
          )}
        </header>
        {progressBar}

        <main className="relative min-h-0 flex-1">
          <div className={tabPanelClass("calendar")} inert={tab !== "calendar"}>
            <div className="mx-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-surface">
              {view === "month" ? (
                <MobileMonthView cursor={cursor} byDay={byDay} onPickDay={setCursor} onSelect={onSelect} />
              ) : (
                <SwipePager
                  onChange={(direction) => setCursor((current) => addDays(current, direction * 7))}
                  pageKey={(offset) => dayKey(addDays(weekStart, offset * 7))}
                  renderPage={(offset) => (
                    <AgendaView weekStart={addDays(weekStart, offset * 7)} byDay={byDay} onSelect={onSelect} />
                  )}
                />
              )}
            </div>
          </div>
          <div className={tabPanelClass("watchlist")} inert={tab !== "watchlist"}>
            <div
              ref={listDrag.attach}
              onTouchStart={listDrag.onTouchStart}
              onTouchEnd={listDrag.onTouchEnd}
              className="flex min-h-0 flex-1 touch-pan-y overflow-hidden"
            >
              <div
                className={`flex min-h-0 w-[200%] shrink-0 ${listDrag.dragging ? "" : "transition-transform duration-300 ease-out"}`}
                style={{ transform: `translateX(calc(${-listIndex * 50}% + ${listDragOffset}px))` }}
              >
                {LIST_TABS.map(({ value }) => (
                  <div
                    key={value}
                    inert={listTab !== value}
                    className={`w-1/2 overflow-y-auto px-3 pt-1 ${NAV_CLEARANCE}`}
                  >
                    {value === "toWatch" && !viewer ? (
                      <div className="flex justify-center pt-8">{signInButton}</div>
                    ) : (
                      <EpisodeLists events={events} signedIn={viewer !== null} onSelect={onSelect} page={value} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className={tabPanelClass("settings")} inert={tab !== "settings"}>
            <div className={`flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2 ${NAV_CLEARANCE}`}>
              {viewer ? (
                <section className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
                  <div className="flex items-center gap-3 p-4">
                    <img src={viewer.avatar} alt="" className="h-14 w-14 shrink-0 rounded-xl" />
                    <p className="truncate text-base font-medium">{viewer.name}</p>
                  </div>
                  <a
                    href={`https://anilist.co/user/${viewer.name}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 border-t border-line px-4 py-3 text-sm hover:bg-hover"
                  >
                    <ExternalLink className="h-5 w-5 shrink-0 text-muted" />
                    View AniList profile
                    <ChevronRight className="ml-auto h-4 w-4 text-subtle" />
                  </a>
                  <button
                    onClick={signOut}
                    className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-sm text-red-500 hover:bg-hover"
                  >
                    <LogOut className="h-5 w-5 shrink-0" />
                    Sign out
                  </button>
                </section>
              ) : (
                <section className="flex justify-center rounded-2xl bg-surface p-4 ring-1 ring-line">{signInButton}</section>
              )}
              <section>
                <p className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted">Theme</p>
                <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
                  {(Object.keys(THEMES) as Theme[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => changeTheme(t)}
                      className="flex w-full items-center border-t border-line px-4 py-3 text-left text-sm first:border-t-0 hover:bg-hover"
                    >
                      {THEMES[t]}
                      {theme === t && <Check className="ml-auto h-5 w-5 text-primary" />}
                    </button>
                  ))}
                </div>
              </section>
              {viewer && (
                <section className="flex items-center gap-2 rounded-2xl bg-surface p-2 pr-4 ring-1 ring-line">
                  {syncButton}
                  <div className="min-w-0 text-xs leading-5 text-muted">
                    <p className="truncate">{listStatus}</p>
                    <p className="truncate">{scheduleStatus}</p>
                  </div>
                </section>
              )}
              <div className="flex justify-center pt-2 text-center [&>p]:items-center">{attribution}</div>
            </div>
          </div>
        </main>

        <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex select-none justify-center px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto relative flex w-full max-w-sm rounded-full border border-line bg-raised/75 p-1 shadow-xl backdrop-blur-xl">
            <span
              className="absolute bottom-1 left-1 top-1 rounded-full bg-primary/15 transition-transform duration-300 ease-out"
              style={{
                width: `calc((100% - 0.5rem) / ${TAB_KEYS.length})`,
                transform: `translateX(${TAB_KEYS.indexOf(tab) * 100}%)`,
              }}
            />
            {TAB_KEYS.map((t) => {
              const { label, icon: TabIcon } = TABS[t];
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  title={label}
                  aria-label={label}
                  className={`relative flex flex-1 items-center justify-center rounded-full py-3 transition-colors ${
                    tab === t ? "text-primary" : "text-muted"
                  }`}
                >
                  <TabIcon className="h-6 w-6" />
                </button>
              );
            })}
          </div>
        </nav>

        <Drawer.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
            <Drawer.Content
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-0 z-50 select-none rounded-t-3xl bg-raised px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 outline-none"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-chip" />
              <div className="flex gap-2 px-3 pb-4">
                {MOBILE_VIEWS.map(({ value, label, icon: ViewIcon }) => (
                  <button
                    key={value}
                    onClick={() => setView(value)}
                    title={label}
                    aria-label={label}
                    aria-pressed={view === value}
                    className={`flex h-11 flex-1 items-center justify-center rounded-[10px] border ${
                      view === value ? "border-primary bg-primary/15 text-primary" : "border-subtle text-muted hover:bg-hover"
                    }`}
                  >
                    <ViewIcon className="h-5 w-5" />
                  </button>
                ))}
              </div>
              <Drawer.Title className={viewer ? "px-3 pb-2 text-base font-medium" : "sr-only"}>Show</Drawer.Title>
              {viewer && showFilters}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>

        {selected && selectedEvent && (
          <EventPopover
            key={selected.id}
            event={selectedEvent}
            anchor={selected.rect}
            firstEpisode={selected.firstEpisode ?? selectedEvent.episode}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 select-none items-center gap-1 px-2">
        <div className="flex w-[246px] shrink-0 items-center gap-1">
          <IconButton icon={MenuIcon} title="Main menu" onClick={() => setSidebarOpen(!sidebarOpen)} />
          <Logo className="ml-1 h-9 w-9 shrink-0" />
          <span className="ml-1.5 whitespace-nowrap text-lg text-muted">{SITE_NAME}</span>
        </div>
        <button
          onClick={() => setCursor(startOfDay(new Date()))}
          className="ml-2 mr-2 h-10 rounded-[10px] border border-subtle px-6 text-sm font-medium hover:bg-hover"
        >
          Today
        </button>
        <IconButton icon={ChevronLeft} title={view === "month" ? "Previous month" : "Previous week"} onClick={() => step(-1)} />
        <IconButton icon={ChevronRight} title={view === "month" ? "Next month" : "Next week"} onClick={() => step(1)} />
        <h1 className="ml-3 truncate text-[22px]">{title}</h1>

        <div className="ml-auto flex items-center gap-1">
          {syncButton}
          <Menu
            label="Settings"
            button={<Settings className="h-6 w-6" />}
            buttonClassName="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-hover"
          >
            {(close) => (
              <>
                <p className="px-4 pb-1 pt-1 text-xs font-medium text-muted">Theme</p>
                {themeOptions(close)}
              </>
            )}
          </Menu>
          {viewToggle}
          {viewer ? (
            <Menu
              label={viewer.name}
              button={<img src={viewer.avatar} alt="" className="h-8 w-8 rounded-full" />}
              buttonClassName="flex h-12 w-12 items-center justify-center rounded-full hover:bg-hover"
            >
              {() => (
                <div className="w-64">
                  <div className="flex items-center gap-3 px-4 pb-3 pt-1">
                    <img src={viewer.avatar} alt="" className="h-10 w-10 shrink-0 rounded-[10px]" />
                    <p className="truncate text-sm font-medium">{viewer.name}</p>
                  </div>
                  <div className="border-t border-line pt-2">
                    <a
                      href={`https://anilist.co/user/${viewer.name}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-hover"
                    >
                      <ExternalLink className="h-5 w-5 shrink-0 text-muted" />
                      View AniList profile
                    </a>
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-hover"
                    >
                      <LogOut className="h-5 w-5 shrink-0 text-muted" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </Menu>
          ) : (
            signInButton
          )}
        </div>
      </header>
      {progressBar}

      <div className="flex min-h-0 flex-1">
        <aside
          className={`shrink-0 select-none overflow-hidden transition-[width] duration-200 ${sidebarOpen ? "w-64" : "w-0"}`}
        >
          <div className="flex h-full w-64 flex-col gap-4 overflow-y-auto px-3 pb-4 pt-2">
            {viewer && <SidebarSection title="Show">{showFilters}</SidebarSection>}
            <EpisodeLists events={events} signedIn={viewer !== null} onSelect={onSelect} />
            <div className="mt-auto pt-4">{attribution}</div>
          </div>
        </aside>

        <main
          className={`mb-4 mr-4 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface ${
            sidebarOpen ? "ml-0" : "ml-4"
          }`}
        >
          {view === "month" ? (
            <MonthView cursor={cursor} byDay={byDay} onSelect={onSelect} onShowDay={showDay} />
          ) : (
            <WeekView
              weekStart={weekStart}
              byDay={byDay}
              onSelect={onSelect}
              onShowMore={(groups, rect) => setMoreList({ groups, rect })}
            />
          )}
        </main>
      </div>

      {moreList && (
        <Popover label={`${moreList.groups.length} more`} anchor={moreList.rect} width={LIST_POPOVER_WIDTH} onClose={() => setMoreList(null)}>
          {() => (
            <div className="overflow-y-auto py-2">
              {moreList.groups.map(({ event, firstEpisode }) => (
                <button
                  key={event.id}
                  onClick={(e) => onSelect(event, e.currentTarget.getBoundingClientRect(), firstEpisode)}
                  className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-hover ${fadeClass(event)}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUSES[event.listStatus ?? ""]?.dot ?? "bg-other"}`} />
                  <span className="shrink-0 text-muted">{formatTime(event.airingAt)}</span>
                  <span className="truncate">
                    {event.title}, Ep {episodeRange(firstEpisode, event.episode)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Popover>
      )}

      {selected && selectedEvent && (
        <EventPopover
          key={selected.id}
          event={selectedEvent}
          anchor={selected.rect}
          firstEpisode={selected.firstEpisode ?? selectedEvent.episode}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SidebarSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-base font-medium hover:bg-hover"
      >
        {title}
        <span className="flex items-center gap-2">
          {count ? <span className="text-xs text-muted">{count}</span> : null}
          <ChevronUp className={`h-5 w-5 shrink-0 transition-transform duration-200 ${open ? "" : "rotate-180"}`} />
        </span>
      </button>
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function EpisodeCard({
  event,
  firstEpisode,
  when,
  cardDetail,
  onSelect,
}: {
  event: CalendarEvent;
  firstEpisode: number;
  when: string;
  cardDetail: string;
  onSelect: OnSelect;
}) {
  const status = STATUSES[event.listStatus ?? ""];
  return (
    <button
      onClick={(e) => onSelect(event, e.currentTarget.getBoundingClientRect(), firstEpisode)}
      className="flex items-center gap-3 rounded-xl bg-surface p-2 pr-3 text-left ring-1 ring-line"
    >
      {event.coverImage ? (
        <img
          src={event.coverImage}
          alt=""
          loading="lazy"
          draggable={false}
          className="aspect-[2/3] w-12 shrink-0 rounded-md bg-chip object-cover"
        />
      ) : (
        <span className={`aspect-[2/3] w-12 shrink-0 rounded-md ${status?.dot ?? "bg-other"}`} />
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-medium leading-snug">{event.title}</p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
          <span className={`h-2 w-2 shrink-0 rounded-full ${status?.dot ?? "bg-other"}`} />
          <span className="truncate">{cardDetail}</span>
        </p>
      </div>
      <span className="shrink-0 self-start pt-0.5 text-xs text-muted">{when}</span>
    </button>
  );
}

function EpisodeLists({
  events,
  signedIn,
  onSelect,
  page,
}: {
  events: CalendarEvent[];
  signedIn: boolean;
  onSelect: OnSelect;
  page?: ListTab;
}) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() / 1000), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const latestAired = new Map<number, CalendarEvent>();
  for (const e of events) {
    if (e.airingAt > now || !e.listStatus || e.listStatus === "PAUSED" || e.episode <= e.progress) continue;
    const latest = latestAired.get(e.mediaId);
    if (!latest || e.episode > latest.episode) latestAired.set(e.mediaId, e);
  }
  const toWatch = [...latestAired.values()]
    .sort((a, b) => b.airingAt - a.airingAt)
    .map((event) => {
      const episodes = `Ep ${episodeRange(event.progress + 1, event.episode)}`;
      const when = `${formatDuration(now - event.airingAt)} ago`;
      return {
        event,
        firstEpisode: event.progress + 1,
        when,
        detail: `${episodes} · ${when}`,
        cardDetail: `${episodes}${event.episodes ? ` of ${event.episodes}` : ""}`,
      };
    });
  const upNext = groupEpisodes(events.filter((e) => e.airingAt > now && (!signedIn || e.listStatus)))
    .slice(0, page ? UP_NEXT_PAGE_LIMIT : SIDEBAR_LIMIT)
    .map(({ event, firstEpisode }) => {
      const episodes = `Ep ${episodeRange(firstEpisode, event.episode)}`;
      const when = `in ${formatDuration(event.airingAt - now)}`;
      const airs = new Date(event.airingAt * 1000).toLocaleDateString([], { weekday: "short" });
      return {
        event,
        firstEpisode,
        when,
        detail: `${episodes} · ${when}`,
        cardDetail: `${episodes} · ${airs} ${formatTime(event.airingAt)}`,
      };
    });

  const sections = [
    ...(signedIn ? [{ key: "toWatch", title: "To watch", items: toWatch, empty: "All caught up", expandable: true }] : []),
    { key: "upNext", title: "Up next", items: upNext, empty: "Nothing scheduled", expandable: false },
  ];

  const renderItems = (section: (typeof sections)[number], limit: number | null) => (
    <>
      {section.items.length === 0 && <p className="px-3 text-sm text-subtle">{section.empty}</p>}
      {(limit === null ? section.items : section.items.slice(0, limit)).map(
        ({ event, firstEpisode, detail }) => (
          <button
            key={event.id}
            onClick={(e) => onSelect(event, e.currentTarget.getBoundingClientRect(), firstEpisode)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left hover:bg-hover"
          >
            {event.coverImage ? (
              <img src={event.coverImage} alt="" loading="lazy" className="h-10 w-7 shrink-0 rounded object-cover" />
            ) : (
              <span className={`h-10 w-7 shrink-0 rounded ${STATUSES[event.listStatus ?? ""]?.dot ?? "bg-other"}`} />
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm">{event.title}</span>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUSES[event.listStatus ?? ""]?.dot ?? "bg-other"}`} />
                <span className="truncate">{detail}</span>
              </span>
            </span>
          </button>
        ),
      )}
    </>
  );

  if (page) {
    const section = sections.find((s) => s.key === page);
    if (!section) return null;
    return (
      <div className="flex flex-col gap-2">
        {section.items.length === 0 && <p className="px-1 pt-4 text-sm text-subtle">{section.empty}</p>}
        {section.items.map((item) => (
          <EpisodeCard key={item.event.id} {...item} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return sections.map((section) => (
    <SidebarSection key={section.key} title={section.title} count={section.items.length}>
      {renderItems(section, section.expandable && !expanded ? SIDEBAR_LIMIT : null)}
      {section.expandable && section.items.length > SIDEBAR_LIMIT && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-1.5 text-sm font-medium text-primary hover:underline"
        >
          {expanded ? "Show less" : `Show ${section.items.length - SIDEBAR_LIMIT} more`}
        </button>
      )}
    </SidebarSection>
  ));
}

function MonthEvent({ event, onSelect }: { event: CalendarEvent; onSelect: OnSelect }) {
  const status = STATUSES[event.listStatus ?? ""];
  return (
    <button
      onClick={(e) => onSelect(event, e.currentTarget.getBoundingClientRect())}
      title={`${formatTime(event.airingAt)} ${eventLabel(event)}`}
      className={`flex h-5 w-full shrink-0 items-center gap-1.5 rounded px-1.5 text-left text-xs ${
        status ? `${status.block} hover:brightness-125` : "text-muted hover:bg-hover"
      } ${fadeClass(event)}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${status?.dot ?? "bg-other"}`} />
      <span className="shrink-0">{formatTime(event.airingAt)}</span>
      <span className={`truncate ${status ? "font-medium" : ""}`}>{eventLabel(event)}</span>
    </button>
  );
}

function MonthView({
  cursor,
  byDay,
  onSelect,
  onShowDay,
}: {
  cursor: Date;
  byDay: Map<string, CalendarEvent[]>;
  onSelect: OnSelect;
  onShowDay: (day: Date) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(0);
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil(((first.getDay() + 6) % 7 + daysInMonth) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const today = dayKey(new Date());

  useEffect(() => {
    const el = gridRef.current!;
    const observer = new ResizeObserver(() => setRowHeight(el.clientHeight / weeks));
    observer.observe(el);
    return () => observer.disconnect();
  }, [weeks]);

  return (
    <div
      ref={gridRef}
      className="grid flex-1 select-none grid-cols-7"
      style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
    >
      {days.map((day, i) => {
        const dayEvents = [...(byDay.get(dayKey(day)) ?? [])].sort(
          (a, b) => Number(!a.listStatus) - Number(!b.listStatus) || a.airingAt - b.airingAt,
        );
        const isToday = dayKey(day) === today;
        const headerHeight = i < 7 ? 52 : 34;
        const fit = Math.floor((rowHeight - headerHeight) / MONTH_CHIP_HEIGHT);
        const shown = dayEvents.length > fit ? Math.max(0, fit - 1) : dayEvents.length;
        return (
          <div
            key={dayKey(day)}
            className={`flex min-h-0 flex-col gap-0.5 overflow-hidden border-line px-1 pt-1.5 ${
              i % 7 < 6 ? "border-r" : ""
            } ${i < (weeks - 1) * 7 ? "border-b" : ""}`}
          >
            {i < 7 && (
              <span className="text-center text-[11px] font-medium uppercase text-muted">{WEEKDAYS[i]}</span>
            )}
            <button
              onClick={() => onShowDay(day)}
              className={`mx-auto mb-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1.5 text-xs font-medium ${
                isToday
                  ? "bg-primary text-on-primary"
                  : day.getMonth() === cursor.getMonth()
                    ? "hover:bg-hover"
                    : "text-subtle hover:bg-hover"
              }`}
            >
              {day.getDate() === 1 ? day.toLocaleDateString([], { month: "short", day: "numeric" }) : day.getDate()}
            </button>
            {dayEvents.slice(0, shown).map((e) => (
              <MonthEvent key={e.id} event={e} onSelect={onSelect} />
            ))}
            {dayEvents.length > shown && (
              <button
                onClick={() => onShowDay(day)}
                className="h-5 shrink-0 rounded px-1.5 text-left text-xs font-medium hover:bg-hover"
              >
                {dayEvents.length - shown} more
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function useHorizontalDrag(onRelease: (dx: number) => void) {
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

function SwipePager({
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

function AgendaRow({ group: { event, firstEpisode }, onSelect }: { group: EpisodeGroup; onSelect: OnSelect }) {
  const status = STATUSES[event.listStatus ?? ""];
  return (
    <button
      onClick={(e) => onSelect(event, e.currentTarget.getBoundingClientRect(), firstEpisode)}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-1 text-left hover:bg-hover ${fadeClass(event)}`}
    >
      <span className="w-11 shrink-0 text-xs text-muted">{formatTime(event.airingAt)}</span>
      <span
        className={`flex min-w-0 flex-1 flex-col rounded-md border-l-[3px] px-2 py-1 ${
          status ? `${status.block} ${status.bar}` : "border-other bg-other/20"
        }`}
      >
        <span className="truncate text-sm font-medium">{event.title}</span>
        <span className="text-xs text-muted">Ep {episodeRange(firstEpisode, event.episode)}</span>
      </span>
    </button>
  );
}

function NowLine() {
  return (
    <div className="pointer-events-none relative mx-2 my-1 h-0.5 bg-red-500">
      <span className="absolute -left-1 -top-[5px] h-3 w-3 rounded-full bg-red-500" />
    </div>
  );
}

function AgendaDay({ day, events, onSelect }: { day: Date; events: CalendarEvent[]; onSelect: OnSelect }) {
  const isToday = dayKey(day) === dayKey(new Date());
  const [now, setNow] = useState(() => Date.now() / 1000);

  useEffect(() => {
    if (!isToday) return;
    const interval = setInterval(() => setNow(Date.now() / 1000), 60 * 1000);
    return () => clearInterval(interval);
  }, [isToday]);

  const groups = groupEpisodes(events);
  const upcomingIndex = groups.findIndex((group) => group.airingAt > now);
  const nowIndex = isToday ? (upcomingIndex === -1 ? groups.length : upcomingIndex) : -1;

  return (
    <div>
      <h2 className={`px-2 pb-1 pt-3 text-xs font-medium uppercase ${isToday ? "text-primary" : "text-muted"}`}>
        {day.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}
      </h2>
      {groups.map((group, i) => (
        <Fragment key={group.event.id}>
          {i === nowIndex && <NowLine />}
          <AgendaRow group={group} onSelect={onSelect} />
        </Fragment>
      ))}
      {nowIndex === groups.length && <NowLine />}
    </div>
  );
}

function AgendaView({
  weekStart,
  byDay,
  onSelect,
}: {
  weekStart: Date;
  byDay: Map<string, CalendarEvent[]>;
  onSelect: OnSelect;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((day) => byDay.has(dayKey(day)));

  return (
    <div className={`flex-1 overflow-y-auto px-2 ${NAV_CLEARANCE}`}>
      {days.length === 0 && <p className="px-2 pt-4 text-sm text-subtle">Nothing scheduled</p>}
      {days.map((day) => (
        <AgendaDay key={dayKey(day)} day={day} events={byDay.get(dayKey(day))!} onSelect={onSelect} />
      ))}
    </div>
  );
}

function MobileMonthView({
  cursor,
  byDay,
  onPickDay,
  onSelect,
}: {
  cursor: Date;
  byDay: Map<string, CalendarEvent[]>;
  onPickDay: (day: Date) => void;
  onSelect: OnSelect;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const today = dayKey(new Date());
  const selected = dayKey(cursor);
  const selectedRow = Math.max(0, Math.floor(days.findIndex((day) => dayKey(day) === selected) / 7));
  const listRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; atTop: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsingGesture, setCollapsingGesture] = useState(false);
  const selectedColumn = Math.max(0, days.findIndex((day) => dayKey(day) === selected) % 7);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onTouchStart={(e) => {
        touchStart.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          atTop: (listRef.current?.scrollTop ?? 0) === 0,
        };
      }}
      onTouchMove={(e) => {
        const start = touchStart.current;
        if (!start) return;
        const dx = e.touches[0].clientX - start.x;
        const dy = e.touches[0].clientY - start.y;
        if (Math.abs(dx) > Math.abs(dy) * SWIPE_HORIZONTAL_BIAS) return;
        if (dy < -SWIPE_THRESHOLD) {
          if (!collapsed) setCollapsingGesture(true);
          setCollapsed(true);
          touchStart.current = null;
        } else if (dy > SWIPE_THRESHOLD && start.atTop) {
          setCollapsed(false);
          touchStart.current = null;
        }
      }}
      onTouchEnd={() => setCollapsingGesture(false)}
      onTouchCancel={() => setCollapsingGesture(false)}
    >
      <div className="grid shrink-0 select-none grid-cols-7 px-1 pt-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-center text-[11px] font-medium uppercase text-muted">
            {d[0]}
          </span>
        ))}
      </div>
      <div
        className="shrink-0 select-none overflow-hidden px-1 transition-[height] duration-300 ease-out"
        style={{ height: (collapsed ? 1 : weeks) * MOBILE_ROW_HEIGHT }}
      >
        <div
          className="relative grid grid-cols-7 transition-transform duration-300 ease-out"
          style={{ transform: collapsed ? `translateY(-${selectedRow * MOBILE_ROW_HEIGHT}px)` : undefined }}
        >
          <span
            className="absolute left-0 top-0 rounded-lg bg-hover transition-transform duration-200 ease-out"
            style={{
              width: `${100 / 7}%`,
              height: MOBILE_ROW_HEIGHT,
              transform: `translate(${selectedColumn * 100}%, ${selectedRow * MOBILE_ROW_HEIGHT}px)`,
            }}
          />
          {days.map((day) => {
            const key = dayKey(day);
            const groups = groupEpisodes(byDay.get(key) ?? []);
            return (
              <button
                key={key}
                onClick={() => onPickDay(day)}
                className="relative flex flex-col items-center gap-1 rounded-lg pt-1"
                style={{ height: MOBILE_ROW_HEIGHT }}
              >
                <span
                  className={`flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs font-medium ${
                    key === today
                      ? "bg-primary text-on-primary"
                      : day.getMonth() === cursor.getMonth()
                        ? ""
                        : "text-subtle"
                  }`}
                >
                  {day.getDate()}
                </span>
                <span className="flex items-center gap-0.5">
                  {groups.slice(0, 3).map(({ event }) => (
                    <span
                      key={event.id}
                      className={`h-1.5 w-1.5 rounded-full ${STATUSES[event.listStatus ?? ""]?.dot ?? "bg-other"}`}
                    />
                  ))}
                  {groups.length > 3 && <span className="text-[9px] leading-none text-muted">+</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        onClick={() => {
          if (collapsed) listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          setCollapsed(!collapsed);
        }}
        aria-label={collapsed ? "Expand month" : "Collapse month"}
        className="flex shrink-0 justify-center border-b border-line py-1.5"
      >
        <span className="h-1 w-8 rounded-full bg-chip" />
      </button>
      <SwipePager
        onChange={(direction) => onPickDay(addDays(cursor, direction))}
        pageKey={(offset) => dayKey(addDays(cursor, offset))}
        renderPage={(offset) => {
          const day = addDays(cursor, offset);
          const events = byDay.get(dayKey(day)) ?? [];
          return (
            <div
              ref={offset === 0 ? listRef : undefined}
              className={`flex-1 overscroll-contain px-2 ${NAV_CLEARANCE} ${collapsed && !collapsingGesture ? "overflow-y-auto" : "overflow-hidden"}`}
            >
              {events.length > 0 ? (
                <AgendaDay day={day} events={events} onSelect={onSelect} />
              ) : (
                <p className="px-2 pt-4 text-sm text-subtle">Nothing scheduled</p>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}

function WeekView({
  weekStart,
  byDay,
  onSelect,
  onShowMore,
}: {
  weekStart: Date;
  byDay: Map<string, CalendarEvent[]>;
  onSelect: OnSelect;
  onShowMore: (groups: EpisodeGroup[], rect: DOMRect) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const now = new Date();
  const today = dayKey(now);
  const nowOffset = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT;
  const timeZone = new Intl.DateTimeFormat([], { timeZoneName: "short" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 8 * HOUR_HEIGHT });
  }, []);

  return (
    <div className="flex min-h-0 flex-1 select-none flex-col">
      <div className="flex border-b border-line">
        <div className="flex w-16 shrink-0 items-end justify-center pb-1 text-[10px] text-subtle">{timeZone}</div>
        <div className="grid flex-1 grid-cols-7">
          {days.map((day, i) => {
            const isToday = dayKey(day) === today;
            return (
              <div key={dayKey(day)} className="flex flex-col items-center pb-2 pt-2">
                <span className={`text-[11px] font-medium uppercase ${isToday ? "text-primary" : "text-muted"}`}>
                  {WEEKDAYS[i]}
                </span>
                <span
                  className={`mt-1 flex h-12 w-12 items-center justify-center rounded-xl text-[26px] ${
                    isToday ? "bg-primary text-on-primary" : ""
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="relative flex" style={{ height: 24 * HOUR_HEIGHT }}>
          <div className="w-16 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative text-right text-[10px] text-subtle" style={{ height: HOUR_HEIGHT }}>
                {h > 0 && <span className="absolute -top-2 right-2">{String(h).padStart(2, "0")}:00</span>}
              </div>
            ))}
          </div>
          <div className="grid flex-1 grid-cols-7">
            {days.map((day) => (
              <div key={dayKey(day)} className="relative border-l border-line">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="border-b border-line" style={{ height: HOUR_HEIGHT }} />
                ))}
                {(() => {
                  const { placed, overflow } = layoutDay(groupEpisodes(byDay.get(dayKey(day)) ?? []));
                  const position = (airingAt: number, lane: number, span: number, columns: number) => {
                    const start = new Date(airingAt * 1000);
                    return {
                      top: ((start.getHours() * 60 + start.getMinutes()) / 60) * HOUR_HEIGHT,
                      height: (EPISODE_SECONDS / 3600) * HOUR_HEIGHT,
                      left: `${(lane / columns) * 100}%`,
                      width: `calc(${(span / columns) * 100}% - 4px)`,
                    };
                  };
                  return (
                    <>
                      {placed.map(({ group: { event, firstEpisode }, lane, span, columns }) => {
                        const status = STATUSES[event.listStatus ?? ""];
                        return (
                          <button
                            key={event.id}
                            onClick={(e) => onSelect(event, e.currentTarget.getBoundingClientRect(), firstEpisode)}
                            title={`${formatTime(event.airingAt)} ${event.title} · Ep ${episodeRange(firstEpisode, event.episode)}`}
                            className={`absolute overflow-hidden rounded-md border-l-[3px] px-1.5 text-left text-xs leading-[22px] hover:z-10 hover:shadow-lg ${
                              status ? `${status.block} ${status.bar}` : "border-other bg-other/20"
                            } ${fadeClass(event)}`}
                            style={position(event.airingAt, lane, span, columns)}
                          >
                            <span className="block truncate">
                              <span className="font-medium">{event.title}</span>, Ep{" "}
                              {episodeRange(firstEpisode, event.episode)}, {formatTime(event.airingAt)}
                            </span>
                          </button>
                        );
                      })}
                      {overflow.map(({ airingAt, groups, lane, columns }) => (
                        <button
                          key={`more-${airingAt}`}
                          onClick={(e) => onShowMore(groups, e.currentTarget.getBoundingClientRect())}
                          title={`${groups.length} more`}
                          className="absolute rounded-md bg-chip px-1.5 text-left text-xs font-medium leading-[22px] hover:z-10 hover:shadow-lg"
                          style={position(airingAt, lane, 1, columns)}
                        >
                          +{groups.length}
                        </button>
                      ))}
                    </>
                  );
                })()}
                {dayKey(day) === today && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-red-500" style={{ top: nowOffset }}>
                    <span className="absolute -left-1.5 -top-[5px] h-3 w-3 rounded-full bg-red-500" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Popover({
  label,
  anchor,
  width,
  onClose,
  children,
}: {
  label: string;
  anchor: DOMRect;
  width: number;
  onClose: () => void;
  children: (close: () => void, expanded: boolean) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [sheetBody, setSheetBody] = useState<HTMLDivElement | null>(null);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);
  const [heightLocked, setHeightLocked] = useState(false);
  const [expandableHeight, setExpandableHeight] = useState(0);
  const isMobile = useIsMobile();
  const close = () => (isMobile ? setSheetOpen(false) : setClosing(true));

  const opensRight = anchor.right + 8 + width < window.innerWidth;
  const left = opensRight
    ? anchor.right + 8
    : Math.max(8, Math.min(anchor.left - 8 - width, window.innerWidth - width - 8));

  useLayoutEffect(() => {
    if (isMobile) return;
    const el = ref.current!;
    const place = () => {
      el.style.top = `${Math.max(8, Math.min(anchor.top, window.innerHeight - el.offsetHeight - 8))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    return () => observer.disconnect();
  }, [anchor, isMobile]);

  useEffect(() => {
    if (!sheetBody || heightLocked) return;
    const measure = () => {
      const expandable = sheetBody.querySelector<HTMLElement>("[data-sheet-expandable]");
      setCollapsedHeight(sheetBody.offsetHeight);
      setExpandableHeight(expandable ? expandable.scrollHeight - expandable.clientHeight : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sheetBody);
    return () => observer.disconnect();
  }, [sheetBody, heightLocked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setClosing(true);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (isMobile) {
    const sheetTopGap = window.innerHeight * (1 - SHEET_HEIGHT);
    const firstSnap = collapsedHeight
      ? `${Math.min(collapsedHeight + sheetTopGap, window.innerHeight * SHEET_MAX_FIRST_SNAP)}px`
      : SHEET_MAX_FIRST_SNAP;
    const expandedSnap =
      collapsedHeight && `${Math.min(collapsedHeight + expandableHeight + sheetTopGap, window.innerHeight)}px`;
    const snapPoints = expandedSnap && expandableHeight > 0 ? [firstSnap, expandedSnap] : [firstSnap];
    return (
      <>
        <div
          className={`animate-fade-in pointer-events-none fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
            sheetOpen ? "" : "opacity-0"
          }`}
        />
        <Drawer.Root
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          onAnimationEnd={(open) => !open && onClose()}
          snapPoints={snapPoints}
          activeSnapPoint={snapPoints[sheetExpanded ? snapPoints.length - 1 : 0]}
          setActiveSnapPoint={(point) => {
            const expanding = snapPoints.length > 1 && point === snapPoints[1];
            if (expanding) setHeightLocked(true);
            setSheetExpanded(expanding);
          }}
        >
          <Drawer.Portal>
            <Drawer.Content
              aria-describedby={undefined}
              className="fixed inset-x-0 bottom-0 z-50 flex h-full max-h-[96%] flex-col rounded-t-3xl bg-raised outline-none"
            >
              <Drawer.Title className="sr-only">{label}</Drawer.Title>
              <div className="absolute left-1/2 top-2 z-10 h-1.5 w-10 -translate-x-1/2 rounded-full bg-white/70" />
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-t-3xl">
                <div ref={setSheetBody} className="flex flex-col pb-[env(safe-area-inset-bottom)]">
                  {children(close, sheetExpanded)}
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </>
    );
  }

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
        {children(close, false)}
      </div>
    </div>
  );
}

function EventPopover({
  event,
  anchor,
  firstEpisode,
  onClose,
}: {
  event: CalendarEvent;
  anchor: DOMRect;
  firstEpisode: number;
  onClose: () => void;
}) {
  const [description, setDescription] = useState<string | null>();
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    loadDescription(event.mediaId).then(setDescription);
  }, [event.mediaId]);

  const status = STATUSES[event.listStatus ?? ""];
  const season = event.season && `${event.season[0]}${event.season.slice(1).toLowerCase()} ${event.seasonYear ?? ""}`;
  const facts = [event.format?.replace("_", " "), season, event.studio, event.averageScore && `${event.averageScore}%`].filter(
    Boolean,
  );
  const airDate = new Date(event.airingAt * 1000).toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <Popover label={event.title} anchor={anchor} width={POPOVER_WIDTH} onClose={onClose}>
      {(close, sheetExpanded) => {
        const showFull = isMobile ? sheetExpanded : expanded;
        return (
          <>
            <div className="relative h-32 shrink-0 bg-chip">
              {event.bannerImage ? (
                <img
                  src={event.bannerImage}
                  alt=""
                  draggable={false}
                  onLoad={() => setBannerLoaded(true)}
                  className={`h-full w-full object-cover transition-opacity duration-300 ${bannerLoaded ? "" : "opacity-0"}`}
                />
              ) : (
                <div className={`h-full w-full ${status?.dot ?? "bg-other"} opacity-60`} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <div className="absolute right-2 top-2 flex gap-1">
                <a
                  href={event.siteUrl}
                  target="_blank"
                  rel="noreferrer"
                  title="Open on AniList"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
                >
                  <ExternalLink className="h-5 w-5" />
                </a>
                <button
                  onClick={close}
                  title="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex gap-4 px-5">
              {event.coverImage && (
                <div className="relative -mt-14 aspect-[2/3] w-24 shrink-0 self-start overflow-hidden rounded-lg bg-chip shadow-lg ring-4 ring-raised">
                  <img
                    src={event.coverImage}
                    alt=""
                    draggable={false}
                    onLoad={() => setCoverLoaded(true)}
                    className={`h-full w-full object-cover transition-opacity duration-300 ${coverLoaded ? "" : "opacity-0"}`}
                  />
                </div>
              )}
              <div className="min-w-0 pt-3">
                <h2 className="text-[22px] leading-snug">{event.title}</h2>
                <p className="text-sm text-muted">
                  {airDate} · {formatTime(event.airingAt)}
                </p>
                <p className="text-sm text-muted">
                  {firstEpisode === event.episode ? "Episode" : "Episodes"} {episodeRange(firstEpisode, event.episode)}
                  {event.episodes ? ` of ${event.episodes}` : ""}
                </p>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-5 py-4 text-sm">
              <div className="flex select-none flex-wrap items-center gap-1.5">
                {status && (
                  <span className="flex items-center gap-1.5 rounded-md bg-chip px-2.5 py-0.5 text-xs font-medium">
                    <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                    {status.label} · {event.progress}
                    {event.episodes ? `/${event.episodes}` : ""}
                  </span>
                )}
                {facts.map((f) => (
                  <span key={String(f)} className="rounded-md bg-chip px-2.5 py-0.5 text-xs text-muted">
                    {f}
                  </span>
                ))}
              </div>

              {event.genres.length > 0 && <p className="text-xs text-subtle">{event.genres.join(" · ")}</p>}

              {description === undefined && (
                <div className="flex animate-pulse flex-col gap-2 py-1" aria-hidden>
                  <div className="h-3 rounded bg-chip" />
                  <div className="h-3 rounded bg-chip" />
                  <div className="h-3 rounded bg-chip" />
                  <div className="h-3 w-2/3 rounded bg-chip" />
                </div>
              )}
              {description && (
                <div>
                  <p
                    data-sheet-expandable
                    ref={(el) => {
                      if (el) setFullHeight(el.scrollHeight);
                    }}
                    className={`overflow-hidden whitespace-pre-line text-muted transition-[max-height] duration-300 ease-out ${
                      !showFull && fullHeight > DESCRIPTION_COLLAPSED_HEIGHT
                        ? "[mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
                        : ""
                    }`}
                    style={{ maxHeight: showFull ? fullHeight : DESCRIPTION_COLLAPSED_HEIGHT }}
                  >
                    {description}
                  </p>
                  {!isMobile && fullHeight > DESCRIPTION_COLLAPSED_HEIGHT && (
                    <button
                      onClick={() => setExpanded(!expanded)}
                      className="mt-1 text-xs font-medium text-primary hover:underline"
                    >
                      {expanded ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        );
      }}
    </Popover>
  );
}
