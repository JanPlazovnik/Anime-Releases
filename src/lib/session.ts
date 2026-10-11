import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, lt, notInArray, or } from "drizzle-orm";
import { hash } from "./crypto";
import { db } from "./db";
import { listEntries, sessions, users } from "./schema";

const COOKIE = "session";
const SESSION_MS = 90 * 24 * 60 * 60 * 1000;

export async function getCurrentUser() {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;
  return (
    db
      .select({ id: users.id, name: users.name, avatar: users.avatar })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, hash(id)), gt(sessions.expiresAt, Date.now())))
      .get() ?? null
  );
}

export async function createSession(userId: number, tokenExpiresAt: number) {
  const id = randomBytes(32).toString("hex");
  const expiresAt = Math.min(Date.now() + SESSION_MS, tokenExpiresAt);
  db.insert(sessions).values({ id: hash(id), userId, expiresAt }).run();
  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL!.startsWith("https"),
    expires: new Date(expiresAt),
  });
}

export async function destroySession() {
  const store = await cookies();
  const id = store.get(COOKIE)?.value;
  if (id) db.delete(sessions).where(eq(sessions.id, hash(id))).run();
  store.delete(COOKIE);
  pruneSessions();
}

export function pruneSessions() {
  const now = Date.now();
  db.transaction((tx) => {
    tx.delete(sessions).where(lt(sessions.expiresAt, now)).run();
    tx.delete(users)
      .where(
        or(
          lt(users.tokenExpiresAt, now),
          notInArray(users.id, tx.select({ id: sessions.userId }).from(sessions)),
        ),
      )
      .run();
    tx.delete(listEntries)
      .where(notInArray(listEntries.userId, tx.select({ id: users.id }).from(users)))
      .run();
  });
}
