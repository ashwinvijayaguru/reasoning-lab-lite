import "server-only";
import { withTx } from "@/lib/db/pool";
import type { CategoryId, PublicPayload, PublicProblem } from "./types";

export interface FamilyCard {
  family_id: string;
  slug: string;
  title: string;
  summary: string;
  category: CategoryId;
  difficulty: "easy" | "moderate";
  est_minutes: number;
  variants: number;
}

/** Only these columns ever leave the server for a problem. Keys live in problem_keys. */
export const PUBLIC_COLUMNS = "id, family_id, slug, version, variant, category, difficulty, est_minutes, title, public_payload, provenance";

async function publishedVersions(): Promise<PublicProblem[]> {
  return withTx(async (c) => (await c.query<PublicProblem>(`select ${PUBLIC_COLUMNS} from problem_versions where status = 'published' order by family_id, version desc, variant`)).rows);
}

export async function listFamilies(): Promise<FamilyCard[]> {
  const byFamily = new Map<string, PublicProblem[]>();
  for (const r of await publishedVersions()) byFamily.set(r.family_id, [...(byFamily.get(r.family_id) ?? []), r]);
  const cards: FamilyCard[] = [];
  for (const [family_id, versions] of byFamily) {
    const latest = Math.max(...versions.map((v) => v.version));
    const current = versions.filter((v) => v.version === latest);
    const v = current[0];
    cards.push({ family_id, slug: v.slug, title: v.title, summary: (v.public_payload as PublicPayload).summary, category: v.category, difficulty: v.difficulty, est_minutes: v.est_minutes, variants: current.length });
  }
  const order: Record<string, number> = { logic: 0, debugging: 1, community: 2 };
  return cards.sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9) || a.est_minutes - b.est_minutes || a.title.localeCompare(b.title));
}

export async function familyBySlug(slug: string): Promise<FamilyCard | null> {
  return (await listFamilies()).find((f) => f.slug === slug) ?? null;
}

