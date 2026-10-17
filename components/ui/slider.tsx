"use client";
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

export const Slider = React.forwardRef<React.ElementRef<typeof SliderPrimitive.Root>, React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> & { thumbLabel: string; valueText?: string }>(
  ({ className, thumbLabel, valueText, ...props }, ref) => (
    <SliderPrimitive.Root ref={ref} className={cn("relative flex w-full touch-none select-none items-center py-2", className)} {...props}>
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-canvas-deep">
        <SliderPrimitive.Range className="absolute h-full bg-human" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={thumbLabel}
        aria-valuetext={valueText}
        className="block size-6 rounded-full border-2 border-human bg-paper shadow focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus"
      />
    </SliderPrimitive.Root>
  ),
);
Slider.displayName = "Slider";
