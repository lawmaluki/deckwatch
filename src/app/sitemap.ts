import type { MetadataRoute } from "next";
import { COUNTIES } from "@/lib/data/counties";
import { listMonthlyReports } from "@/lib/monthly-reports";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://deckwatch.vercel.app";

/** The 47 county pages are the long tail worth being found for — someone
 * searching a county's name is exactly who this is for — and nothing linked
 * them for a crawler beyond the index page. The monthly reports are the other
 * half of that: written once, still worth reading a year later, and the only
 * pages here whose value does not expire within the day. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/dashboard`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/route-watch`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/counties`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/dashboard/reports`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/why`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/whats-new`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/api-docs`, changeFrequency: "monthly", priority: 0.3 },
  ];

  // Enumerated rather than hardcoded: a new issue appears every month, and a
  // sitemap that needs editing to mention it would stop being true. The list
  // falls back to the bundled reports if the backend is unreachable, so a
  // build never drops the months it already ships with.
  const reports = await listMonthlyReports();

  return [
    ...pages,
    ...COUNTIES.map((c) => ({
      url: `${SITE_URL}/county/${c.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
    ...reports.map((r) => ({
      url: `${SITE_URL}/dashboard/reports/${r.month}`,
      // A finished month does not change again, and generatedAt is when it
      // last did — truer than stamping every entry with the build time.
      lastModified: new Date(r.generatedAt),
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ].map((entry) => ({ lastModified: now, ...entry }));
}
