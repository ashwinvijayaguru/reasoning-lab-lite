import { handle, json, readJson } from "@/lib/http";
import { requireParticipant } from "@/lib/auth/session";
import { addRevision, RevisionInputSchema } from "@/lib/attempts/service";

export const dynamic = "force-dynamic";

/** A post-reveal answer, stored separately; the first response is never overwritten. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const participant = await requireParticipant();
  const { id } = await ctx.params;
  const input = await readJson(req, RevisionInputSchema);
  const r = await addRevision(participant, id, input);
  return json({ revision_id: r.id, status: r.validation.status }, 201);
});
