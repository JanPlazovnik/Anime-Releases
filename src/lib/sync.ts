import { eq, notInArray } from "drizzle-orm";
import { anilistQuery, AIRING_QUERY, LIST_QUERY } from "./anilist";
import { decrypt } from "./crypto";
import { db, setSetting } from "./db";
import { notifyChange, syncState } from "./events";
import { airing, listEntries, media, users } from "./schema";
import { pruneSessions } from "./session";

const DAY = 24 * 60 * 60;
const PAST_DAYS = 30;
const FUTURE_DAYS = 90;
const PAGES_PER_NOTIFY = 10;

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

type ListResponse = {
  MediaListCollection: {
    lists: { entries: { mediaId: number; status: string; progress: number }[] }[];
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
  pruneSessions();

  try {
    await syncAiring();
    setSetting("lastSync", String(Date.now()));
    setSetting("syncError", "");
  } catch (err) {
    setSetting("syncError", err instanceof Error ? err.message : String(err));
    console.error("Airing sync failed:", err);
  }

  for (const user of db.select({ id: users.id }).from(users).all()) {
    await syncList(user.id).catch((err) => console.error(`List sync failed for user ${user.id}:`, err));
  }
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
        };
        tx.insert(media)
          .values({ id: s.media.id, ...details })
          .onConflictDoUpdate({ target: media.id, set: details })
          .run();

        const row = { mediaId: s.media.id, episode: s.episode, airingAt: s.airingAt };
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

export async function syncList(userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return;

  const list = await anilistQuery<ListResponse>(LIST_QUERY, { userId }, decrypt(user.token));
  const entries = new Map<number, { status: string; progress: number }>();
  for (const l of list.MediaListCollection.lists) {
    for (const e of l.entries) entries.set(e.mediaId, e);
  }

  db.transaction((tx) => {
    tx.delete(listEntries).where(eq(listEntries.userId, userId)).run();
    for (const [mediaId, e] of entries) {
      tx.insert(listEntries).values({ userId, mediaId, listStatus: e.status, progress: e.progress }).run();
    }
  });
  notifyChange();
}
