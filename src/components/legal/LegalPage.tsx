import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/constants";
import { POLICIES_UPDATED } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/** The Privacy Policy and Terms of Use share one layout: a short summary up
 * top, a contents list, then numbered sections a reader can link to. */
export function LegalPage({
  eyebrow,
  title,
  summary,
  sections,
  other,
}: {
  eyebrow: string;
  title: string;
  summary: React.ReactNode;
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <article className="mx-auto max-w-3xl pb-16">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">{eyebrow}</p>
        <h1 className="mb-2 text-2xl font-semibold text-foreground sm:text-3xl">{title}</h1>
        <p className="mb-6 font-mono text-xs text-muted">Last updated {POLICIES_UPDATED}</p>

        <div className="mb-8 rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed text-muted sm:p-5">
          {summary}
        </div>

        <nav aria-label="Contents" className="mb-10">
          <p className="mb-2 text-xs font-medium text-muted">Contents</p>
          <ol className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted transition-colors hover:text-foreground">
                  <span className="mr-2 font-mono text-xs text-muted/70">{String(i + 1).padStart(2, "0")}</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-10">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-6">
              <h2 className="mb-3 text-lg font-semibold text-foreground">
                <span className="mr-2 font-mono text-sm text-muted/70">{String(i + 1).padStart(2, "0")}</span>
                {s.title}
              </h2>
              <div className="space-y-3 text-sm leading-relaxed text-muted [&_a]:text-brand [&_a:hover]:underline [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted">
          <span>
            Questions: <Mail />
          </span>
          <Link href={other.href} className="text-brand hover:underline">
            {other.label} →
          </Link>
        </footer>
      </article>
    </div>
  );
}

/** The contact address as a link, for use inside section text. */
export function Mail({ subject }: { subject?: string }) {
  const href = `mailto:${CONTACT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
  return (
    <a href={href} className="text-brand hover:underline">
      {CONTACT_EMAIL}
    </a>
  );
}
