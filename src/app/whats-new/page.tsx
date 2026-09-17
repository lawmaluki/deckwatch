import type { Metadata } from "next";
import { MessageSquarePlus } from "lucide-react";
import {
  CHANGELOG,
  CHANGE_KIND_COLOR,
  CHANGE_KIND_LABEL,
  type ChangelogEntry,
} from "@/lib/data/changelog";
import { ChangelogNav, type NavGroup } from "@/components/changelog/ChangelogNav";

export const metadata: Metadata = {
  title: "What's new — Deckwatch Kenya",
  description: "New features, improvements and fixes shipping to Deckwatch Kenya.",
};

const FEATURE_REQUEST_URL = "https://github.com/lawmaluki/deckwatch/issues/new";

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`)
    .toLocaleDateString("en-GB", {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    .toUpperCase();
}

function groupByDate(entries: ChangelogEntry[]) {
  const groups: { date: string; label: string; entries: ChangelogEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.date === entry.date) last.entries.push(entry);
    else groups.push({ date: entry.date, label: formatDate(entry.date), entries: [entry] });
  }
  return groups;
}

export default function WhatsNewPage() {
  const groups = groupByDate(CHANGELOG);
  const navGroups: NavGroup[] = groups.map((g) => ({
    date: g.date,
    label: g.label,
    entries: g.entries.map((e) => ({ id: slugify(e.title), title: e.title })),
  }));

  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Eyebrow, heading and lede match /why and /api-docs exactly, so the
            three read as one publication rather than three. */}
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
              Release notes
            </p>
            <h1 className="mb-4 text-2xl font-semibold text-foreground sm:text-3xl">
              What&rsquo;s new
            </h1>
            <p className="text-sm leading-relaxed text-muted sm:text-base">
              New features, improvements and fixes shipping to Deckwatch Kenya.
            </p>
          </div>
          <a
            href={FEATURE_REQUEST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground/90 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            Request a feature
          </a>
        </div>

        <div className="gap-10 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-4">
              <ChangelogNav groups={navGroups} />
            </div>
          </aside>

          <div className="space-y-10">
            {groups.map((group) => (
              <section key={group.date}>
                <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-muted/70">
                  {group.label}
                </p>

                <div className="space-y-7 border-t border-border pt-6">
                  {group.entries.map((entry) => (
                    <article
                      key={entry.title}
                      id={slugify(entry.title)}
                      // Clears the sticky header when jumped to from the rail.
                      className="scroll-mt-20"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-1.5">
                        <Tag color={CHANGE_KIND_COLOR[entry.kind]}>
                          {CHANGE_KIND_LABEL[entry.kind]}
                        </Tag>
                        {entry.area && <Tag>{entry.area.toUpperCase()}</Tag>}
                      </div>

                      <h2 className="mb-1 text-sm font-semibold text-foreground">
                        {entry.title}
                      </h2>
                      <p className="max-w-2xl text-sm leading-relaxed text-muted">
                        {entry.body}
                      </p>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tag({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide"
      style={{
        color: color ?? "var(--muted)",
        borderColor: color ? `${color}55` : "var(--border)",
      }}
    >
      {children}
    </span>
  );
}
