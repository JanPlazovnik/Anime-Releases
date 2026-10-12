import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, X } from "lucide-react";
import { episodeRange, formatTime, type CalendarEvent } from "@/lib/calendar";
import { STATUSES } from "./shared";

const DESCRIPTION_COLLAPSED_HEIGHT = 80;

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

// Without close (the mobile sheet, dismissed by swiping), the header buttons give way to a full-width AniList action.
export default function EventDetails({
  event,
  firstEpisode,
  close,
}: {
  event: CalendarEvent;
  firstEpisode: number;
  close?: () => void;
}) {
  const [description, setDescription] = useState<string | null>();
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);

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
        {close && (
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
        )}
      </div>

      <div className="flex gap-4 px-5">
        {event.coverImage && (
          <div className="relative -mt-14 aspect-[2/3] w-24 shrink-0 self-start overflow-clip rounded-lg bg-chip shadow-lg ring-4 ring-raised">
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

      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain px-5 py-4 text-sm">
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
                if (el) setFullHeight(el.scrollHeight);
              }}
              onClick={close ? undefined : () => setExpanded(!expanded)}
              className={`overflow-clip whitespace-pre-line text-muted transition-[max-height] duration-300 ease-out ${
                !expanded && fullHeight > DESCRIPTION_COLLAPSED_HEIGHT
                  ? "[mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
                  : ""
              }`}
              style={{ maxHeight: expanded ? fullHeight : DESCRIPTION_COLLAPSED_HEIGHT }}
            >
              {description}
            </p>
            {fullHeight > DESCRIPTION_COLLAPSED_HEIGHT &&
              (close ? (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-1 text-xs font-medium text-primary hover:underline"
                >
                  {expanded ? "Show less" : "Show more"}
                </button>
              ) : (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-2 flex h-11 w-full items-center justify-center gap-1 rounded-xl bg-chip text-sm font-medium"
                >
                  {expanded ? "Show less" : "Show more"}
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
                </button>
              ))}
          </div>
        )}
      </div>

      {!close && (
        <div className="shrink-0 border-t border-line px-5 py-3">
          <a
            href={event.siteUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-chip text-sm font-medium"
          >
            Open on AniList
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}
    </>
  );
}
