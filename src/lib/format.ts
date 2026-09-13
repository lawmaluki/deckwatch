import { getReferenceTime } from "@/lib/incidents-source";
import { MS_PER_MINUTE } from "@/lib/constants";

export function relativeTime(iso: string): string {
  const diffMs = getReferenceTime().getTime() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / MS_PER_MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
};

/** Strips HTML tags and decodes entities. Feed summaries often carry markup
 * (e.g. "<p>...</p>") that isn't meant to render as text. */
export function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*$/, "") // trailing unterminated tag (e.g. markup truncated mid-attribute)
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, code: string) => {
      if (code[0] === "#") {
        const codePoint =
          code[1] === "x" || code[1] === "X"
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10);
        return Number.isNaN(codePoint) ? match : String.fromCodePoint(codePoint);
      }
      return HTML_ENTITIES[code] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}
