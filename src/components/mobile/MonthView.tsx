import { useRef, useState } from "react";
import { addDays, dayKey, groupEpisodes, startOfWeek, WEEKDAYS, type CalendarEvent } from "@/lib/calendar";
import { STATUSES, type OnSelect } from "../shared";
import { AgendaDay } from "./AgendaView";
import { NAV_CLEARANCE, SWIPE_HORIZONTAL_BIAS } from "./shared";
import SwipePager from "./SwipePager";

const ROW_HEIGHT = 48;
const SWIPE_THRESHOLD = 24;

export default function MonthView({
  cursor,
  byDay,
  onPickDay,
  onSelect,
}: {
  cursor: Date;
  byDay: Map<string, CalendarEvent[]>;
  onPickDay: (day: Date) => void;
  onSelect: OnSelect;
}) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((((first.getDay() + 6) % 7) + daysInMonth) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(gridStart, i));
  const today = dayKey(new Date());
  const selected = dayKey(cursor);
  const selectedRow = Math.max(0, Math.floor(days.findIndex((day) => dayKey(day) === selected) / 7));
  const listRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; atTop: boolean } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [collapsingGesture, setCollapsingGesture] = useState(false);
  const selectedColumn = Math.max(0, days.findIndex((day) => dayKey(day) === selected) % 7);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      onTouchStart={(e) => {
        touchStart.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          atTop: (listRef.current?.scrollTop ?? 0) === 0,
        };
      }}
      onTouchMove={(e) => {
        const start = touchStart.current;
        if (!start) return;
        const dx = e.touches[0].clientX - start.x;
        const dy = e.touches[0].clientY - start.y;
        if (Math.abs(dx) > Math.abs(dy) * SWIPE_HORIZONTAL_BIAS) return;
        if (dy < -SWIPE_THRESHOLD) {
          if (!collapsed) setCollapsingGesture(true);
          setCollapsed(true);
          touchStart.current = null;
        } else if (dy > SWIPE_THRESHOLD && start.atTop) {
          setCollapsed(false);
          touchStart.current = null;
        }
      }}
      onTouchEnd={() => setCollapsingGesture(false)}
      onTouchCancel={() => setCollapsingGesture(false)}
    >
      <div className="grid shrink-0 select-none grid-cols-7 px-1 pt-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-center text-[11px] font-medium uppercase text-muted">
            {d[0]}
          </span>
        ))}
      </div>
      <div
        className="shrink-0 select-none overflow-hidden px-1 transition-[height] duration-300 ease-out"
        style={{ height: (collapsed ? 1 : weeks) * ROW_HEIGHT }}
      >
        <div
          className="relative grid grid-cols-7 transition-transform duration-300 ease-out"
          style={{ transform: collapsed ? `translateY(-${selectedRow * ROW_HEIGHT}px)` : undefined }}
        >
          <span
            className="absolute left-0 top-0 rounded-lg bg-hover transition-transform duration-200 ease-out"
            style={{
              width: `${100 / 7}%`,
              height: ROW_HEIGHT,
              transform: `translate(${selectedColumn * 100}%, ${selectedRow * ROW_HEIGHT}px)`,
            }}
          />
          {days.map((day) => {
            const key = dayKey(day);
            const groups = groupEpisodes(byDay.get(key) ?? []);
            return (
              <button
                key={key}
                onClick={() => onPickDay(day)}
                className="relative flex flex-col items-center gap-1 rounded-lg pt-1"
                style={{ height: ROW_HEIGHT }}
              >
                <span
                  className={`flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-xs font-medium ${
                    key === today
                      ? "bg-primary text-on-primary"
                      : day.getMonth() === cursor.getMonth()
                        ? ""
                        : "text-subtle"
                  }`}
                >
                  {day.getDate()}
                </span>
                <span className="flex items-center gap-0.5">
                  {groups.slice(0, 3).map(({ event }) => (
                    <span
                      key={event.id}
                      className={`h-1.5 w-1.5 rounded-full ${STATUSES[event.listStatus ?? ""]?.dot ?? "bg-other"}`}
                    />
                  ))}
                  {groups.length > 3 && <span className="text-[9px] leading-none text-muted">+</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <button
        onClick={() => {
          if (collapsed) listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          setCollapsed(!collapsed);
        }}
        aria-label={collapsed ? "Expand month" : "Collapse month"}
        className="flex shrink-0 justify-center border-b border-line py-1.5"
      >
        <span className="h-1 w-8 rounded-full bg-chip" />
      </button>
      <SwipePager
        onChange={(direction) => onPickDay(addDays(cursor, direction))}
        pageKey={(offset) => dayKey(addDays(cursor, offset))}
        renderPage={(offset) => {
          const day = addDays(cursor, offset);
          const events = byDay.get(dayKey(day)) ?? [];
          return (
            <div
              ref={offset === 0 ? listRef : undefined}
              className={`flex-1 overscroll-contain px-2 ${NAV_CLEARANCE} ${collapsed && !collapsingGesture ? "overflow-y-auto" : "overflow-hidden"}`}
            >
              {events.length > 0 ? (
                <AgendaDay day={day} events={events} onSelect={onSelect} />
              ) : (
                <p className="px-2 pt-4 text-sm text-subtle">Nothing scheduled</p>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
