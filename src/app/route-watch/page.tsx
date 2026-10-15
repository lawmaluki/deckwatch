import type { Metadata } from "next";
import { RouteWatch } from "@/components/route-watch/RouteWatch";
import { BUFFER_OPTIONS_KM, TRAVEL_MODES, type RoutePlace, type TravelMode } from "@/lib/route-watch";

export const metadata: Metadata = {
  title: "Route Watch",
  description:
    "Before you travel, see incidents reported along your route in Kenya — accidents, protests, flooding and security incidents, ordered by where they are on the road.",
};

/** "Name@lat,lng", as RouteWatch writes it into the URL. */
function parsePlace(raw: string | string[] | undefined): RoutePlace | null {
  if (typeof raw !== "string") return null;
  const at = raw.lastIndexOf("@");
  if (at <= 0) return null;
  const [lat, lng] = raw.slice(at + 1).split(",").map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -5 || lat > 5.5 || lng < 33 || lng > 42.5) return null;
  return { name: raw.slice(0, at).slice(0, 80), county: null, lat, lng };
}

export default async function RouteWatchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const buffer = Number(params.buffer);
  const mode = typeof params.mode === "string" && params.mode in TRAVEL_MODES ? (params.mode as TravelMode) : null;
  return (
    <RouteWatch
      initial={{
        from: parsePlace(params.from),
        to: parsePlace(params.to),
        bufferKm: (BUFFER_OPTIONS_KM as readonly number[]).includes(buffer) ? buffer : null,
        mode,
      }}
    />
  );
}
