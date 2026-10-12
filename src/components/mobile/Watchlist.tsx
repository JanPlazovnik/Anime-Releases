import type { CalendarEvent } from "@/lib/calendar";
import { useEpisodeLists, type EpisodeListItem } from "../hooks";
import { STATUSES, type OnSelect } from "../shared";
import type { ListTab } from "./shared";

const UP_NEXT_PAGE_LIMIT = 30;

function EpisodeCard({ event, firstEpisode, when, cardDetail, onSelect }: EpisodeListItem & { onSelect: OnSelect }) {
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

export default function WatchlistPage({
  events,
  signedIn,
  onSelect,
  page,
}: {
  events: CalendarEvent[];
  signedIn: boolean;
  onSelect: OnSelect;
  page: ListTab;
}) {
  const { toWatch, upNext } = useEpisodeLists(events, signedIn, UP_NEXT_PAGE_LIMIT);
  const items = page === "toWatch" ? toWatch : upNext;

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && (
        <p className="px-1 pt-4 text-sm text-subtle">{page === "toWatch" ? "All caught up" : "Nothing scheduled"}</p>
      )}
      {items.map((item) => (
        <EpisodeCard key={item.event.id} {...item} onSelect={onSelect} />
      ))}
    </div>
  );
}
