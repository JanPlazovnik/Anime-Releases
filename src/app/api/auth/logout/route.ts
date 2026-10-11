import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  return Response.redirect(`${process.env.APP_URL}/`, 303);
}
