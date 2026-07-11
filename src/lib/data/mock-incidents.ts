import type {
  Category,
  Incident,
  Severity,
  Source,
  VerificationStatus,
} from "@/lib/types";
import { HOTSPOTS } from "@/lib/data/hotspots";
import { COUNTIES } from "@/lib/data/counties";
import { CATEGORY_LIST } from "@/lib/data/categories";

// Fixed reference "now" so the generated dataset is deterministic between
// server and client renders (no Date.now()/Math.random() drift).
export const DATA_REFERENCE_TIME = new Date("2026-07-02T09:00:00Z");

function mulberry32(seed: number) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260702);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

const NEWS_SOURCES = [
  "Citizen TV",
  "NTV Kenya",
  "KTN News",
  "The Standard",
  "Daily Nation",
  "The Star",
  "Kenya News Agency",
  "Radio Citizen",
];
const GOV_SOURCES = [
  "Kenya Police Service",
  "National Disaster Operation Centre",
  "County Government",
  "Kenya Red Cross",
  "Ministry of Health",
];
const CITIZEN_SOURCES = [
  "Citizen report",
  "Eyewitness report",
  "Community WhatsApp group",
  "Verified citizen upload",
];

// Homepages of the real outlets/agencies the seeded sources are named after.
// Sample incidents have no real article to link to, so sources link to the
// organisation itself; anonymous citizen sources intentionally have no URL.
const SOURCE_URLS: Record<string, string> = {
  "Citizen TV": "https://www.citizen.digital",
  "NTV Kenya": "https://ntvkenya.co.ke",
  "KTN News": "https://www.standardmedia.co.ke/ktnnews",
  "The Standard": "https://www.standardmedia.co.ke",
  "Daily Nation": "https://nation.africa",
  "The Star": "https://www.the-star.co.ke",
  "Kenya News Agency": "https://www.kenyanews.go.ke",
  "Radio Citizen": "https://www.citizen.digital",
  "Kenya Police Service": "https://www.nationalpolice.go.ke",
  "National Disaster Operation Centre": "https://www.interior.go.ke",
  "Kenya Red Cross": "https://www.redcross.or.ke",
  "Ministry of Health": "https://www.health.go.ke",
};

function makeSource(name: string, type: Source["type"]): Source {
  const url = SOURCE_URLS[name];
  return url ? { name, type, url } : { name, type };
}

const STREET_NOUNS = [
  "near the market",
  "along the highway",
  "close to the bus stage",
  "in the estate",
  "near the river bridge",
  "at the town center",
  "near the school",
  "along the border road",
];

const TITLE_TEMPLATES: Record<Category, string[]> = {
  crime: [
    "Armed robbery reported {loc}",
    "Break-in reported {loc}",
    "Carjacking incident {loc}",
    "Mugging reported {loc}",
  ],
  traffic_accident: [
    "Multi-vehicle collision {loc}",
    "Matatu accident {loc}",
    "Pedestrian knocked down {loc}",
    "Truck overturns {loc}",
  ],
  flood: [
    "Flash flooding reported {loc}",
    "Rising water levels {loc}",
    "Homes submerged after heavy rains {loc}",
    "Road impassable due to flooding {loc}",
  ],
  fire: [
    "Fire outbreak reported {loc}",
    "Market fire {loc}",
    "Building fire {loc}",
    "Bush fire spreading {loc}",
  ],
  unrest: [
    "Protest turns chaotic {loc}",
    "Demonstration reported {loc}",
    "Youths block road in protest {loc}",
    "Standoff with police {loc}",
  ],
  missing_person: [
    "Missing person reported {loc}",
    "Family seeks help finding relative last seen {loc}",
    "Child reported missing {loc}",
  ],
  terror_alert: [
    "Security alert issued {loc}",
    "Suspicious device reported {loc}",
    "Heightened security presence {loc}",
  ],
  public_health: [
    "Disease outbreak reported {loc}",
    "Cholera cases confirmed {loc}",
    "Public health alert issued {loc}",
  ],
  infrastructure: [
    "Power outage affecting residents {loc}",
    "Water pipe burst {loc}",
    "Bridge damage reported {loc}",
    "Road collapse {loc}",
  ],
  wildlife: [
    "Human-wildlife conflict reported {loc}",
    "Elephants stray into farmland {loc}",
    "Livestock attacked by wild animals {loc}",
  ],
  election_violence: [
    "Election-related clashes reported {loc}",
    "Political rally turns violent {loc}",
    "Intimidation reported ahead of polls {loc}",
  ],
};

