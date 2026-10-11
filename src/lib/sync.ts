import * as Sentry from "@sentry/nextjs";
import { lt, notInArray, or } from "drizzle-orm";
import { anilistQuery, AIRING_QUERY } from "./anilist";
import { db, setSetting } from "./db";
import { notifyChange, syncState } from "./events";
import { airing, media } from "./schema";

const DAY = 24 * 60 * 60;
const PAST_DAYS = 30;
const FUTURE_DAYS = 90;
const PAGES_PER_NOTIFY = 10;
const CACHE_TTL_MS = 7 * DAY * 1000;

type AiringResponse = {
  Page: {
    pageInfo: { hasNextPage: boolean };
    airingSchedules: {
      id: number;
      episode: number;
      airingAt: number;
      media: {
        id: number;
        siteUrl: string;
        episodes: number | null;
        title: { english: string | null; romaji: string };
        coverImage: { large: string | null };
        bannerImage: string | null;
        description: string | null;
        format: string | null;
        season: string | null;
        seasonYear: number | null;
        averageScore: number | null;
        genres: string[];
        studios: { nodes: { name: string }[] };
      };
    }[];
  };
};

export function isSyncing() {
  return Boolean(syncState.syncRunning);
}

export function syncAll() {
  if (!syncState.syncRunning) {
    syncState.syncRunning = runSync().finally(() => {
      syncState.syncRunning = null;
      notifyChange();
    });
    notifyChange();
  }
  return syncState.syncRunning;
}

async function runSync() {
  try {
    await syncAiring();
    setSetting("lastSync", String(Date.now()));
    setSetting("syncError", "");
  } catch (err) {
    setSetting("syncError", err instanceof Error ? err.message : String(err));
    console.error("Airing sync failed:", err);
    Sentry.captureException(err);
  } finally {
    pruneCache();
  }
}

function pruneCache() {
  const cutoff = Date.now() - CACHE_TTL_MS;
  const windowStart = Math.floor(Date.now() / 1000) - PAST_DAYS * DAY;
  db.transaction((tx) => {
    tx.delete(airing).where(or(lt(airing.fetchedAt, cutoff), lt(airing.airingAt, windowStart))).run();
    tx.delete(media)
      .where(or(lt(media.fetchedAt, cutoff), notInArray(media.id, tx.select({ id: airing.mediaId }).from(airing))))
      .run();
  });
}

async function syncAiring() {
  const now = Math.floor(Date.now() / 1000);
  const seen: number[] = [];

  for (let page = 1; ; page++) {
    const data = await anilistQuery<AiringResponse>(AIRING_QUERY, {
      page,
      from: now - PAST_DAYS * DAY,
      to: now + FUTURE_DAYS * DAY,
    });

    db.transaction((tx) => {
      for (const s of data.Page.airingSchedules) {
        const details = {
          title: s.media.title.english ?? s.media.title.romaji,
          coverImage: s.media.coverImage.large,
          bannerImage: s.media.bannerImage,
          description: s.media.description,
          format: s.media.format,
          season: s.media.season,
          seasonYear: s.media.seasonYear,
          averageScore: s.media.averageScore,
          genres: s.media.genres,
          studio: s.media.studios.nodes[0]?.name ?? null,
          siteUrl: s.media.siteUrl,
          episodes: s.media.episodes,
          fetchedAt: Date.now(),
        };
        tx.insert(media)
          .values({ id: s.media.id, ...details })
          .onConflictDoUpdate({ target: media.id, set: details })
          .run();

        const row = { mediaId: s.media.id, episode: s.episode, airingAt: s.airingAt, fetchedAt: Date.now() };
        tx.insert(airing)
          .values({ id: s.id, ...row })
          .onConflictDoUpdate({ target: airing.id, set: row })
          .run();
        seen.push(s.id);
      }
    });

    if (page % PAGES_PER_NOTIFY === 0) notifyChange();
    if (!data.Page.pageInfo.hasNextPage) break;
  }

  db.delete(airing).where(notInArray(airing.id, seen)).run();
}
