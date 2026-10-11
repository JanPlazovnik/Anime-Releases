import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { cookies } from "next/headers";
import { io } from "next/cache";
import { inArray } from "drizzle-orm";
import { db, getSetting } from "@/lib/db";
import { airing, media } from "@/lib/schema";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site";
import { isSyncing } from "@/lib/sync";
import Calendar from "@/components/Calendar";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const image = { url: "/og", width: 1200, height: 630, alt: SITE_TITLE };
  return {
    metadataBase: new URL(process.env.APP_URL!),
    openGraph: {
      url: "/",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      type: "website",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: SITE_TITLE,
      description: SITE_DESCRIPTION,
      images: [image],
    },
  };
}

export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

async function Home() {
  await io();
  const lastSync = Number(getSetting("lastSync") ?? 0);
  const showAll = (await cookies()).get("show")?.value === "all";

  const airings = db
    .select({ id: airing.id, mediaId: airing.mediaId, episode: airing.episode, airingAt: airing.airingAt })
    .from(airing)
    .orderBy(airing.airingAt)
    .all();

  const shows = db
    .select({
      id: media.id,
      title: media.title,
      coverImage: media.coverImage,
      bannerImage: media.bannerImage,
      format: media.format,
      season: media.season,
      seasonYear: media.seasonYear,
      averageScore: media.averageScore,
      genres: media.genres,
      studio: media.studio,
      siteUrl: media.siteUrl,
      episodes: media.episodes,
    })
    .from(media)
    .where(inArray(media.id, db.select({ id: airing.mediaId }).from(airing)))
    .all();

  return (
    <Calendar
      airings={airings}
      shows={shows}
      clientId={process.env.ANILIST_CLIENT_ID!}
      initialShowAll={showAll}
      lastSync={lastSync}
      syncError={getSetting("syncError") ?? ""}
      serverSyncing={isSyncing() && !lastSync}
    />
  );
}
