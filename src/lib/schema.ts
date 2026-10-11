import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const media = sqliteTable("media", {
  id: integer("id").primaryKey(),
  title: text("title").notNull(),
  coverImage: text("cover_image"),
  bannerImage: text("banner_image"),
  description: text("description"),
  format: text("format"),
  season: text("season"),
  seasonYear: integer("season_year"),
  averageScore: integer("average_score"),
  genres: text("genres", { mode: "json" }).$type<string[]>().notNull(),
  studio: text("studio"),
  siteUrl: text("site_url").notNull(),
  episodes: integer("episodes"),
  fetchedAt: integer("fetched_at").notNull(),
});

export const airing = sqliteTable("airing", {
  id: integer("id").primaryKey(),
  mediaId: integer("media_id").notNull(),
  episode: integer("episode").notNull(),
  airingAt: integer("airing_at").notNull(),
  fetchedAt: integer("fetched_at").notNull(),
});
