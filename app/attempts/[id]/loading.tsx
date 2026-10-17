export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="h-8 w-56 rounded-lg bg-canvas-deep motion-safe:animate-pulse" />
      <div className="mt-6 h-40 rounded-2xl bg-canvas-deep motion-safe:animate-pulse" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
