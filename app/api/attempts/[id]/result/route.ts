import { handle, json } from "@/lib/http";
import { requireParticipant } from "@/lib/auth/session";
import { getResult } from "@/lib/attempts/service";

export const dynamic = "force-dynamic";

/** 409 before lock (no protected content); afterwards the owner's result or its pending status. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const participant = await requireParticipant();
  const { id } = await ctx.params;
  return json(await getResult(participant, id));
});
