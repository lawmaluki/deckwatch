import type { MetadataRoute } from "next";
import { COUNTIES } from "@/lib/data/counties";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://deckwatch.vercel.app";

/** The 47 county pages are the long tail worth being found for — someone
 * searching a county's name is exactly who this is for — and nothing linked
 * them for a crawler beyond the index page. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/dashboard`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE_URL}/counties`, changeFrequency: "hourly", priority: 0.8 },
    { url: `${SITE_URL}/why`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/whats-new`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/api-docs`, changeFrequency: "monthly", priority: 0.3 },
  ];

  return [
    ...pages,
    ...COUNTIES.map((c) => ({
      url: `${SITE_URL}/county/${c.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.7,
    })),
  ].map((entry) => ({ lastModified: now, ...entry }));
}
