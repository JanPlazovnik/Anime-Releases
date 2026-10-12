import { useEffect, useRef, useState } from "react";
import { addDays, dayKey, eventLabel, formatTime, startOfWeek, WEEKDAYS, type CalendarEvent } from "@/lib/calendar";
import { fadeClass, STATUSES, type OnSelect } from "../shared";

const MONTH_CHIP_HEIGHT = 22;

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

export default function MonthView({
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
