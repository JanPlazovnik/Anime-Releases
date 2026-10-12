import { useCallback, useEffect, useState } from "react";
import { Drawer } from "vaul";
import { CalendarDays, ChevronLeft, ChevronRight, List, ListFilter } from "lucide-react";
import { addDays, dayKey, startOfDay, startOfWeek } from "@/lib/calendar";
import EventDetails from "../EventDetails";
import { IconButton, ProgressBar, replaceSearchParams, type LayoutProps, type OnSelect } from "../shared";
import AgendaView from "./AgendaView";
import MonthView from "./MonthView";
import Settings from "./Settings";
import { GLASS, TAB_KEYS, TABS, type Tab } from "./shared";
import Sheet from "./Sheet";
import SwipePager from "./SwipePager";
import Watchlist from "./Watchlist";

export default function MobileCalendar({
  events,
  byDay,
  viewer,
  clientId,
  busy,
  view,
  setView,
  cursor,
  setCursor,
  step,
  filters,
  syncButton,
  signOut,
  listStatus,
  scheduleStatus,
}: LayoutProps & { listStatus: string | null; scheduleStatus: string }) {
  const [tab, setTab] = useState<Tab>(
    () => TAB_KEYS.find((t) => t === new URLSearchParams(window.location.search).get("tab")) ?? "calendar",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: number; firstEpisode?: number } | null>(null);
  const weekStart = startOfWeek(cursor);
  const weekEnd = addDays(weekStart, 6);
  const crossesMonth = view === "week" && weekStart.getMonth() !== weekEnd.getMonth();
  const monthTitle = crossesMonth
    ? `${weekStart.toLocaleDateString([], { month: "short" })} – ${weekEnd.toLocaleDateString([], { month: "short" })}`
    : cursor.toLocaleDateString([], { month: "long" });
  const titleYear = (crossesMonth ? weekEnd : cursor).getFullYear();
  const selectedEvent = selected && events.find((e) => e.id === selected.id);
  const onSelect: OnSelect = useCallback(
    (event, _rect, firstEpisode) => setSelected({ id: event.id, firstEpisode }),
    [],
  );
  useEffect(() => {
    replaceSearchParams((params) => {
      if (tab !== "calendar") params.set("tab", tab);
      else params.delete("tab");
    });
  }, [tab]);

  const tabPanelClass = (t: Tab) => `absolute inset-0 flex flex-col ${tab === t ? "" : "invisible"}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 select-none items-center gap-2 pl-4 pr-3">
        <h1 className="min-w-0 flex-1 truncate text-2xl font-bold tracking-tight">
          {tab === "calendar" ? (
            <>
              {monthTitle}
              {titleYear !== new Date().getFullYear() && <span className="font-normal text-muted"> {titleYear}</span>}
            </>
          ) : (
            TABS[tab].label
          )}
        </h1>
        {tab === "calendar" && (
          <>
            <div className={`flex shrink-0 rounded-full p-0.5 ${GLASS}`}>
              <IconButton icon={ChevronLeft} title={view === "month" ? "Previous month" : "Previous week"} onClick={() => step(-1)} />
              <IconButton icon={ChevronRight} title={view === "month" ? "Next month" : "Next week"} onClick={() => step(1)} />
            </div>
            <div className={`flex shrink-0 rounded-full p-0.5 ${GLASS}`}>
              <IconButton
                icon={view === "month" ? List : CalendarDays}
                title={view === "month" ? "Show list" : "Show month"}
                onClick={() => setView(view === "month" ? "week" : "month")}
              />
              {viewer && <IconButton icon={ListFilter} title="Show" onClick={() => setFiltersOpen(true)} />}
              <button
                onClick={() => setCursor(startOfDay(new Date()))}
                title="Today"
                aria-label="Today"
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-hover"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-muted text-[11px] font-semibold text-muted">
                  {new Date().getDate()}
                </span>
              </button>
            </div>
          </>
        )}
      </header>
      <ProgressBar busy={busy} />

      <main className="relative min-h-0 flex-1">
        <div className={tabPanelClass("calendar")} inert={tab !== "calendar"}>
          <div className="mx-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl bg-surface">
            {view === "month" ? (
              <MonthView cursor={cursor} byDay={byDay} onPickDay={setCursor} onSelect={onSelect} />
            ) : (
              <SwipePager
                onChange={(offset) => setCursor((current) => addDays(current, offset * 7))}
                pageKey={(offset) => dayKey(addDays(weekStart, offset * 7))}
                renderPage={(offset) => (
                  <AgendaView weekStart={addDays(weekStart, offset * 7)} byDay={byDay} onSelect={onSelect} />
                )}
              />
            )}
          </div>
        </div>
        <div className={tabPanelClass("watchlist")} inert={tab !== "watchlist"}>
          <Watchlist events={events} viewer={viewer} clientId={clientId} onSelect={onSelect} />
        </div>
        <div className={tabPanelClass("settings")} inert={tab !== "settings"}>
          <Settings
            viewer={viewer}
            clientId={clientId}
            signOut={signOut}
            syncButton={syncButton}
            listStatus={listStatus}
            scheduleStatus={scheduleStatus}
          />
        </div>
      </main>

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-[calc(6rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-page via-page/70 to-transparent" />
      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex select-none justify-center px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className={`pointer-events-auto relative flex w-full max-w-sm rounded-full p-1 ${GLASS}`}>
          <span
            className="absolute bottom-1 left-1 top-1 rounded-full bg-primary/15 transition-transform duration-300 ease-out"
            style={{
              width: `calc((100% - 0.5rem) / ${TAB_KEYS.length})`,
              transform: `translateX(${TAB_KEYS.indexOf(tab) * 100}%)`,
            }}
          />
          {TAB_KEYS.map((t) => {
            const { label, icon: TabIcon } = TABS[t];
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-current={tab === t ? "page" : undefined}
                className={`relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 transition-colors ${
                  tab === t ? "text-primary" : "text-muted"
                }`}
              >
                <TabIcon className="h-5 w-5" />
                <span className="text-[11px] font-medium leading-4">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <Drawer.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Drawer.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 select-none rounded-t-3xl bg-raised px-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-3 outline-none"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-chip" />
            <Drawer.Title className="px-3 pb-2 text-base font-medium">Show</Drawer.Title>
            {filters}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {selected && selectedEvent && (
        <Sheet key={selected.id} label={selectedEvent.title} onClose={() => setSelected(null)}>
          <EventDetails event={selectedEvent} firstEpisode={selected.firstEpisode ?? selectedEvent.episode} />
        </Sheet>
      )}
    </div>
  );
}
