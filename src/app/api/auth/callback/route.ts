import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { anilistQuery, VIEWER_QUERY } from "@/lib/anilist";
import { encrypt } from "@/lib/crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { createSession } from "@/lib/session";
import { syncList } from "@/lib/sync";

type ViewerResponse = {
  Viewer: { id: number; name: string; avatar: { medium: string } };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("oauth_state")?.value;
  cookieStore.delete("oauth_state");

  if (!code || !expectedState || url.searchParams.get("state") !== expectedState) {
    return new Response("Invalid OAuth callback", { status: 400 });
  }

  const res = await fetch("https://anilist.co/api/v2/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: process.env.ANILIST_CLIENT_ID,
      client_secret: process.env.ANILIST_CLIENT_SECRET,
      redirect_uri: `${process.env.APP_URL}/api/auth/callback`,
      code,
    }),
  });
  if (!res.ok) {
    return new Response(`Token exchange failed: ${await res.text()}`, { status: 502 });
  }
  const { access_token, expires_in } = await res.json();

  const { Viewer } = await anilistQuery<ViewerResponse>(VIEWER_QUERY, {}, access_token);
  const tokenExpiresAt = Date.now() + expires_in * 1000;
  const user = {
    name: Viewer.name,
    avatar: Viewer.avatar.medium,
    token: encrypt(access_token),
    tokenExpiresAt,
  };
  db.insert(users)
    .values({ id: Viewer.id, ...user })
    .onConflictDoUpdate({ target: users.id, set: user })
    .run();
  await createSession(Viewer.id, tokenExpiresAt);

  await syncList(Viewer.id).catch((err) => console.error("List sync failed:", err));
  redirect("/");
}
