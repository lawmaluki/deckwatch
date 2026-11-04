import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import {
  METHOD_LABELS,
  REPORT_CATEGORY_LABELS,
  byCategory,
  byCounty,
  byDay,
  byWeek,
  COUNTY_TABLE_LIMIT,
  coverageStartDay,
  changeFromPrevious,
  confidenceLabel,
  countyCode,
  formatDay,
  formatMonth,
  getMonthlyReport,
  listMonthlyReports,
  nextMonth,
  previousMonth,
  totalDeaths,
  type MonthlyReport,
  type ReportEvent,
} from "@/lib/monthly-reports";
import { COUNTIES } from "@/lib/data/counties";
import { ReportSelectionProvider } from "@/components/reports/ReportSelection";
import { ReportCountyMap } from "@/components/reports/ReportCountyMap";
import { CountyBrief, CountyTable } from "@/components/reports/CountyPanels";
import { DailyTimeline } from "@/components/reports/DailyTimeline";
import { IncidentLog } from "@/components/reports/IncidentLog";

export async function generateStaticParams() {
  return (await listMonthlyReports()).map((r) => ({ month: r.month }));
}

export async function generateMetadata({ params }: { params: Promise<{ month: string }> }): Promise<Metadata> {
  const { month } = await params;
  const report = await getMonthlyReport(month);
  if (!report) return { title: "Report not found · Deckwatch Kenya" };
  return {
    title: `${formatMonth(month)} safety report · Deckwatch Kenya`,
    description: report.headlines?.month || `What happened in Kenya in ${formatMonth(month)}, where it happened, and what changed.`,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const CATEGORY_GRID = "grid grid-cols-[minmax(110px,200px)_1fr_76px] gap-3";

export default async function MonthlyReportPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  const report = await getMonthlyReport(month);
  if (!report) notFound();

  const [prev, all] = await Promise.all([getMonthlyReport(previousMonth(month)), listMonthlyReports()]);
  const available = new Set(all.map((r) => r.month));
  const issue = [...available].sort().indexOf(month) + 1;
  const monthLabel = formatMonth(month);
  const monthName = monthLabel.split(" ")[0];
  const monthShort = monthName.slice(0, 3);

  const events = report.events;
  const deaths = totalDeaths(events);
  const cats = byCategory(events);
  const counties = byCounty(events);
  const days = byDay(report);
  const weeks = byWeek(report, days);
  const multi = events.filter((e) => e.outlets.length > 1).length;
  const defining = events.filter((e) => e.defining);
  const coverageDay = coverageStartDay(report);
  const conflicts = events.filter((e) => e.conflict);
  const openCases = events.filter((e) => e.status === "Open");
  const hotspotEvents = new Map(report.hotspots.map((h) => [h.key, events.filter((e) => e.hotspot === h.key)]));
  const quiet = COUNTIES.map((c) => c.name).filter((n) => !counties.some((c) => c.county === n)).sort();
  const deadliestCat = [...cats].sort((a, b) => b.deaths - a.deaths)[0];
  const deadliestCounty = [...counties].sort((a, b) => b.deaths - a.deaths)[0];
  const mostReported = [...events].sort((a, b) => b.articles - a.articles)[0];
  const deadliestSpot = report.hotspots
    .map((h) => ({ h, evs: hotspotEvents.get(h.key) ?? [] }))
    .sort((a, b) => totalDeaths(b.evs) - totalDeaths(a.evs))[0];

  return (
    <div className="h-full overflow-y-auto px-4 pb-16 pt-5 sm:px-8">
      <ReportSelectionProvider initialCounty={counties[0]?.county ?? ""}>
        <article className="mx-auto max-w-5xl">
          <nav className="mb-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted print:hidden">
            <Link href="/dashboard/reports" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" /> All monthly reports
            </Link>
            <div className="flex items-center gap-1">
              <MonthLink month={previousMonth(month)} available={available} dir="prev" />
              <MonthLink month={nextMonth(month)} available={available} dir="next" />
            </div>
          </nav>

          {/* Cover */}
          <header className="space-y-6 border-b border-border pb-10 pt-6">
            <p className="font-mono text-xs uppercase tracking-wider text-muted">
              Deckwatch Kenya · Monthly safety report{issue > 0 ? ` · Issue ${String(issue).padStart(2, "0")}` : ""}
            </p>
            <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
              {monthLabel} <span className="font-medium text-muted">safety report</span>
            </h1>
            <p className="max-w-2xl text-lg text-muted">
              <span className="font-medium text-foreground">What happened. Where it happened. What changed.</span> Built from every news
              report Deckwatch captured in {monthName}, grouped into distinct incidents.
            </p>
            <div className="grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-surface sm:grid-cols-5">
              <CoverStat value={events.length} label="distinct incidents" lead />
              <CoverStat value={counties.length} label="of 47 counties affected" />
              <CoverStat value={`${deaths}+`} label="deaths reported" />
              <CoverStat value={multi} label="incidents reported by 2+ outlets" />
              <CoverStat value={report.articles} label="news articles reviewed" />
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-muted">
              <span>{METHOD_LABELS[report.method]}</span>
              <span>
                Data as of{" "}
                {new Date(report.asOf).toLocaleString("en-KE", {
                  timeZone: "Africa/Nairobi",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                EAT
              </span>
            </div>
            {report.method === "automatic" && (
              <Notice>
                <B>This report was not reviewed.</B> It was generated without the editorial
                step, so each captured article is counted as its own incident. Duplicate coverage inflates the numbers.
              </Notice>
            )}
            {report.coverageFrom && (
              <Notice>
                <B>Coverage is full from {formatDay(report.coverageFrom)}.</B> Deckwatch captured
                only a few reports before then, so the first {coverageDay - 1} days are under-counted. Every figure here counts incidents{" "}
                <B>captured by Deckwatch</B>. That is not the same as every incident that happened
                in Kenya.
              </Notice>
            )}
          </header>

          <Section n="01" eyebrow="The month in safety" title={report.headlines?.month || `${monthLabel} in safety`}>
            <p className="max-w-3xl text-lg text-muted">
              Deckwatch captured{" "}
              <B>
                {plural(events.length, "distinct incident")} in {plural(counties.length, "county", "counties")}
              </B>
              , with at least <B>{plural(deaths, "death")}</B> reported.
              {deadliestCat && deadliestCat.deaths > 0 && (
                <>
                  {" "}
                  {REPORT_CATEGORY_LABELS[deadliestCat.category]} incidents caused the most deaths ({deadliestCat.deaths}).
                </>
              )}
              {deadliestSpot && totalDeaths(deadliestSpot.evs) > 0 && (
                <>
                  {" "}
                  The deadliest hotspot was {deadliestSpot.h.title}, with{" "}
                  <B>
                    {plural(deadliestSpot.evs.length, "incident")} and {plural(totalDeaths(deadliestSpot.evs), "death")}
                  </B>
                  .
                </>
              )}
              {counties[0] && <> {counties[0].county} recorded the most incidents captured by Deckwatch.</>}
              {mostReported && mostReported.articles > 2 && (
                <>
                  {" "}
                  The most-reported story was &ldquo;{mostReported.title}&rdquo;, covered {mostReported.articles} times by{" "}
                  {plural(mostReported.outlets.length, "outlet")}.
                </>
              )}
            </p>
          </Section>

          <Section
            n="02"
            eyebrow="What happened"
            title={report.headlines?.what || `${cats[0] ? REPORT_CATEGORY_LABELS[cats[0].category] : "No category"} made up the most incidents`}
          >
            <div className="max-w-3xl space-y-1">
              <div className={`${CATEGORY_GRID} font-mono text-[11px] uppercase tracking-wider text-muted`}>
                <span>Category</span>
                <span>Incidents</span>
                <span className="text-right">Inc. · deaths</span>
              </div>
              {cats.map((c) => (
                <div key={c.category} className={`${CATEGORY_GRID} items-center py-1.5`} title={`${REPORT_CATEGORY_LABELS[c.category]}: ${c.incidents} incidents, ${c.deaths} deaths`}>
                  <span className="text-sm text-foreground">{REPORT_CATEGORY_LABELS[c.category]}</span>
                  <div className="h-3">
                    <div className="h-full min-w-[3px] rounded-r bg-brand" style={{ width: `${(c.incidents / cats[0].incidents) * 100}%` }} />
                  </div>
                  <span className="text-right font-mono text-xs text-muted">
                    <b className="text-sm font-medium text-foreground">{c.incidents}</b> · {c.deaths}
                  </span>
                </div>
              ))}
            </div>
            <Note>
              Death figures use the lowest number reported across sources. Reports that said only &ldquo;several feared dead&rdquo; count as
              zero, so these are floors.
            </Note>
          </Section>

          <Section
            n="03"
            eyebrow="Where it happened"
            title={
              counties[0]
                ? `${counties[0].county} recorded the most incidents captured by Deckwatch.${
                    deadliestCounty && deadliestCounty.county !== counties[0].county && deadliestCounty.deaths > 0
                      ? ` ${deadliestCounty.county} recorded the most deaths.`
                      : ""
                  }`
                : "Where it happened"
            }
          >
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              <ReportCountyMap counties={counties} />
              <CountyTable counties={counties} />
            </div>
            <Note>
              Top {Math.min(COUNTY_TABLE_LIMIT, counties.length)} of {counties.length} counties shown. Select a county on the map or in the table to open its
              brief.
              {quiet.length > 0 && (
                <>
                  {" "}
                  <B>No incidents were captured in {plural(quiet.length, "county", "counties")}</B>:{" "}
                  {quiet.join(", ")}. That may reflect thin news coverage rather than a quiet month.
                </>
              )}
            </Note>
          </Section>

          {report.hotspots.length > 0 && (
            <Section n="04" eyebrow="Emerging hotspots" title={`${plural(report.hotspots.length, "place")} and patterns with repeated incidents`}>
              <p className="max-w-3xl text-muted">
                Counties are too coarse to plan a journey with. These are the corridors, towns and patterns where Deckwatch captured several
                separate incidents this month.
              </p>
              <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {report.hotspots.map((h) => {
                  const evs = hotspotEvents.get(h.key) ?? [];
                  const nCounties = new Set(evs.map((e) => e.county)).size;
                  return (
                    <div key={h.key} className="space-y-2.5 rounded-2xl border border-border bg-surface p-4">
                      <h3 className="text-base font-semibold text-foreground">{h.title}</h3>
                      <div className="flex gap-5 font-mono text-xs text-muted">
                        <MiniStat value={evs.length} label="incidents" />
                        <MiniStat value={totalDeaths(evs)} label="deaths" />
                        <MiniStat value={nCounties} label={nCounties === 1 ? "county" : "counties"} />
                      </div>
                      <p className="text-sm text-muted">{h.summary}</p>
                      <ul className="space-y-1.5 text-[13px]">
                        {evs.map((e) => (
                          <li key={e.key} className="grid grid-cols-[46px_1fr] gap-2">
                            <span className="pt-0.5 font-mono text-[11px] text-muted/70">{formatDay(e.date)}</span>
                            <span className="text-foreground">{e.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section n="05" eyebrow="What changed" title={prev ? `Compared with ${formatMonth(prev.month)}` : "No month-on-month comparison yet"}>
            {prev ? (
              <Comparison report={report} prev={prev} />
            ) : (
              <p className="max-w-3xl text-muted">
                There is no report for {formatMonth(previousMonth(month))} to compare against, so this section shows the month week by week.
                The next report will carry the first month-on-month change.
              </p>
            )}
            <DailyTimeline days={days} coverageFrom={coverageDay} monthShort={monthShort} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {weeks.map((w) => (
                <div key={w.label} className="space-y-1 border-t-2 border-border pt-3">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                    {w.label}
                    {w.days < 7 ? ` · ${w.days} days` : ""}
                  </p>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">
                    {w.incidents}{" "}
                    <span className="text-sm font-normal text-muted">incidents · {(w.incidents / w.days).toFixed(1)}/day</span>
                  </p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {w.deaths} <span className="text-sm font-normal text-muted">deaths</span>
                  </p>
                  {w.top.length > 0 && <p className="text-[13px] text-muted">{w.top.map((e) => e.title).join(" · ")}</p>}
                </div>
              ))}
            </div>
          </Section>

          {defining.length > 0 && (
            <Section n="06" eyebrow={`The incidents that defined ${monthName}`} title={`${plural(defining.length, "incident")}, chosen for their toll, their reach and how widely they were reported`}>
              <div className="space-y-3.5">
                {defining.map((e) => (
                  <DefiningCard key={e.key} e={e} />
                ))}
              </div>
            </Section>
          )}

          <Section n="07" eyebrow="Your county" title="Pick a county to see its month">
            <CountyBrief counties={counties} monthLabel={monthName} />
          </Section>

          <Section n="08" eyebrow="What we know and what we don't" title="How confident we are in these numbers">
            <div className="grid gap-8 md:grid-cols-2">
              <KnowList
                dot="var(--brand)"
                title="What we know"
                items={[
                  <>
                    <B>
                      {multi} of {events.length} incidents
                    </B>{" "}
                    were reported by two or more independent outlets.
                  </>,
                  <>Every incident links back to at least one published article. You can check each one in the full log below.</>,
                  <>
                    <B>{plural(report.eventArticles, "article")}</B> described these {events.length} incidents, which is why Deckwatch counts
                    incidents rather than articles.
                  </>,
                  report.method !== "automatic" ? (
                    <>
                      The automatic classifier put an article in the right category <B>{report.catAgree}%</B> of the time, measured against
                      this report&rsquo;s consolidation.
                    </>
                  ) : null,
                ]}
              />
              <KnowList
                dot="var(--medium)"
                title="What remains unclear"
                items={[
                  <>
                    <B>
                      {report.statusCounts.unconfirmed ?? 0} of {report.articles} articles
                    </B>{" "}
                    still carry an &ldquo;unconfirmed&rdquo; status in Deckwatch&rsquo;s automatic scoring. Automatic corroboration merged
                    only {report.autoMerged} duplicates this month.
                  </>,
                  report.method !== "automatic" && report.countyAgree < 100 ? (
                    <>
                      The automatic county was wrong for about <B>{100 - report.countyAgree}%</B> of incident articles. This report corrects
                      them; the live map does not yet.
                    </>
                  ) : null,
                  conflicts.length > 0 ? (
                    <>
                      <B>Reports conflicted</B> on key facts in {plural(conflicts.length, "incident")}, including{" "}
                      {conflicts
                        .slice(0, 3)
                        .map((e) => e.title.split(/[;,]/)[0].toLowerCase())
                        .join("; ")}
                      .
                    </>
                  ) : null,
                  openCases.length > 0 ? (
                    <>
                      <B>{plural(openCases.length, "missing-person case")}</B> had no reported resolution by
                      the end of the month.
                    </>
                  ) : null,
                  <>
                    Deckwatch reads {plural(report.outletCounts.length, "news outlet")}, most of them Nairobi-based, and has no citizen reports
                    yet. Remote counties are likely under-counted
                    {quiet.length > 0 ? `, and ${plural(quiet.length, "county", "counties")} had no captured incidents at all` : ""}.
                  </>,
                ]}
              />
            </div>
          </Section>

          {report.watch.length > 0 && (
            <Section n="09" eyebrow={`What to watch in ${formatMonth(nextMonth(month)).split(" ")[0]}`} title="Based on official warnings and on incidents still unfolding">
              <p className="max-w-3xl text-muted">None of this is a prediction. Each item comes from warnings or ongoing events already reported.</p>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {report.watch.map((w) => (
                  <div key={w.title} className="space-y-1.5 border-l-2 border-brand pl-4">
                    <h3 className="text-base font-semibold text-foreground">{w.title}</h3>
                    <p className="text-sm text-muted">{w.body}</p>
                    {w.action && (
                      <p className="text-sm text-foreground">
                        <span className="mr-1.5 font-mono text-[11px] uppercase tracking-wider text-brand">Do</span>
                        {w.action}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section n="10" eyebrow="Sources and method" title={`From ${report.articles} articles to ${plural(events.length, "incident")}`}>
            <p className="max-w-3xl text-muted">
              Deckwatch reads Kenyan news feeds every hour, classifies each article and places it on the map.{" "}
              {report.method === "editorial"
                ? "For this report every article was reviewed by hand."
                : report.method === "claude"
                  ? "For this report every article was reviewed by Claude, an AI model, and every figure was then computed from the articles themselves."
                  : "This report skipped the review step."}{" "}
              {report.method !== "automatic" &&
                "Duplicate reports of the same event were merged into one incident, counties were corrected, and articles that were not about a new incident were set aside."}
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <FlowStat value={report.articles} label="articles captured from Kenyan news feeds" />
              <FlowStat value={report.eventArticles} label="described a new safety incident" />
              <FlowStat value={events.length} label="distinct incidents after merging duplicates" />
              <FlowStat value={report.contextArticles} label="were context: warnings, court cases, follow-ups" />
              <FlowStat value={report.offTopic} label="were off-topic and excluded" />
            </div>
            {report.context.length > 0 && (
              <Note>
                Context set aside: {report.context.map((c) => `${c.label.toLowerCase()} (${c.count})`).join(", ")}. It informs the watch list but
                is not counted as incidents.
              </Note>
            )}
            <div>
              <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">Outlets this month · articles captured</p>
              <div className="grid max-w-4xl gap-x-7 sm:grid-cols-2 lg:grid-cols-3">
                {report.outletCounts.map(([name, n]) => (
                  <div key={name} className="flex justify-between border-b border-border py-1.5 text-sm">
                    <span>{name}</span>
                    <span className="font-mono text-muted">{n}</span>
                  </div>
                ))}
              </div>
            </div>
            <IncidentLog events={events} categories={cats} />
          </Section>

          <Section eyebrow="If you're affected" title="Need help now?">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Help number="999 · 112 · 911" label="Police emergency (National Police Service)" />
              <Help number="1199" label="Kenya Red Cross emergency line" />
              <Help number="1195" label="National gender-based violence helpline" />
              <Help number="116" label="Childline Kenya" />
            </div>
          </Section>

          <footer className="space-y-1 border-t border-border pt-6 text-xs text-muted/80">
            <p>
              Deckwatch Kenya · {monthLabel} report · Generated{" "}
              {new Date(report.generatedAt).toLocaleDateString("en-KE", { timeZone: "Africa/Nairobi", day: "numeric", month: "long", year: "numeric" })}
              {report.model ? ` · ${report.model}` : ""}
            </p>
            <p>
              Deckwatch reports incidents found in published news. A county with more incidents may simply have more reporters. Always follow
              instructions from official emergency services.
            </p>
          </footer>
        </article>
      </ReportSelectionProvider>
    </div>
  );
}

function Section({ n, eyebrow, title, children }: { n?: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 border-b border-border py-12">
      <div className="space-y-2">
        <p className="font-mono text-xs uppercase tracking-wider text-muted">
          {n ? `${n} · ` : ""}
          {eyebrow}
        </p>
        <h2 className="max-w-4xl text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function B({ children }: { children: React.ReactNode }) {
  return <b className="font-medium text-foreground">{children}</b>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="max-w-3xl text-sm text-muted">{children}</p>;
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex max-w-4xl gap-2.5 text-sm text-muted">
      <i className="mt-1.5 h-2 w-2 flex-none rounded-sm" style={{ background: "var(--medium)" }} />
      <span>{children}</span>
    </p>
  );
}

function CoverStat({ value, label, lead }: { value: React.ReactNode; label: string; lead?: boolean }) {
  return (
    <div className="space-y-0.5 border-b border-r border-border p-4 sm:border-b-0 sm:last:border-r-0">
      <p className={`text-3xl font-semibold tracking-tight tabular-nums ${lead ? "text-brand" : "text-foreground"}`}>{value}</p>
      <p className="text-xs leading-snug text-muted">{label}</p>
    </div>
  );
}

function MiniStat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <b className="block font-sans text-xl font-medium tracking-tight text-foreground">{value}</b>
      {label}
    </span>
  );
}

function FlowStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="space-y-0.5 rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
      <p className="text-xs leading-snug text-muted">{label}</p>
    </div>
  );
}

function KnowList({ dot, title, items }: { dot: string; title: string; items: (React.ReactNode | null)[] }) {
  return (
    <div>
      <h3 className="mb-2.5 flex items-center gap-2 text-base font-semibold text-foreground">
        <i className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />
        {title}
      </h3>
      <ul className="list-disc space-y-2.5 pl-5 text-sm text-muted">
        {items.filter(Boolean).map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function DefiningCard({ e }: { e: ReportEvent }) {
  const conf = confidenceLabel(e);
  const shown = e.sources.slice(0, 4);
  return (
    <div className="grid gap-x-6 gap-y-2 rounded-2xl border border-border bg-surface p-5 md:grid-cols-[170px_minmax(0,1fr)]">
      <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted md:flex-col">
        <span className="text-sm text-foreground">{formatDay(e.date)}</span>
        <span>
          {e.county} · {countyCode(e.county)}
        </span>
        <span>{REPORT_CATEGORY_LABELS[e.category]}</span>
      </div>
      <div className="min-w-0 space-y-2.5">
        <h3 className="text-lg font-semibold text-foreground">{e.title}</h3>
        <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
          {e.deaths > 0 && <Chip tone="critical">{plural(e.deaths, "death")} reported</Chip>}
          <Chip tone={conf.strong ? "brand" : undefined}>{conf.label}</Chip>
          <Chip>{plural(e.articles, "article")}</Chip>
          {e.status && <Chip>{e.status}</Chip>}
          {e.conflict && <Chip tone="medium">Conflicting reports</Chip>}
        </div>
        {e.why && (
          <p className="text-sm text-muted">
            <B>Why it matters.</B> {e.why}
            {e.conflict ? ` ${e.conflict}` : ""}
          </p>
        )}
        <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-muted">
          {shown.map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline">
              {s.name}
            </a>
          ))}
          {e.sources.length > shown.length && <span>+{e.sources.length - shown.length} more</span>}
        </div>
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone?: "brand" | "critical" | "medium"; children: React.ReactNode }) {
  const border = tone ? `color-mix(in srgb, var(--${tone}) 55%, transparent)` : undefined;
  return (
    <span
      className={`whitespace-nowrap rounded-full border border-border px-2 py-0.5 ${tone === "brand" ? "text-brand" : tone ? "text-foreground" : "text-muted"}`}
      style={border ? { borderColor: border } : undefined}
    >
      {children}
    </span>
  );
}

function Help({ number, label }: { number: string; label: string }) {
  return (
    <div className="space-y-1 rounded-2xl border border-border bg-surface p-4">
      <p className="select-all whitespace-nowrap font-mono text-xl font-medium text-foreground">{number}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  );
}

function MonthLink({ month, available, dir }: { month: string; available: Set<string>; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const label = formatMonth(month).replace(/ \d{4}$/, "");
  const body = (
    <>
      {dir === "prev" && <Icon className="h-3.5 w-3.5" />}
      {label}
      {dir === "next" && <Icon className="h-3.5 w-3.5" />}
    </>
  );
  if (!available.has(month)) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted/40" aria-disabled>
        {body}
      </span>
    );
  }
  return (
    <Link href={`/dashboard/reports/${month}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-surface-raised hover:text-foreground">
      {body}
    </Link>
  );
}

function Comparison({ report, prev }: { report: MonthlyReport; prev: MonthlyReport }) {
  const rows = changeFromPrevious(report, prev);
  const cur = report.events.length;
  const old = prev.events.length;
  const pct = old ? Math.round(((cur - old) / old) * 100) : null;
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-muted">
        Deckwatch captured <B>{plural(cur, "incident")}</B> this month against {old} in {formatMonth(prev.month)}
        {pct !== null ? ` (${pct >= 0 ? "+" : ""}${pct}%)` : ""}. These are changes in <B>reported</B> incidents: more coverage, or a new
        outlet, can move them as much as events on the ground.
      </p>
      <div className="max-w-3xl overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border font-mono text-[11px] uppercase tracking-wider text-muted">
              <th className="px-2.5 py-2 text-left font-medium">Category</th>
              <th className="px-2.5 py-2 text-right font-medium">{formatMonth(prev.month).slice(0, 3)}</th>
              <th className="px-2.5 py-2 text-right font-medium">{formatMonth(report.month).slice(0, 3)}</th>
              <th className="px-2.5 py-2 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.category} className="border-b border-border">
                <td className="px-2.5 py-2">{REPORT_CATEGORY_LABELS[r.category]}</td>
                <td className="px-2.5 py-2 text-right font-mono tabular-nums text-muted">{r.previous}</td>
                <td className="px-2.5 py-2 text-right font-mono tabular-nums">{r.current}</td>
                <td className="px-2.5 py-2 text-right font-mono tabular-nums">
                  {r.pct === null ? "new" : r.pct === 0 ? "→ 0%" : `${r.pct > 0 ? "↑" : "↓"} ${Math.abs(r.pct)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
