import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
});

export const airing = sqliteTable("airing", {
  id: integer("id").primaryKey(),
  mediaId: integer("media_id").notNull(),
  episode: integer("episode").notNull(),
  airingAt: integer("airing_at").notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull(),
  token: text("token").notNull(),
  tokenExpiresAt: integer("token_expires_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const listEntries = sqliteTable(
  "list_entries",
  {
    userId: integer("user_id").notNull(),
    mediaId: integer("media_id").notNull(),
    listStatus: text("list_status").notNull(),
    progress: integer("progress").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.mediaId] })],
);
