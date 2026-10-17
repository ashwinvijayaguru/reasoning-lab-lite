import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-bold transition-[background-color,box-shadow,transform] active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-ink text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.35)] hover:bg-ink-soft",
        human: "bg-human text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.3)] hover:bg-human-ink",
        outline: "border border-line-strong bg-paper text-ink shadow-[inset_0_-2px_0_var(--color-line)] hover:border-ink-muted",
        ghost: "text-ink hover:bg-canvas-deep",
        danger: "bg-bad text-white shadow-[inset_0_-3px_0_rgb(0_0_0/0.3)] hover:bg-bad/90",
        link: "text-ink underline underline-offset-4 hover:text-human rounded-sm",
      },
      size: { default: "h-11 px-5", sm: "h-9 px-4 text-[13px]", lg: "h-12 px-7 text-base", icon: "size-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
export { buttonVariants };
