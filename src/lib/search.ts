import { CATEGORY_LIST } from "@/lib/data/categories";
import { COUNTIES } from "@/lib/data/counties";
import type { Category } from "@/lib/types";

export interface ParsedQuery {
  categories: Category[];
  county: string | null;
  hours: number | null;
  freeText: string;
}

const CATEGORY_KEYWORDS: Record<string, Category> = {
  crime: "crime",
  robbery: "crime",
  theft: "crime",
  mugging: "crime",
  accident: "traffic_accident",
  accidents: "traffic_accident",
  crash: "traffic_accident",
  traffic: "traffic_accident",
  flood: "flood",
  floods: "flood",
  flooding: "flood",
  fire: "fire",
  fires: "fire",
  protest: "unrest",
  protests: "unrest",
  unrest: "unrest",
  demonstration: "unrest",
  riot: "unrest",
  missing: "missing_person",
  terror: "terror_alert",
  terrorism: "terror_alert",
  outbreak: "public_health",
  disease: "public_health",
  cholera: "public_health",
  power: "infrastructure",
  water: "infrastructure",
  infrastructure: "infrastructure",
  wildlife: "wildlife",
  elephant: "wildlife",
  election: "election_violence",
};

const TIME_KEYWORDS: [RegExp, number][] = [
  [/today/i, 24],
  [/last\s*24\s*h/i, 24],
  [/yesterday/i, 48],
  [/this week|last 7 days|past week/i, 24 * 7],
  [/this month|last 30 days|past month/i, 24 * 30],
];

export function parseSearchQuery(query: string): ParsedQuery {
  const q = query.trim();
  const lower = q.toLowerCase();
  const categories: Category[] = [];

  for (const [word, cat] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lower.includes(word) && !categories.includes(cat)) categories.push(cat);
  }
  for (const cat of CATEGORY_LIST) {
    if (lower.includes(cat.label.toLowerCase())) {
      if (!categories.includes(cat.id)) categories.push(cat.id);
    }
  }

  let county: string | null = null;
  for (const c of COUNTIES) {
    if (lower.includes(c.name.toLowerCase())) {
      county = c.name;
      break;
    }
  }

  let hours: number | null = null;
  for (const [re, h] of TIME_KEYWORDS) {
    if (re.test(lower)) {
      hours = h;
      break;
    }
  }

  return { categories, county, hours, freeText: q };
}
