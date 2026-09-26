import Link from "next/link";
import { MapPinOff } from "lucide-react";

/** Also the page behind notFound() for an unknown county slug.
 *
 * Without this file Next served its bare default: an empty shell, and a 200
 * rather than a 404, so search engines were free to index every mistyped
 * county as a real page. */
export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center px-4 py-10">
      <div className="max-w-md text-center">
        <MapPinOff className="mx-auto mb-4 h-10 w-10 text-muted" />
        <h1 className="mb-2 text-xl font-semibold text-foreground">
          That page isn&apos;t on the map
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          The link may be mistyped, or it may point to a county that
          doesn&apos;t exist. Kenya has 47.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-black hover:bg-brand-dim"
          >
            Back to the map
          </Link>
          <Link
            href="/counties"
            className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-raised"
          >
            Browse all counties
          </Link>
        </div>
      </div>
    </div>
  );
}
