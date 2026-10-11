"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon, Logo, type ICONS } from "./icons";
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

function IconButton({
  icon,
  title,
  onClick,
  disabled,
  className = "",
  children,
}: {
  icon: keyof typeof ICONS;
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
      <Icon name={icon} className="h-6 w-6" />
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
  const [view, setView] = useState<"month" | "week">("month");
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window === "undefined" ? "system" : ((localStorage.getItem("theme") as Theme | null) ?? "system"),
  );
  const busy = syncing || serverSyncing;

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
  const syncTitle = session
    ? `List synced ${new Date(session.fetchedAt).toLocaleString()} · ${scheduleStatus}`
    : scheduleStatus;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 select-none items-center gap-1 px-2">
        <div className="flex w-[246px] shrink-0 items-center gap-1">
          <IconButton icon="menu" title="Main menu" onClick={() => setSidebarOpen(!sidebarOpen)} />
          <Logo className="ml-1 h-9 w-9 shrink-0" />
          <span className="ml-1.5 whitespace-nowrap text-lg text-muted">{SITE_NAME}</span>
        </div>
        <button
          onClick={() => setCursor(startOfDay(new Date()))}
          className="ml-2 mr-2 h-10 rounded-[10px] border border-subtle px-6 text-sm font-medium hover:bg-hover"
        >
          Today
        </button>
        <IconButton icon="chevronLeft" title={view === "month" ? "Previous month" : "Previous week"} onClick={() => step(-1)} />
        <IconButton icon="chevronRight" title={view === "month" ? "Next month" : "Next week"} onClick={() => step(1)} />
        <h1 className="ml-3 truncate text-[22px]">{title}</h1>

        <div className="ml-auto flex items-center gap-1">
          {viewer && (
            <IconButton
              icon="refresh"
              title={busy ? "Syncing…" : syncTitle}
              onClick={() => session && refreshList(session)}
              disabled={busy || onCooldown}
              className={busy ? "[&>svg]:animate-spin" : ""}
            >
              {syncError && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />}
            </IconButton>
          )}
          <Menu
            label="Settings"
            button={<Icon name="settings" className="h-6 w-6" />}
            buttonClassName="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-hover"
          >
            {(close) => (
              <>
                <p className="px-4 pb-1 pt-1 text-xs font-medium text-muted">Theme</p>
                {(Object.keys(THEMES) as Theme[]).map((t) => (
                  <MenuItem
                    key={t}
                    onClick={() => {
                      changeTheme(t);
                      close();
                    }}
                  >
                    <Icon name="check" className={theme === t ? "" : "invisible"} />
                    {THEMES[t]}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
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
                      <Icon name="openInNew" className="text-muted" />
                      View AniList profile
                    </a>
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-hover"
                    >
                      <Icon name="logout" className="text-muted" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </Menu>
          ) : (
            <a
              href={authorizeUrl(clientId)}
              className="ml-1 flex h-10 items-center rounded-[10px] bg-primary px-6 text-sm font-medium text-on-primary hover:shadow-md"
            >
              Sign in
            </a>
          )}
        </div>
      </header>
      <div className="relative h-0.5 shrink-0 overflow-hidden">
        {busy && <div className="animate-progress-slide absolute inset-y-0 w-2/5 bg-primary" />}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`hidden shrink-0 select-none overflow-hidden transition-[width] duration-200 md:block ${sidebarOpen ? "w-64" : "w-0"}`}
        >
          <div className="flex h-full w-64 flex-col gap-4 overflow-y-auto px-3 pb-4 pt-2">
            {viewer && (
              <SidebarSection title="Show">
                {Object.entries(STATUSES).map(([status, s]) => (
                  <label
                    key={status}
                    className="flex h-8 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm hover:bg-hover"
                  >
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
                  <input
                    type="checkbox"
                    checked={showAll}
                    onChange={toggleShowAll}
                    className="h-[18px] w-[18px] accent-other"
                  />
                  Everything else
                </label>
              </SidebarSection>
            )}
            <EpisodeLists events={visible} signedIn={viewer !== null} onSelect={onSelect} />
            <p className="mt-auto flex flex-col px-3 pt-4 text-xs leading-5 text-subtle">
              <span>Not affiliated with AniList</span>
              <span>
                Data from{" "}
                <a href="https://anilist.co" target="_blank" rel="noreferrer" className="hover:text-muted hover:underline">
                  AniList
                </a>
              </span>
            </p>
          </div>
        </aside>

        <main
          className={`mb-4 ml-4 mr-4 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface ${sidebarOpen ? "md:ml-0" : ""}`}
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
        <Popover anchor={moreList.rect} width={LIST_POPOVER_WIDTH} onClose={() => setMoreList(null)}>
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
          <Icon name="expandLess" className={`transition-transform duration-200 ${open ? "" : "rotate-180"}`} />
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

function EpisodeLists({
  events,
  signedIn,
  onSelect,
}: {
  events: CalendarEvent[];
  signedIn: boolean;
  onSelect: OnSelect;
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
    .map((event) => ({
      event,
      firstEpisode: event.progress + 1,
      detail: `Ep ${episodeRange(event.progress + 1, event.episode)} · ${formatDuration(now - event.airingAt)} ago`,
    }));
  const upNext = groupEpisodes(events.filter((e) => e.airingAt > now && (!signedIn || e.listStatus)))
    .slice(0, SIDEBAR_LIMIT)
    .map(({ event, firstEpisode }) => ({
      event,
      firstEpisode,
      detail: `Ep ${episodeRange(firstEpisode, event.episode)} · in ${formatDuration(event.airingAt - now)}`,
    }));

  const sections = [
    ...(signedIn ? [{ title: "To watch", items: toWatch, empty: "All caught up", expandable: true }] : []),
    { title: "Up next", items: upNext, empty: "Nothing scheduled", expandable: false },
  ];

  return sections.map((section) => (
    <SidebarSection key={section.title} title={section.title} count={section.items.length}>
      {section.items.length === 0 && <p className="px-3 text-sm text-subtle">{section.empty}</p>}
      {(section.expandable && !expanded ? section.items.slice(0, SIDEBAR_LIMIT) : section.items).map(
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
  const [clamped, setClamped] = useState(false);

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
    <Popover anchor={anchor} width={POPOVER_WIDTH} onClose={onClose}>
      {(close) => (
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
                <Icon name="openInNew" />
              </a>
              <button
                onClick={close}
                title="Close"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60"
              >
                <Icon name="close" />
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
                  ref={(el) => {
                    if (el && !expanded) setClamped(el.scrollHeight > el.clientHeight);
                  }}
                  className={`whitespace-pre-line text-muted ${expanded ? "" : "line-clamp-4"}`}
                >
                  {description}
                </p>
                {(clamped || expanded) && (
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
      )}
    </Popover>
  );
}
