import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
      <h1 className="text-3xl font-semibold text-ink">Not found</h1>
      <p className="mt-3 text-ink-soft">That page doesn’t exist, or it belongs to a different guest session.</p>
      <Button asChild className="mt-6"><Link href="/challenges">Browse challenges</Link></Button>
    </div>
  );
}
