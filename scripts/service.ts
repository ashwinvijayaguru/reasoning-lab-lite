import "server-only";
/** "My activity" and the delete-everything control. */
import { withTx } from "@/lib/db/pool";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";

/** Deletes the participant; every attempt, response, evaluation, revision and feedback row cascades. */
export async function deleteAllData(participantId: string) {
  await withTx((c) => c.query(`delete from participants where id = $1`, [participantId]));
  log.info("participant_deleted", {});
}

export interface ActivityView {
  pseudonym: string;
  created_at: string;
  attempts: { id: string; title: string; category: string; state: string; exposure: string; started_at: string; human_status: string | null; reference_status: string | null }[];
}

export async function getActivity(participantId: string): Promise<ActivityView> {
  return withTx(async (c) => {
    const p = await c.query(`select pseudonym, created_at from participants where id = $1`, [participantId]);
    if (!p.rowCount) throw new AppError(401, "no_session", "Please start a guest session first.");
    const attempts = await c.query(
      `select a.id, pv.title, pv.category, a.state, a.exposure, a.started_at,
              e.human_validation->>'status' as human_status, e.reference_validation->>'status' as reference_status
         from attempts a
         join problem_versions pv on pv.id = a.problem_version_id
         left join evaluations e on e.attempt_id = a.id
        where a.participant_id = $1
        order by a.started_at desc limit 100`,
      [participantId],
    );
    return { pseudonym: p.rows[0].pseudonym, created_at: p.rows[0].created_at, attempts: attempts.rows };
  });
}
