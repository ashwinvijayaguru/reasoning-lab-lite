import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5", {
  variants: {
    variant: {
      neutral: "border-line bg-canvas-deep text-ink-soft",
      human: "border-human/30 bg-human-soft text-human-ink",
      ai: "border-ai/30 bg-ai-soft text-ai-ink",
      ok: "border-ok/30 bg-ok-soft text-ok",
      bad: "border-bad/30 bg-bad-soft text-bad",
      warn: "border-warn/30 bg-warn-soft text-warn",
      outline: "border-line-strong text-ink",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
