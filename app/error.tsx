"use client";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-3xl font-semibold text-ink">Something went wrong</h1>
      <p className="mt-3 text-ink-soft">Anything you already submitted is saved. Drafts stay on this device.</p>
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </div>
  );
}