const ACTIONS: Record<Category, string[]> = {
  crime: [
    "Avoid the area until police confirm it is secure",
    "Report any related sightings to the nearest police station",
    "Move in groups and avoid displaying valuables",
  ],
  traffic_accident: [
    "Use an alternative route to avoid delays",
    "Drive with caution near the affected stretch",
    "Give way to emergency vehicles",
  ],
  flood: [
    "Avoid crossing flooded roads or bridges",
    "Move to higher ground if in a low-lying area",
    "Monitor county alerts for evacuation notices",
  ],
  fire: [
    "Keep clear of the affected area",
    "Report to the nearest fire station if it spreads",
    "Follow instructions from emergency responders",
  ],
  unrest: [
    "Avoid the area and nearby routes",
    "Stay indoors until the situation calms",
    "Follow official updates before traveling through the area",
  ],
  missing_person: [
    "Share verified details only from official sources",
    "Contact the nearest police station with any information",
    "Avoid spreading unverified images or claims",
  ],
  terror_alert: [
    "Report suspicious items or activity immediately",
    "Avoid crowded areas near the alert location",
    "Follow instructions from security agencies",
  ],
  public_health: [
    "Practice recommended hygiene measures",
    "Seek medical attention if symptoms appear",
    "Follow Ministry of Health guidance for the area",
  ],
  infrastructure: [
    "Expect service disruption in the affected area",
    "Report related hazards to the county government",
    "Avoid the site until repairs are complete",
  ],
  wildlife: [
    "Avoid the affected farmland or corridor after dark",
    "Report sightings to Kenya Wildlife Service",
    "Secure livestock and property in the area",
  ],
  election_violence: [
    "Avoid the area and any planned gatherings nearby",
    "Report threats or violence to security agencies",
    "Follow IEBC and county security updates",
  ],
};

function buildSources(
  category: Category,
  severity: Severity
): { sources: Source[]; reportCount: number } {
  const sources: Source[] = [];
  const newsCount = randInt(0, severity === "low" ? 1 : 2);
  pickN(NEWS_SOURCES, newsCount).forEach((n) =>
    sources.push(makeSource(n, "news"))
  );

  const govChance =
    severity === "critical" ? 0.85 : severity === "high" ? 0.55 : 0.25;
  if (rand() < govChance) {
    sources.push(makeSource(pick(GOV_SOURCES), "government"));
  }
  if (category === "crime" && rand() < 0.5) {
    sources.push(makeSource("Kenya Police Service", "police"));
  }

  const citizenCount = randInt(1, 4);
  pickN(CITIZEN_SOURCES, Math.min(citizenCount, CITIZEN_SOURCES.length)).forEach(
    (n) => sources.push({ name: n, type: "citizen" })
  );

  if (sources.length === 0) {
    sources.push({ name: "Citizen report", type: "citizen" });
  }

  const reportCount = citizenCount + randInt(0, 3);
  return { sources, reportCount };
}

function computeVerification(
  sources: Source[],
  reportCount: number,
  severity: Severity
): { score: number; status: VerificationStatus } {
  let score = 20;
  score += sources.filter((s) => s.type === "news").length * 12;
  score += sources.filter((s) => s.type === "government").length * 22;
  score += sources.filter((s) => s.type === "police").length * 20;
  score += Math.min(reportCount, 6) * 4;
  score += severity === "critical" ? 6 : severity === "high" ? 3 : 0;
  score += randInt(-6, 6);
  score = Math.max(4, Math.min(99, score));

  let status: VerificationStatus;
  if (score >= 80) status = "verified";
  else if (score >= 55) status = "likely_true";
  else if (score >= 30) status = "unconfirmed";
  else status = "false_report";

  return { score, status };
}

