import { handle, json, readJson } from "@/lib/http";
import { requireParticipant } from "@/lib/auth/session";
import { addFeedback, FeedbackInputSchema } from "@/lib/attempts/service";

export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const participant = await requireParticipant();
  const { id } = await ctx.params;
  const input = await readJson(req, FeedbackInputSchema);
  const r = await addFeedback(participant, id, input);
  return json({ feedback_id: r.id }, 201);
});
