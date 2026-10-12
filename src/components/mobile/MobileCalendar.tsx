import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import { CalendarDays, ChevronLeft, ChevronRight, List, ListFilter } from "lucide-react";
import { addDays, dayKey, startOfDay, startOfWeek } from "@/lib/calendar";
import EventDetails from "../EventDetails";
import { IconButton, ProgressBar, replaceSearchParams, SignInButton, type LayoutProps, type OnSelect } from "../shared";
import AgendaView from "./AgendaView";
import MonthView from "./MonthView";
import Settings from "./Settings";
import { LIST_TABS, NAV_CLEARANCE, SWIPE_NAVIGATE_DISTANCE, TAB_KEYS, TABS, useHorizontalDrag, type ListTab, type Tab } from "./shared";
import Sheet from "./Sheet";
import SwipePager from "./SwipePager";
import WatchlistPage from "./Watchlist";

const VIEWS = [
  { value: "month", label: "Month", icon: CalendarDays },
  { value: "week", label: "List", icon: List },
] as const;

const EDGE_RESISTANCE = 0.3;

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
  title,
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
  const [listTab, setListTab] = useState<ListTab>(() =>
    new URLSearchParams(window.location.search).get("list") === "upNext" ? "upNext" : "toWatch",
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selected, setSelected] = useState<{ id: number; firstEpisode?: number } | null>(null);
  const listIndex = LIST_TABS.findIndex(({ value }) => value === listTab);
  const {
    attach: attachListDrag,
    dragX: listDragX,
    dragging: listDragging,
    onTouchStart: onListTouchStart,
    onTouchEnd: onListTouchEnd,
  } = useHorizontalDrag((dx) => {
    const next = listIndex + (dx < 0 ? 1 : -1);
    if (Math.abs(dx) > SWIPE_NAVIGATE_DISTANCE && next >= 0 && next < LIST_TABS.length) {
      setListTab(LIST_TABS[next].value);
    }
  });
  const atListEdge =
    (listIndex === 0 && listDragX > 0) || (listIndex === LIST_TABS.length - 1 && listDragX < 0);
  const listDragOffset = atListEdge ? listDragX * EDGE_RESISTANCE : listDragX;
  const listIndicatorPercent = Math.min(
    100 * (LIST_TABS.length - 1),
    Math.max(0, listIndex * 100 - (listDragOffset / window.innerWidth) * 100),
  );

  const weekStart = startOfWeek(cursor);
  const selectedEvent = selected && events.find((e) => e.id === selected.id);
  const onSelect: OnSelect = (event, _rect, firstEpisode) => setSelected({ id: event.id, firstEpisode });
  useEffect(() => {
    replaceSearchParams((params) => {
      if (tab !== "calendar") params.set("tab", tab);
      else params.delete("tab");
      if (listTab === "upNext") params.set("list", listTab);
      else params.delete("list");
    });
  }, [tab, listTab]);

  const tabPanelClass = (t: Tab) => `absolute inset-0 flex flex-col ${tab === t ? "" : "invisible"}`;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 select-none items-center gap-1 px-2">
        {tab === "calendar" ? (
          <>
            <IconButton icon={ChevronLeft} title={view === "month" ? "Previous month" : "Previous week"} onClick={() => step(-1)} />
            <IconButton icon={ChevronRight} title={view === "month" ? "Next month" : "Next week"} onClick={() => step(1)} />
            <h1 className="ml-1 min-w-0 truncate text-lg">{title}</h1>
            <div className="ml-auto flex shrink-0 items-center">
              <IconButton icon={ListFilter} title="Show" onClick={() => setFiltersOpen(true)} />
              <button
                onClick={() => setCursor(startOfDay(new Date()))}
                title="Today"
                aria-label="Today"
                className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-hover"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-muted text-xs font-semibold text-muted">
                  {new Date().getDate()}
                </span>
              </button>
            </div>
          </>
        ) : tab === "watchlist" ? (
          <div className="relative mx-auto flex h-10 w-full max-w-xs rounded-full bg-chip p-1 text-sm font-medium">
            <span
              className={`absolute bottom-1 left-1 top-1 w-[calc(50%-0.25rem)] rounded-full bg-raised shadow-sm ${
                listDragging ? "" : "transition-transform duration-300 ease-out"
              }`}
              style={{ transform: `translateX(${listIndicatorPercent}%)` }}
            />
            {LIST_TABS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setListTab(value)}
                className={`relative flex-1 rounded-full transition-colors ${listTab === value ? "text-ink" : "text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : (
          <h1 className="px-2 text-lg">{TABS[tab].label}</h1>
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
                onChange={(direction) => setCursor((current) => addDays(current, direction * 7))}
                pageKey={(offset) => dayKey(addDays(weekStart, offset * 7))}
                renderPage={(offset) => (
                  <AgendaView weekStart={addDays(weekStart, offset * 7)} byDay={byDay} onSelect={onSelect} />
                )}
              />
            )}
          </div>
        </div>
        <div className={tabPanelClass("watchlist")} inert={tab !== "watchlist"}>
          <div
            ref={attachListDrag}
            onTouchStart={onListTouchStart}
            onTouchEnd={onListTouchEnd}
            className="flex min-h-0 flex-1 touch-pan-y overflow-hidden"
          >
            <div
              className={`flex min-h-0 w-[200%] shrink-0 ${listDragging ? "" : "transition-transform duration-300 ease-out"}`}
              style={{ transform: `translateX(calc(${-listIndex * 50}% + ${listDragOffset}px))` }}
            >
              {LIST_TABS.map(({ value }) => (
                <div key={value} inert={listTab !== value} className={`w-1/2 overflow-y-auto px-3 pt-1 ${NAV_CLEARANCE}`}>
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

      <nav className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex select-none justify-center px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <div className="pointer-events-auto relative flex w-full max-w-sm rounded-full border border-line bg-raised/75 p-1 shadow-xl backdrop-blur-xl">
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
                title={label}
                aria-label={label}
                className={`relative flex flex-1 items-center justify-center rounded-full py-3 transition-colors ${
                  tab === t ? "text-primary" : "text-muted"
                }`}
              >
                <TabIcon className="h-6 w-6" />
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
            <div className="flex gap-2 px-3 pb-4">
              {VIEWS.map(({ value, label, icon: ViewIcon }) => (
                <button
                  key={value}
                  onClick={() => setView(value)}
                  title={label}
                  aria-label={label}
                  aria-pressed={view === value}
                  className={`flex h-11 flex-1 items-center justify-center rounded-[10px] border ${
                    view === value ? "border-primary bg-primary/15 text-primary" : "border-subtle text-muted hover:bg-hover"
                  }`}
                >
                  <ViewIcon className="h-5 w-5" />
                </button>
              ))}
            </div>
            <Drawer.Title className={viewer ? "px-3 pb-2 text-base font-medium" : "sr-only"}>Show</Drawer.Title>
            {viewer && filters}
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
