import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { media } from "@/lib/schema";

export async function GET(_request: Request, ctx: RouteContext<"/api/media/[id]">) {
  const { id } = await ctx.params;
  const row = db.select({ description: media.description }).from(media).where(eq(media.id, Number(id))).get();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(row);
}
