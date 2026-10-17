import { handle, json } from "@/lib/http";
import { endSession, requireParticipant } from "@/lib/auth/session";
import { deleteAllData } from "@/lib/privacy/service";

export const dynamic = "force-dynamic";

/** Delete everything tied to this guest identity, then end the session. */
export const DELETE = handle(async () => {
  const participant = await requireParticipant();
  await deleteAllData(participant);
  await endSession();
  return json({ deleted: true });
});
