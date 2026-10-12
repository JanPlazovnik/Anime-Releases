import { memo, useEffect, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import type { Viewer } from "@/lib/anilist-browser";
import type { CalendarEvent } from "@/lib/calendar";
import { useEpisodeLists, type EpisodeListItem } from "../hooks";
import { replaceSearchParams, SignInButton, STATUSES, type OnSelect } from "../shared";
import { LIST_TABS, NAV_CLEARANCE, type ListTab } from "./shared";

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

const WatchlistPage = memo(function WatchlistPage({
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
});

export default function Watchlist({
  events,
  viewer,
  clientId,
  onSelect,
}: {
  events: CalendarEvent[];
  viewer: Viewer | null;
  clientId: string;
  onSelect: OnSelect;
}) {
  const [listTab, setListTab] = useState<ListTab>(() =>
    new URLSearchParams(window.location.search).get("list") === "upNext" ? "upNext" : "toWatch",
  );
  const [startIndex] = useState(() => LIST_TABS.findIndex(({ value }) => value === listTab));
  const [emblaRef, emblaApi] = useEmblaCarousel({ startIndex });
  const indicator = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!emblaApi) return;
    const follow = () => {
      const progress = Math.min(1, Math.max(0, emblaApi.scrollProgress()));
      indicator.current!.style.transform = `translateX(${progress * (LIST_TABS.length - 1) * 100}%)`;
    };
    const select = () => setListTab(LIST_TABS[emblaApi.selectedScrollSnap()].value);
    emblaApi.on("scroll", follow).on("reInit", follow).on("select", select);
    return () => {
      emblaApi.off("scroll", follow).off("reInit", follow).off("select", select);
    };
  }, [emblaApi]);

  useEffect(() => {
    replaceSearchParams((params) => {
      if (listTab === "upNext") params.set("list", listTab);
      else params.delete("list");
    });
  }, [listTab]);

  return (
    <>
      <div className="relative mx-3 mb-2 flex h-10 shrink-0 select-none rounded-full bg-chip p-1 text-sm font-medium">
        <span
          ref={indicator}
          className="absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-raised shadow-sm"
          style={{ transform: `translateX(${startIndex * 100}%)` }}
        />
        {LIST_TABS.map(({ value, label }, i) => (
          <button
            key={value}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`relative flex-1 rounded-full transition-colors ${listTab === value ? "text-ink" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div ref={emblaRef} className="min-h-0 flex-1 overflow-hidden">
        <div className="flex h-full touch-pan-y">
          {LIST_TABS.map(({ value }) => (
            <div
              key={value}
              className={`min-w-0 shrink-0 grow-0 basis-full overflow-y-auto overscroll-y-contain px-3 pt-1 ${NAV_CLEARANCE}`}
            >
              {value === "toWatch" && !viewer ? (
                <div className="flex justify-center pt-8">
                  <SignInButton clientId={clientId} />
                </div>
              ) : (
                <WatchlistPage events={events} signedIn={viewer !== null} onSelect={onSelect} page={value} />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
