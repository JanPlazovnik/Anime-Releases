import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, ExternalLink, LogOut, Menu as MenuIcon, Settings } from "lucide-react";
import { episodeRange, formatTime, startOfDay, startOfWeek, type EpisodeGroup } from "@/lib/calendar";
import { SITE_NAME } from "@/lib/site";
import { Logo } from "../icons";
import Menu, { MenuItem } from "../Menu";
import EventDetails from "../EventDetails";
import { THEMES, useTheme, type Theme } from "../hooks";
import { Attribution, fadeClass, IconButton, ProgressBar, SignInButton, STATUSES, type LayoutProps, type OnSelect } from "../shared";
import MonthView from "./MonthView";
import Popover from "./Popover";
import { EpisodeLists, SidebarSection } from "./Sidebar";
import WeekView from "./WeekView";

const POPOVER_WIDTH = 448;
const LIST_POPOVER_WIDTH = 320;

export default function DesktopCalendar({
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
}: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [moreList, setMoreList] = useState<{ groups: EpisodeGroup[]; rect: DOMRect } | null>(null);
  const [selected, setSelected] = useState<{ id: number; rect: DOMRect; firstEpisode?: number } | null>(null);
  const [theme, changeTheme] = useTheme();

  const selectedEvent = selected && events.find((e) => e.id === selected.id);
  const onSelect: OnSelect = (event, rect, firstEpisode) => {
    setMoreList(null);
    setSelected({ id: event.id, rect, firstEpisode });
  };

  const showDay = (day: Date) => {
    setCursor(day);
    setView("week");
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 select-none items-center gap-1 px-2">
        <div className="flex w-[246px] shrink-0 items-center gap-1">
          <IconButton icon={MenuIcon} title="Main menu" onClick={() => setSidebarOpen(!sidebarOpen)} />
          <Logo className="ml-1 h-9 w-9 shrink-0" />
          <span className="ml-1.5 whitespace-nowrap text-lg text-muted">{SITE_NAME}</span>
        </div>
        <button
          onClick={() => setCursor(startOfDay(new Date()))}
          className="ml-2 mr-2 h-10 rounded-[10px] border border-subtle px-6 text-sm font-medium hover:bg-hover"
        >
          Today
        </button>
        <IconButton icon={ChevronLeft} title={view === "month" ? "Previous month" : "Previous week"} onClick={() => step(-1)} />
        <IconButton icon={ChevronRight} title={view === "month" ? "Next month" : "Next week"} onClick={() => step(1)} />
        <h1 className="ml-3 truncate text-[22px]">{title}</h1>

        <div className="ml-auto flex items-center gap-1">
          {syncButton}
          <Menu
            label="Settings"
            button={<Settings className="h-6 w-6" />}
            buttonClassName="flex h-10 w-10 items-center justify-center rounded-full text-muted hover:bg-hover"
          >
            {(close) => (
              <>
                <p className="px-4 pb-1 pt-1 text-xs font-medium text-muted">Theme</p>
                {(Object.keys(THEMES) as Theme[]).map((t) => (
                  <MenuItem
                    key={t}
                    onClick={() => {
                      changeTheme(t);
                      close();
                    }}
                  >
                    <Check className={`h-5 w-5 shrink-0 ${theme === t ? "" : "invisible"}`} />
                    {THEMES[t]}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
          <div className="mx-2 flex h-10 rounded-[10px] border border-subtle p-0.5 text-sm font-medium">
            {(["month", "week"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-lg px-4 ${view === v ? "bg-primary text-on-primary" : "hover:bg-hover"}`}
              >
                {v === "month" ? "Month" : "Week"}
              </button>
            ))}
          </div>
          {viewer ? (
            <Menu
              label={viewer.name}
              button={<img src={viewer.avatar} alt="" className="h-8 w-8 rounded-full" />}
              buttonClassName="flex h-12 w-12 items-center justify-center rounded-full hover:bg-hover"
            >
              {() => (
                <div className="w-64">
                  <div className="flex items-center gap-3 px-4 pb-3 pt-1">
                    <img src={viewer.avatar} alt="" className="h-10 w-10 shrink-0 rounded-[10px]" />
                    <p className="truncate text-sm font-medium">{viewer.name}</p>
                  </div>
                  <div className="border-t border-line pt-2">
                    <a
                      href={`https://anilist.co/user/${viewer.name}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-hover"
                    >
                      <ExternalLink className="h-5 w-5 shrink-0 text-muted" />
                      View AniList profile
                    </a>
                    <button
                      onClick={signOut}
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-hover"
                    >
                      <LogOut className="h-5 w-5 shrink-0 text-muted" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </Menu>
          ) : (
            <SignInButton clientId={clientId} />
          )}
        </div>
      </header>
      <ProgressBar busy={busy} />

      <div className="flex min-h-0 flex-1">
        <aside
          className={`shrink-0 select-none overflow-hidden transition-[width] duration-200 ${sidebarOpen ? "w-64" : "w-0"}`}
        >
          <div className="flex h-full w-64 flex-col gap-4 overflow-y-auto px-3 pb-4 pt-2">
            {viewer && <SidebarSection title="Show">{filters}</SidebarSection>}
            <EpisodeLists events={events} signedIn={viewer !== null} onSelect={onSelect} />
            <div className="mt-auto pt-4">
              <Attribution />
            </div>
          </div>
        </aside>

        <main
          className={`mb-4 mr-4 flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-surface ${
            sidebarOpen ? "ml-0" : "ml-4"
          }`}
        >
          {view === "month" ? (
            <MonthView cursor={cursor} byDay={byDay} onSelect={onSelect} onShowDay={showDay} />
          ) : (
            <WeekView
              weekStart={startOfWeek(cursor)}
              byDay={byDay}
              onSelect={onSelect}
              onShowMore={(groups, rect) => setMoreList({ groups, rect })}
            />
          )}
        </main>
      </div>

      {moreList && (
        <Popover anchor={moreList.rect} width={LIST_POPOVER_WIDTH} onClose={() => setMoreList(null)}>
          {() => (
            <div className="overflow-y-auto py-2">
              {moreList.groups.map(({ event, firstEpisode }) => (
                <button
                  key={event.id}
                  onClick={(e) => onSelect(event, e.currentTarget.getBoundingClientRect(), firstEpisode)}
                  className={`flex w-full items-center gap-2 px-4 py-1.5 text-left text-sm hover:bg-hover ${fadeClass(event)}`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${STATUSES[event.listStatus ?? ""]?.dot ?? "bg-other"}`} />
                  <span className="shrink-0 text-muted">{formatTime(event.airingAt)}</span>
                  <span className="truncate">
                    {event.title}, Ep {episodeRange(firstEpisode, event.episode)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Popover>
      )}

      {selected && selectedEvent && (
        <Popover key={selected.id} anchor={selected.rect} width={POPOVER_WIDTH} onClose={() => setSelected(null)}>
          {(close) => (
            <EventDetails
              event={selectedEvent}
              firstEpisode={selected.firstEpisode ?? selectedEvent.episode}
              close={close}
            />
          )}
        </Popover>
      )}
    </div>
  );
}
