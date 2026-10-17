import { handle, json, readJson } from "@/lib/http";
import { requireParticipant } from "@/lib/auth/session";
import { SubmitInputSchema, submitFirstResponse } from "@/lib/attempts/service";

export const dynamic = "force-dynamic";

/** Lock the first response atomically, then evaluate it (deterministic, runs in-process). */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const participant = await requireParticipant();
  const { id } = await ctx.params;
  const input = await readJson(req, SubmitInputSchema);
  const res = await submitFirstResponse(participant, id, input);
  return json({ locked: true, replayed: res.replayed }, res.replayed ? 200 : 201);
});
