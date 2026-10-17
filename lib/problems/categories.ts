/**
 * Category registry and adapter interface (safe for client import: no secrets).
 *
 * Adding a category = implementing a CategoryAdapter: an answer format the UI can
 * render, a deterministic validator engine, and rubric dimensions. Math, chess and
 * ethics are declared here as "coming soon" so the library can show them honestly
 * without any non-functional solve button.
 */
import type { CategoryId } from "./types";

export interface CategoryAdapter {
  id: CategoryId;
  label: string;
  blurb: string;
  status: "available" | "coming_soon";
  /** Validator engines this category uses (see lib/evaluation/validate.ts). */
  validatorEngines: ("rules" | "answer_key" | "numeric_tolerance" | "chess_legality" | "rubric_only")[];
  rubricDimensions: ("constraints" | "alternatives" | "assumptions" | "edge_cases" | "trade_offs")[];
  plannedNotes?: string;
}

export const CATEGORIES: CategoryAdapter[] = [
  {
    id: "logic",
    label: "Logic",
    blurb: "Scheduling and ordering puzzles with explicit rules. Every valid answer is accepted.",
    status: "available",
    validatorEngines: ["rules"],
    rubricDimensions: ["constraints", "alternatives", "assumptions"],
  },
  {
    id: "debugging",
    label: "Debugging",
    blurb: "Find the faulty line and choose a reviewed fix. No code you write is ever run.",
    status: "available",
    validatorEngines: ["answer_key"],
    rubricDimensions: ["constraints", "edge_cases", "alternatives", "assumptions"],
  },
  {
    id: "community",
    label: "Community planning",
    blurb: "Fictional venue, food-bank, volunteer and library decisions with real-world constraints.",
    status: "available",
    validatorEngines: ["rules"],
    rubricDimensions: ["constraints", "alternatives", "assumptions", "trade_offs"],
  },
  {
    id: "math",
    label: "Mathematics",
    blurb: "Pricing and rate problems checked with stated tolerances and units.",
    status: "coming_soon",
    validatorEngines: ["numeric_tolerance"],
    rubricDimensions: ["constraints", "assumptions", "edge_cases"],
    plannedNotes: "Needs a numeric validator with units and tolerances, and KaTeX rendering.",
  },
  {
    id: "chess",
    label: "Chess",
    blurb: "Tactical positions checked for legal moves and reviewed solution lines.",
    status: "coming_soon",
    validatorEngines: ["chess_legality"],
    rubricDimensions: ["alternatives", "edge_cases"],
    plannedNotes: "Needs chess.js legality checks and an accessible board; engine licensing reviewed separately.",
  },
  {
    id: "ethics",
    label: "Ethical dilemmas",
    blurb: "Open-ended allocation questions compared on stakeholders and trade-offs — no single moral winner.",
    status: "coming_soon",
    validatorEngines: ["rubric_only"],
    rubricDimensions: ["trade_offs", "assumptions", "constraints"],
    plannedNotes: "Needs reviewer calibration before any automated rubric is shown.",
  },
];

export function categoryById(id: string): CategoryAdapter | undefined {
  return CATEGORIES.find((c) => c.id === id);
}
