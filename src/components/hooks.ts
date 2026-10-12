import { useEffect, useState, useSyncExternalStore } from "react";
import { episodeRange, formatDuration, formatTime, groupEpisodes, type CalendarEvent } from "@/lib/calendar";

export type Theme = "system" | "light" | "dark";

export const THEMES: Record<Theme, string> = { system: "Use device default", light: "Light", dark: "Dark" };

const MOBILE_QUERY = "(max-width: 767px)";

function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useIsMobile() {
  return useSyncExternalStore(subscribeMobile, () => window.matchMedia(MOBILE_QUERY).matches, () => false);
}

function applyTheme(theme: Theme) {
  if (theme === "system") localStorage.removeItem("theme");
  else localStorage.setItem("theme", theme);
  const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("theme") as Theme | null) ?? "system");
  const changeTheme = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };
  return [theme, changeTheme] as const;
}

export function useEpisodeLists(events: CalendarEvent[], signedIn: boolean, upNextLimit: number) {
  const [now, setNow] = useState(() => Date.now() / 1000);

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
    .slice(0, upNextLimit)
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

  return { toWatch, upNext };
}

export type EpisodeListItem = ReturnType<typeof useEpisodeLists>["toWatch"][number];
