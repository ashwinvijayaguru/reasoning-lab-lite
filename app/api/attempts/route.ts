import { z } from "zod";
import { handle, json, readJson } from "@/lib/http";
import { requireParticipant } from "@/lib/auth/session";
import { createAttempt } from "@/lib/attempts/service";

export const dynamic = "force-dynamic";

const Body = z.object({ family_slug: z.string().regex(/^[a-z0-9-]{1,80}$/) });

/** Assign a problem version, study arm, and exposure flag — all decided by the server. */
export const POST = handle(async (req: Request) => {
  const participant = await requireParticipant();
  const { family_slug } = await readJson(req, Body);
  const attempt = await createAttempt(participant, family_slug);
  return json({ attempt_id: attempt.id, resumed: attempt.resumed }, attempt.resumed ? 200 : 201);
});
