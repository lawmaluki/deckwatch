import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapExperience } from "@/components/map/MapExperience";
import { getIncidentById } from "@/lib/incident-by-id";
import { incidentPath } from "@/lib/share";
import { stripHtml } from "@/lib/format";

/** The page a shared incident link opens: the live map, on that incident.
 *
 * Its own route rather than a query on "/" so the home page stays static, and
 * so a pasted link previews as the incident instead of the site's front page.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const incident = await getIncidentById(id);
  if (!incident) return {};

  const title = incident.title;
  const where = `${incident.locationName}, ${incident.county} County`;
  const summary = incident.aiSummary ? stripHtml(incident.aiSummary) : "";
  const description = summary ? `${where}. ${summary}` : `Reported incident in ${where}, Kenya.`;
  return {
    title,
    description,
    openGraph: {
      type: "article",
      title: `${title} — Deckwatch Kenya`,
      description,
      url: incidentPath(incident.id),
      // Restated: setting openGraph replaces the parent's object wholesale.
      images: ["/opengraph-image"],
    },
    alternates: { canonical: incidentPath(incident.id) },
    // Indexed, inheriting the root robots policy. A takedown makes this page
    // 404 (see below), which is what gets a search engine to drop it.
  };
}

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const incident = await getIncidentById(id);
  // Missing covers taken-down incidents too: a removed report's link must not
  // keep resolving to it.
  if (!incident) notFound();

  return (
    <div className="h-full w-full">
      <MapExperience initialIncident={incident} />
    </div>
  );
}
