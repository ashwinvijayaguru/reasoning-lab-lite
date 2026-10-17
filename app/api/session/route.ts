import { z } from "zod";
import { clientIp, handle, json, readJson } from "@/lib/http";
import { allowGuestCreation, currentParticipantId, startGuestSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const Body = z.object({ accept_notice: z.literal(true) });

/** Start a pseudonymous guest session after the participant accepts the data notice. */
export const POST = handle(async (req: Request) => {
  if (await currentParticipantId()) return json({ participant: "existing" });
  await readJson(req, Body);
  if (!allowGuestCreation(clientIp(req))) throw new AppError(429, "rate_limited", "Too many new sessions from this network. Please try again later.");
  await startGuestSession();
  return json({ participant: "created" }, 201);
});

export const GET = handle(async () => json({ signed_in: !!(await currentParticipantId()) }));
