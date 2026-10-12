import { Fragment, memo, useEffect, useState } from "react";
import {
  addDays,
  dayKey,
  episodeRange,
  formatTime,
  groupEpisodes,
  type CalendarEvent,
  type EpisodeGroup,
} from "@/lib/calendar";
import { fadeClass, STATUSES, type OnSelect } from "../shared";
import { NAV_CLEARANCE } from "./shared";

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

export const AgendaDay = memo(
  function AgendaDay({
    day,
    events,
    onSelect,
  }: {
    day: Date;
    events: CalendarEvent[];
    onSelect: OnSelect;
  }) {
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
  },
  (prev, next) =>
    dayKey(prev.day) === dayKey(next.day) && prev.events === next.events && prev.onSelect === next.onSelect,
);

export default function AgendaView({
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
