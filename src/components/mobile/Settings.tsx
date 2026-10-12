import type { ReactNode } from "react";
import { Check, ChevronRight, ExternalLink, LogOut } from "lucide-react";
import type { Viewer } from "@/lib/anilist-browser";
import { THEMES, useTheme, type Theme } from "../hooks";
import { Attribution, SignInButton } from "../shared";
import { NAV_CLEARANCE } from "./shared";

export default function Settings({
  viewer,
  clientId,
  signOut,
  syncButton,
  listStatus,
  scheduleStatus,
}: {
  viewer: Viewer | null;
  clientId: string;
  signOut: () => void;
  syncButton: ReactNode;
  listStatus: string | null;
  scheduleStatus: string;
}) {
  const [theme, changeTheme] = useTheme();

  return (
    <div className={`flex flex-1 flex-col gap-5 overflow-y-auto px-3 pt-2 ${NAV_CLEARANCE}`}>
      {viewer ? (
        <section className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          <div className="flex items-center gap-3 p-4">
            <img src={viewer.avatar} alt="" className="h-14 w-14 shrink-0 rounded-xl" />
            <p className="truncate text-base font-medium">{viewer.name}</p>
          </div>
          <a
            href={`https://anilist.co/user/${viewer.name}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 border-t border-line px-4 py-3 text-sm hover:bg-hover"
          >
            <ExternalLink className="h-5 w-5 shrink-0 text-muted" />
            View AniList profile
            <ChevronRight className="ml-auto h-4 w-4 text-subtle" />
          </a>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left text-sm text-red-500 hover:bg-hover"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            Sign out
          </button>
        </section>
      ) : (
        <section className="flex justify-center rounded-2xl bg-surface p-4 ring-1 ring-line">
          <SignInButton clientId={clientId} />
        </section>
      )}
      <section>
        <p className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted">Theme</p>
        <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
          {(Object.keys(THEMES) as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => changeTheme(t)}
              className="flex w-full items-center border-t border-line px-4 py-3 text-left text-sm first:border-t-0 hover:bg-hover"
            >
              {THEMES[t]}
              {theme === t && <Check className="ml-auto h-5 w-5 text-primary" />}
            </button>
          ))}
        </div>
      </section>
      {viewer && (
        <section className="flex items-center gap-2 rounded-2xl bg-surface p-2 pr-4 ring-1 ring-line">
          {syncButton}
          <div className="min-w-0 text-xs leading-5 text-muted">
            <p className="truncate">{listStatus}</p>
            <p className="truncate">{scheduleStatus}</p>
          </div>
        </section>
      )}
      <div className="flex justify-center pt-2 text-center [&>p]:items-center">
        <Attribution />
      </div>
    </div>
  );
}