function severityForCategory(category: Category): Severity {
  const weights: Record<Category, [number, number, number, number]> = {
    crime: [0.2, 0.4, 0.3, 0.1],
    traffic_accident: [0.15, 0.35, 0.35, 0.15],
    flood: [0.1, 0.3, 0.35, 0.25],
    fire: [0.1, 0.3, 0.35, 0.25],
    unrest: [0.2, 0.35, 0.3, 0.15],
    missing_person: [0.3, 0.4, 0.2, 0.1],
    terror_alert: [0.05, 0.15, 0.35, 0.45],
    public_health: [0.2, 0.35, 0.3, 0.15],
    infrastructure: [0.35, 0.4, 0.2, 0.05],
    wildlife: [0.3, 0.4, 0.2, 0.1],
    election_violence: [0.1, 0.3, 0.35, 0.25],
  };
  const [low, medium, high] = weights[category];
  const r = rand();
  if (r < low) return "low";
  if (r < low + medium) return "medium";
  if (r < low + medium + high) return "high";
  return "critical";
}

function buildAiSummary(
  category: Category,
  title: string,
  county: string,
  severity: Severity,
  status: VerificationStatus,
  sources: Source[]
): string {
  const catLabel = category.replace(/_/g, " ");
  const confidencePhrase =
    status === "verified"
      ? "Multiple independent sources confirm this report."
      : status === "likely_true"
      ? "Available evidence suggests this report is credible."
      : status === "unconfirmed"
      ? "This report has not yet been independently confirmed."
      : "This report could not be substantiated by available sources.";
  const sourceCount = sources.length;
  return `${title}. Classified as a ${severity} severity ${catLabel} incident in ${county} County. ${confidencePhrase} Aggregated from ${sourceCount} source${
    sourceCount === 1 ? "" : "s"
  }.`;
}

function slugId(index: number): string {
  return `ow-${index.toString().padStart(4, "0")}`;
}

function generateIncidents(count: number): Incident[] {
  const incidents: Incident[] = [];
  const totalMs = 30 * 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const useHotspot = rand() < 0.78;
    let county: string;
    let lat: number;
    let lng: number;
    let locationName: string;
    let category: Category;

    if (useHotspot) {
      const hotspot = pick(HOTSPOTS);
      county = hotspot.county;
      lat = hotspot.lat + (rand() - 0.5) * 0.02;
      lng = hotspot.lng + (rand() - 0.5) * 0.02;
      locationName = `${hotspot.name}, ${pick(STREET_NOUNS)}`;
      category =
        rand() < 0.7 ? pick(hotspot.bias) : pick(CATEGORY_LIST).id;
    } else {
      const c = pick(COUNTIES);
      county = c.name;
      lat = c.center[0] + (rand() - 0.5) * 0.35;
      lng = c.center[1] + (rand() - 0.5) * 0.35;
      locationName = `${c.name} County, ${pick(STREET_NOUNS)}`;
      category = pick(CATEGORY_LIST).id;
    }

    const severity = severityForCategory(category);
    const template = pick(TITLE_TEMPLATES[category]);
    const title = template.replace("{loc}", locationName);
    const { sources, reportCount } = buildSources(category, severity);
    const { score, status } = computeVerification(sources, reportCount, severity);
    const reportedAt = new Date(
      DATA_REFERENCE_TIME.getTime() - rand() * totalMs
    ).toISOString();
    const actions = pickN(ACTIONS[category], Math.min(3, ACTIONS[category].length));

    incidents.push({
      id: slugId(i),
      title,
      category,
      severity,
      county,
      locationName,
      lat: Number(lat.toFixed(5)),
      lng: Number(lng.toFixed(5)),
      reportedAt,
      verificationScore: score,
      verificationStatus: status,
      sources,
      reportCount,
      aiSummary: buildAiSummary(category, title, county, severity, status, sources),
      recommendedActions: actions,
      hasImage: rand() < 0.4,
      isCitizenReport: sources.every((s) => s.type === "citizen"),
    });
  }

  return incidents.sort(
    (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
  );
}

export const MOCK_INCIDENTS: Incident[] = generateIncidents(360);
