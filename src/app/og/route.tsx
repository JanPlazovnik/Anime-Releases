import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { and, desc, eq, gte, isNotNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { airing, media } from "@/lib/schema";
import { SITE_NAME } from "@/lib/site";

const WIDTH = 1200;
const HEIGHT = 630;
const POSTER_COUNT = 27;
const POSTER_WIDTH = 170;
const POSTER_HEIGHT = 255;
const POSTER_GAP = 16;
const POSTERS_PER_ROW = 9;
const WINDOW_SECONDS = 7 * 24 * 60 * 60;
const CACHE_MS = 6 * 60 * 60 * 1000;

let cached: { png: ArrayBuffer; createdAt: number } | null = null;

async function loadPoster(url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "image/jpeg";
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

async function render() {
  const now = Math.floor(Date.now() / 1000);
  const shows = db
    .selectDistinct({ id: media.id, coverImage: media.coverImage, averageScore: media.averageScore })
    .from(airing)
    .innerJoin(media, eq(airing.mediaId, media.id))
    .where(
      and(
        gte(airing.airingAt, now - WINDOW_SECONDS),
        lt(airing.airingAt, now + WINDOW_SECONDS),
        isNotNull(media.coverImage),
      ),
    )
    .orderBy(desc(media.averageScore))
    .limit(POSTER_COUNT)
    .all();

  const posters = (await Promise.all(shows.map((show) => loadPoster(show.coverImage!)))).filter(
    (poster) => poster !== null,
  );

  const image = new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#10151c" }}>
        <div
          style={{
            position: "absolute",
            top: -140,
            left: -60,
            width: POSTERS_PER_ROW * (POSTER_WIDTH + POSTER_GAP),
            display: "flex",
            flexWrap: "wrap",
            gap: POSTER_GAP,
            transform: "rotate(-8deg)",
          }}
        >
          {posters.map((src, i) => (
            <img
              key={i}
              src={src}
              alt=""
              width={POSTER_WIDTH}
              height={POSTER_HEIGHT}
              style={{ borderRadius: 14, objectFit: "cover" }}
            />
          ))}
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: WIDTH,
            height: HEIGHT,
            display: "flex",
            backgroundImage:
              "linear-gradient(to top, #10151c 0%, #10151c 22%, rgba(16, 21, 28, 0.75) 45%, rgba(16, 21, 28, 0) 75%)",
          }}
        />
        <div style={{ position: "absolute", left: 56, bottom: 52, display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="96" height="96" viewBox="0 0 36 36">
            <rect width="36" height="36" rx="10" fill="#3db4f2" />
            <g fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="11" width="18" height="16" rx="3" />
              <path d="M14 8.5V13M22 8.5V13" />
            </g>
            <path d="M15.5 15.5 22 19l-6.5 3.5z" fill="#fff" stroke="#fff" strokeWidth="1" strokeLinejoin="round" />
          </svg>
          <div style={{ fontSize: 68, color: "#e3e7ec", letterSpacing: -1 }}>{SITE_NAME}</div>
        </div>
      </div>
    ),
    { width: WIDTH, height: HEIGHT },
  );
  return image.arrayBuffer();
}

export async function GET() {
  await connection();

  if (!cached || Date.now() - cached.createdAt > CACHE_MS) {
    cached = { png: await render(), createdAt: Date.now() };
  }
  return new Response(cached.png, {
    headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
  });
}
