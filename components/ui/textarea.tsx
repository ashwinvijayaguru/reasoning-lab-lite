import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-24 w-full rounded-xl border border-line-strong bg-paper px-3.5 py-3 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
