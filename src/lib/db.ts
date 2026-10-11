import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import * as schema from "./schema";

const dbPath = process.env.DATABASE_PATH ?? "data/anime.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
if ((sqlite.pragma("user_version", { simple: true }) as number) < 3) {
  // everything stored before version 3 was single-user and is rebuilt by the next sync
  sqlite.exec(`
    DROP TABLE IF EXISTS settings;
    DROP TABLE IF EXISTS media;
    DROP TABLE IF EXISTS airing;
    DROP TABLE IF EXISTS list_entries;
  `);
  sqlite.pragma("user_version = 3");
}
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS media (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    cover_image TEXT,
    banner_image TEXT,
    description TEXT,
    format TEXT,
    season TEXT,
    season_year INTEGER,
    average_score INTEGER,
    genres TEXT NOT NULL,
    studio TEXT,
    site_url TEXT NOT NULL,
    episodes INTEGER
  );
  CREATE TABLE IF NOT EXISTS airing (
    id INTEGER PRIMARY KEY,
    media_id INTEGER NOT NULL,
    episode INTEGER NOT NULL,
    airing_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS airing_airing_at ON airing (airing_at);
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL,
    token TEXT NOT NULL,
    token_expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS list_entries (
    user_id INTEGER NOT NULL,
    media_id INTEGER NOT NULL,
    list_status TEXT NOT NULL,
    progress INTEGER NOT NULL,
    PRIMARY KEY (user_id, media_id)
  );
`);

export const db = drizzle(sqlite, { schema });

export function getSetting(key: string) {
  return db.select().from(schema.settings).where(eq(schema.settings.key, key)).get()?.value;
}

export function setSetting(key: string, value: string) {
  db.insert(schema.settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
    .run();
}
