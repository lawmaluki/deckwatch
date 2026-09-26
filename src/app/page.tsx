import type { Metadata } from "next";
import { MapExperience } from "@/components/map/MapExperience";

export const metadata: Metadata = {
  // Absolute, because the root layout's title template does not apply to the
  // page in its own segment — left as a bare string this rendered
  // "Live Incident Map" with no brand on the most-shared page of the site.
  title: { absolute: "Deckwatch Kenya — Live Incident Map" },
  description:
    "Live map of reported incidents across Kenya's 47 counties — crime, accidents, flooding, fire and unrest, with verification scoring on every report.",
};

export default function Home() {
  return (
    <div className="h-full w-full">
      <MapExperience />
    </div>
  );
}
