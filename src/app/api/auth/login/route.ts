import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.APP_URL!.startsWith("https"),
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: process.env.ANILIST_CLIENT_ID!,
    redirect_uri: `${process.env.APP_URL}/api/auth/callback`,
    response_type: "code",
    state,
  });
  redirect(`https://anilist.co/api/v2/oauth/authorize?${params}`);
}
