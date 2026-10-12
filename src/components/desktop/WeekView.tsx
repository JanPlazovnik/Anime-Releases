import { useEffect, useRef } from "react";
import {
  addDays,
  dayKey,
  episodeRange,
  formatTime,
  groupEpisodes,
  WEEKDAYS,
  type CalendarEvent,
  type EpisodeGroup,
} from "@/lib/calendar";
import { fadeClass, STATUSES, type OnSelect } from "../shared";

const HOUR_HEIGHT = 48;
const EPISODE_SECONDS = 30 * 60;
const MAX_LANES = 3;

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

export default function WeekView({
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
