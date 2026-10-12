import { useState, type ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import type { CalendarEvent } from "@/lib/calendar";
import { useEpisodeLists, type EpisodeListItem } from "../hooks";
import { STATUSES, type OnSelect } from "../shared";

const SIDEBAR_LIMIT = 8;

export function SidebarSection({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
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

export function EpisodeLists({
  events,
  signedIn,
  onSelect,
}: {
  events: CalendarEvent[];
  signedIn: boolean;
  onSelect: OnSelect;
}) {
  const { toWatch, upNext } = useEpisodeLists(events, signedIn, SIDEBAR_LIMIT);
  const [expanded, setExpanded] = useState(false);

  const sections = [
    ...(signedIn ? [{ key: "toWatch", title: "To watch", items: toWatch, empty: "All caught up", expandable: true }] : []),
    { key: "upNext", title: "Up next", items: upNext, empty: "Nothing scheduled", expandable: false },
  ];

  const renderItems = (items: EpisodeListItem[], empty: string, limit: number | null) => (
    <>
      {items.length === 0 && <p className="px-3 text-sm text-subtle">{empty}</p>}
      {(limit === null ? items : items.slice(0, limit)).map(({ event, firstEpisode, detail }) => (
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
      ))}
    </>
  );

  return sections.map((section) => (
    <SidebarSection key={section.key} title={section.title} count={section.items.length}>
      {renderItems(section.items, section.empty, section.expandable && !expanded ? SIDEBAR_LIMIT : null)}
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
