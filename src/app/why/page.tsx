import type { Metadata } from "next";
import {
  AlertTriangle,
  MapPinned,
  ShieldCheck,
  Radio,
  Users,
  TrendingUp,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Why Deckwatch Kenya",
  description: "Why Deckwatch Kenya exists and the problem it's built to solve.",
};

const PILLARS = [
  {
    icon: Radio,
    title: "One place, not a dozen tabs",
    body: "During a fast-moving incident, information is scattered across TV tickers, WhatsApp forwards, X threads, and county statements — often contradicting each other. Deckwatch is built to pull that into a single live map instead of a scavenger hunt.",
  },
  {
    icon: ShieldCheck,
    title: "Verification before virality",
    body: "Unverified reports spread fastest. Every incident carries a verification status and score based on source count and type, so you can tell a confirmed police report apart from a single unconfirmed post.",
  },
  {
    icon: MapPinned,
    title: "Where, not just what",
    body: "A headline tells you something happened. A map tells you whether it's on your route, near your home, or in the county you're about to travel through.",
  },
  {
    icon: TrendingUp,
    title: "Patterns, not just incidents",
    body: "A single accident is a data point. Ten accidents on the same stretch of road this month is a pattern worth knowing before you drive it. County risk scores and trend charts exist to surface that.",
  },
  {
    icon: Users,
    title: "Built on citizen reports, with guardrails",
    body: "Communities usually know what's happening before institutions confirm it. Citizen reporting is core to the model — paired with moderation and verification, so it strengthens the picture instead of adding noise.",
  },
];

export default function WhyDeckwatchPage() {
  return (
    <div className="h-full overflow-y-auto px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">
          Our reason for building this
        </p>
        <h1 className="mb-4 text-2xl font-semibold text-foreground sm:text-3xl">
          Why Deckwatch Kenya
        </h1>
        <p className="mb-10 text-sm leading-relaxed text-muted sm:text-base">
          Kenyans checking whether it&apos;s safe to travel, commute, or attend an
          event today mostly rely on scattered news alerts, group chats, and word
          of mouth. Deckwatch exists to replace that guesswork with a single,
          verifiable, map-first view of what&apos;s actually happening — and
          where.
        </p>

        <div className="mb-10 space-y-5">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="flex gap-4 rounded-2xl border border-border bg-surface p-4 sm:p-5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <pillar.icon className="h-[18px] w-[18px]" />
              </div>
              <div>
                <h2 className="mb-1 text-sm font-semibold text-foreground">
                  {pillar.title}
                </h2>
                <p className="text-sm leading-relaxed text-muted">{pillar.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-medium" />
            Current status
          </h2>
          <p className="mb-3 text-sm leading-relaxed text-muted">
            Live news ingestion is running. Deckwatch reads 13 Kenyan newsrooms
            every 15 minutes, classifies what it finds, locates it, and puts it
            on the map. Incidents marked{" "}
            <span className="font-medium text-brand">LIVE</span> are real
            reporting, gathered automatically.
          </p>
          <p className="mb-3 text-sm leading-relaxed text-muted">
            A seeded sample dataset still sits alongside it, so the map has
            something to show while coverage grows. The map hides it by default,
            and that LIVE badge is what separates the two.
          </p>
          <p className="mb-3 text-sm leading-relaxed text-muted">
            Confidence measures corroboration, not truth. An event carried by
            several genuinely independent newsrooms scores higher than one
            carried by four mastheads that share an owner — and so, one
            newsroom. It is deliberately not a judgement about whether a story
            is accurate, which is not a call this system is in any position to
            make.
          </p>
          <p className="text-sm leading-relaxed text-muted">
            Citizen reporting is not live yet. The API accepts and validates a
            submission, but nothing is stored until there is a moderation queue
            behind it — see the{" "}
            <a href="/api-docs" className="text-brand hover:underline">
              API page
            </a>{" "}
            for how that endpoint is shaped, and{" "}
            <a href="/whats-new" className="text-brand hover:underline">
              What&rsquo;s new
            </a>{" "}
            for what has shipped since.
          </p>
        </div>
      </div>
    </div>
  );
}
