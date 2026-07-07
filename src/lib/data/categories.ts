import type { Category, Severity, VerificationStatus } from "@/lib/types";
import {
  Siren,
  CarFront,
  Waves,
  Flame,
  Megaphone,
  UserSearch,
  TriangleAlert,
  Stethoscope,
  Construction,
  PawPrint,
  Vote,
  type LucideIcon,
} from "lucide-react";

export interface CategoryConfig {
  id: Category;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  color: string;
  description: string;
}

export const CATEGORIES: Record<Category, CategoryConfig> = {
  crime: {
    id: "crime",
    label: "Crime",
    shortLabel: "Crime",
    icon: Siren,
    color: "#fb7185",
    description: "Robberies, assaults, break-ins and other criminal activity.",
  },
  traffic_accident: {
    id: "traffic_accident",
    label: "Road Accident",
    shortLabel: "Accident",
    icon: CarFront,
    color: "#f59e0b",
    description: "Road traffic collisions and accident blackspots.",
  },
  flood: {
    id: "flood",
    label: "Flood",
    shortLabel: "Flood",
    icon: Waves,
    color: "#0ea5e9",
    description: "Flooding from rivers, dams, and heavy rainfall.",
  },
  fire: {
    id: "fire",
    label: "Fire Outbreak",
    shortLabel: "Fire",
    icon: Flame,
    color: "#f97316",
    description: "Structural, bush, and market fires.",
  },
  unrest: {
    id: "unrest",
    label: "Protest / Unrest",
    shortLabel: "Unrest",
    icon: Megaphone,
    color: "#8b5cf6",
    description: "Demonstrations, riots, and political unrest.",
  },
  missing_person: {
    id: "missing_person",
    label: "Missing Person",
    shortLabel: "Missing",
    icon: UserSearch,
    color: "#d946ef",
    description: "Reported missing persons and abductions.",
  },
  terror_alert: {
    id: "terror_alert",
    label: "Terror Alert",
    shortLabel: "Terror",
    icon: TriangleAlert,
    color: "#dc2626",
    description: "Security threats and terror-related alerts.",
  },
  public_health: {
    id: "public_health",
    label: "Disease Outbreak",
    shortLabel: "Health",
    icon: Stethoscope,
    color: "#14b8a6",
    description: "Disease outbreaks and public health emergencies.",
  },
  infrastructure: {
    id: "infrastructure",
    label: "Infrastructure Failure",
    shortLabel: "Infra",
    icon: Construction,
    color: "#eab308",
    description: "Power outages, water shortages, road and bridge failures.",
  },
  wildlife: {
    id: "wildlife",
    label: "Wildlife Conflict",
    shortLabel: "Wildlife",
    icon: PawPrint,
    color: "#84cc16",
    description: "Human-wildlife conflict incidents.",
  },
  election_violence: {
    id: "election_violence",
    label: "Election Violence",
    shortLabel: "Election",
    icon: Vote,
    color: "#ec4899",
    description: "Election-related violence and intimidation.",
  },
};

export const CATEGORY_LIST = Object.values(CATEGORIES);

export const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; color: string; order: number }
> = {
  low: { label: "Low", color: "#22c55e", order: 0 },
  medium: { label: "Medium", color: "#eab308", order: 1 },
  high: { label: "High", color: "#f97316", order: 2 },
  critical: { label: "Critical", color: "#ef4444", order: 3 },
};

export const SEVERITY_LIST = Object.values(SEVERITY_CONFIG);

export const VERIFICATION_CONFIG: Record<
  VerificationStatus,
  { label: string; color: string }
> = {
  verified: { label: "Verified", color: "#22c55e" },
  likely_true: { label: "Likely True", color: "#0ea5e9" },
  unconfirmed: { label: "Unconfirmed", color: "#eab308" },
  false_report: { label: "False Report", color: "#6b7280" },
};
