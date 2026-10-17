import { Bug, Crown, Puzzle, Scale, Sigma, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = { logic: Puzzle, debugging: Bug, community: Users, math: Sigma, chess: Crown, ethics: Scale } as const;

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const Icon = ICONS[category as keyof typeof ICONS] ?? Puzzle;
  return (
    <span aria-hidden className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-canvas text-ink", className)}>
      <Icon className="size-5" strokeWidth={1.75} />
    </span>
  );
}
