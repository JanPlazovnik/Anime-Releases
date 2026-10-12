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

export type Airing = Pick<CalendarEvent, "id" | "mediaId" | "episode" | "airingAt">;
export type Show = Omit<CalendarEvent, keyof Airing | "listStatus" | "progress"> & { id: number };

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function startOfWeek(d: Date) {
  return addDays(startOfDay(d), -((d.getDay() + 6) % 7));
}

export function formatDateParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatTime(seconds: number) {
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function isWatched(e: CalendarEvent) {
  return e.listStatus !== null && e.episode <= e.progress;
}

export function eventLabel(e: CalendarEvent) {
  return `${e.title} · Ep ${e.episode}${e.episodes ? `/${e.episodes}` : ""}`;
}

export function episodeRange(first: number, last: number) {
  return first === last ? String(last) : `${first}-${last}`;
}

export function groupEpisodes(events: CalendarEvent[]) {
  const groups = new Map<string, { event: CalendarEvent; firstEpisode: number; airingAt: number }>();
  for (const event of events) {
    const key = `${event.mediaId}-${event.airingAt}`;
    const group = groups.get(key);
    if (!group) groups.set(key, { event, firstEpisode: event.episode, airingAt: event.airingAt });
    else if (event.episode > group.event.episode) group.event = event;
  }
  return [...groups.values()];
}

export type EpisodeGroup = ReturnType<typeof groupEpisodes>[number];
