"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import {
  clearSession,
  InvalidTokenError,
  loadSession,
  readTokenFromHash,
  refreshEntries,
  signIn,
  type Session,
} from "@/lib/anilist-browser";
import {
  addDays,
  dayKey,
  formatDateParam,
  startOfDay,
  startOfWeek,
  type Airing,
  type CalendarEvent,
  type Show,
} from "@/lib/calendar";
import DesktopCalendar from "./desktop/DesktopCalendar";
import { useIsMobile } from "./hooks";
import MobileCalendar from "./mobile/MobileCalendar";
import { IconButton, replaceSearchParams, STATUSES, type LayoutProps, type View } from "./shared";

const LIST_TTL_MS = 15 * 60 * 1000;
const SYNC_COOLDOWN_MS = 60 * 1000;

function readUrlState() {
  const params = new URLSearchParams(window.location.search);
  const match = params.get("date")?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match && new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return {
    view: params.get("view") === "week" ? ("week" as const) : ("month" as const),
    cursor: date && formatDateParam(date) === match[0] ? date : startOfDay(new Date()),
  };
}

const subscribeNothing = () => () => {};

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
  const [view, setView] = useState<View>(() => (typeof window === "undefined" ? "month" : readUrlState().view));
  const [cursor, setCursor] = useState(() =>
    typeof window === "undefined" ? startOfDay(new Date()) : readUrlState().cursor,
  );
  const [enabled, setEnabled] = useState(() => new Set(Object.keys(STATUSES)));
  const [showAll, setShowAll] = useState(initialShowAll);
  const [session, setSession] = useState<Session | null>(() =>
    typeof window === "undefined" ? null : loadSession(),
  );
  const [syncing, setSyncing] = useState(
    () => typeof window !== "undefined" && window.location.hash.includes("access_token"),
  );
  const isMobile = useIsMobile();
  const busy = syncing || serverSyncing;

  useEffect(() => {
    replaceSearchParams((params) => {
      if (view === "week") params.set("view", view);
      else params.delete("view");
      if (isClient && !isMobile) {
        params.delete("tab");
        params.delete("list");
      }
      if (dayKey(cursor) === dayKey(new Date())) params.delete("date");
      else params.set("date", formatDateParam(cursor));
    });
  }, [view, cursor, isClient, isMobile]);

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

  const entries = session?.entries;
  const events = useMemo(() => {
    const showsById = new Map(shows.map((show) => [show.id, show]));
    const entriesByMedia = new Map((entries ?? []).map((entry) => [entry.mediaId, entry]));
    return airings.map((a): CalendarEvent => {
      const entry = entriesByMedia.get(a.mediaId);
      return { ...showsById.get(a.mediaId)!, ...a, listStatus: entry?.listStatus ?? null, progress: entry?.progress ?? 0 };
    });
  }, [airings, shows, entries]);

  const signedIn = session !== null;
  const byDay = useMemo(() => {
    const visible = events.filter((e) => (e.listStatus ? enabled.has(e.listStatus) : showAll || !signedIn));
    const days = new Map<string, CalendarEvent[]>();
    for (const e of visible) {
      const key = dayKey(new Date(e.airingAt * 1000));
      days.set(key, [...(days.get(key) ?? []), e]);
    }
    return days;
  }, [events, enabled, showAll, signedIn]);

  if (!isClient) return null;

  const viewer = session?.viewer ?? null;

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
  const filters = (
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

  const layout: LayoutProps = {
    events,
    byDay,
    viewer,
    clientId,
    busy,
    view,
    setView,
    cursor,
    setCursor,
    title,
    step,
    filters,
    syncButton,
    signOut,
  };

  return isMobile ? (
    <MobileCalendar {...layout} listStatus={listStatus} scheduleStatus={scheduleStatus} />
  ) : (
    <DesktopCalendar {...layout} />
  );
}
