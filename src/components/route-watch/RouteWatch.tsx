"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FeatureCollection } from "geojson";
import { ArrowUpDown, Bell, BellOff, Bookmark, Info, Trash2 } from "lucide-react";
import clsx from "clsx";
import { PlacePicker } from "@/components/route-watch/PlacePicker";
import { RouteIncidentCard } from "@/components/route-watch/RouteIncidentCard";
import { IncidentListItem } from "@/components/incidents/IncidentListItem";
import { useIncidents } from "@/hooks/useIncidents";
import { useMapFocus } from "@/hooks/useMapFocus";
import { USE_API } from "@/lib/incidents-source";
import { useAppStore } from "@/store/useAppStore";
import {
  BUFFER_OPTIONS_KM,
  countiesAlongRoute,
  DEFAULT_BUFFER_KM,
  DEFAULT_WINDOW_HOURS,
  formatKm,
  matchRoute,
  POPULAR_ROUTES,
  prepareRoute,
  ROUTE_GROUPS,
  routeName,
  SAVED_ROUTE_TOLERANCE_KM,
  simplifyRoute,
  WINDOW_OPTIONS_HOURS,
  type RouteGeometry,
  type RouteIncidentGroup,
  type RoutePlace,
  type SavedRoute,
} from "@/lib/route-watch";

const RouteMap = dynamic(() => import("@/components/route-watch/RouteMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-background text-xs text-muted">
      Loading map…
    </div>
  ),
});

const COUNTY_LEVEL_PREVIEW = 5;

type RouteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; geometry: RouteGeometry }
  | { status: "error"; message: string };

/** A finished request, tagged with what was asked: the state shown is derived
 * from whether it answers the current from/to, so nothing has to be reset
 * when the ends change. */
type RouteResult = { query: string } & ({ geometry: RouteGeometry } | { error: string });

function routeQuery(from: RoutePlace | null, to: RoutePlace | null): string | null {
  if (!from || !to) return null;
  return `from=${from.lat.toFixed(4)},${from.lng.toFixed(4)}&to=${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
}

export interface RouteWatchInitial {
  from: RoutePlace | null;
  to: RoutePlace | null;
  bufferKm: number | null;
}

/** Shared form for "Name@lat,lng" in the URL, so a route can be linked to. */
export function encodePlace(p: RoutePlace): string {
  return `${p.name}@${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

function routeId(from: RoutePlace, to: RoutePlace): string {
  return `${from.lat.toFixed(3)},${from.lng.toFixed(3)}>${to.lat.toFixed(3)},${to.lng.toFixed(3)}`;
}

const noopSubscribe = () => () => {};

/** False during the server render and hydration, true after. Saved routes
 * live in localStorage, so rendering them before this would disagree with
 * the server's HTML. */
function useMounted(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

let countiesPromise: Promise<FeatureCollection | null> | null = null;
function loadCounties(): Promise<FeatureCollection | null> {
  // The same file the map's county layer fetches, so the browser cache serves it.
  countiesPromise ??= fetch("/data/kenya-counties.geojson")
    .then((r) => r.json() as Promise<FeatureCollection>)
    .catch(() => {
      countiesPromise = null;
      return null;
    });
  return countiesPromise;
}

export function RouteWatch({ initial }: { initial: RouteWatchInitial }) {
  const [from, setFrom] = useState<RoutePlace | null>(initial.from);
  const [to, setTo] = useState<RoutePlace | null>(initial.to);
  const [bufferKm, setBufferKm] = useState<number>(initial.bufferKm ?? DEFAULT_BUFFER_KM);
  const [windowHours, setWindowHours] = useState<number>(DEFAULT_WINDOW_HOURS);
  const [group, setGroup] = useState<RouteIncidentGroup>("all");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [counties, setCounties] = useState<FeatureCollection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAllCounty, setShowAllCounty] = useState(false);

  const snapshot = useIncidents();
  // In api mode the first snapshot is sample data kept for hydration (see
  // DataSnapshot.polled): matching it would show invented incidents on a
  // real road until the first poll lands.
  const ready = snapshot.polled || !USE_API;
  const mounted = useMounted();
  const savedRoutes = useAppStore((s) => s.savedRoutes);
  const saveRoute = useAppStore((s) => s.saveRoute);
  const removeRoute = useAppStore((s) => s.removeRoute);
  const setRouteAlerts = useAppStore((s) => s.setRouteAlerts);
  const focus = useMapFocus();

  useEffect(() => {
    void loadCounties().then(setCounties);
  }, []);

  // Fetch the route whenever both ends are set.
  const query = routeQuery(from, to);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/route?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't find a route.");
        setResult({ query, geometry: body as RouteGeometry });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setResult({ query, error: err.message });
      });
    return () => controller.abort();
  }, [query]);

  const route: RouteState =
    query === null
      ? { status: "idle" }
      : result?.query !== query
        ? { status: "loading" }
        : "geometry" in result
          ? { status: "ready", geometry: result.geometry }
          : { status: "error", message: result.error };

  // Keep the URL shareable. history.replaceState, not router.replace: the page
  // has nothing to re-render on the server for a change of route.
  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", encodePlace(from));
    if (to) params.set("to", encodePlace(to));
    if (bufferKm !== DEFAULT_BUFFER_KM) params.set("buffer", String(bufferKm));
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [from, to, bufferKm]);

  const geometry = route.status === "ready" ? route.geometry : null;
  const prepared = useMemo(() => (geometry ? prepareRoute(geometry.coords) : null), [geometry]);
  const routeCounties = useMemo(
    () => (geometry && counties ? countiesAlongRoute(geometry.coords, counties) : []),
    [geometry, counties]
  );
  const matches = useMemo(
    () =>
      prepared && ready
        ? matchRoute(prepared, snapshot.incidents, {
            bufferKm,
            windowHours,
            group,
            nowMs: snapshot.referenceTime.getTime(),
            counties: routeCounties,
          })
        : { along: [], inCounties: [] },
    [prepared, ready, snapshot, bufferKm, windowHours, group, routeCounties]
  );

  const savedId = from && to ? routeId(from, to) : null;
  const saved = mounted ? savedRoutes.find((r) => r.id === savedId) : undefined;

  const onSave = () => {
    if (!from || !to || !geometry || !savedId) return;
    const route: SavedRoute = {
      id: savedId,
      from,
      to,
      coords: simplifyRoute(geometry.coords, SAVED_ROUTE_TOLERANCE_KM),
      counties: routeCounties,
      bufferKm,
      group,
      alerts: true,
    };
    saveRoute(route);
  };

  const windowLabel = windowHours >= 48 ? `${windowHours / 24} days` : `${windowHours} hours`;
  const countyList = showAllCounty ? matches.inCounties : matches.inCounties.slice(0, COUNTY_LEVEL_PREVIEW);

  return (
    <div className="flex h-full flex-col md:flex-row">
      <div className="relative h-[38vh] shrink-0 md:order-last md:h-full md:flex-1">
        <RouteMap
          coords={geometry?.coords ?? null}
          from={from}
          to={to}
          matches={matches.along}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            document.getElementById(`route-incident-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }}
        />
      </div>

      <section
        aria-label="Route Watch"
        className="min-h-0 flex-1 overflow-y-auto border-border px-4 py-4 md:w-[420px] md:flex-none md:border-r"
      >
        <h1 className="text-lg font-semibold text-foreground">Route Watch</h1>
        <p className="mt-0.5 text-xs text-muted">
          Before you leave, see what has been reported along your route.
        </p>

        <div className="mt-4 space-y-2">
          <PlacePicker label="Starting point" value={from} onChange={setFrom} allowMyLocation />
          <div className="flex justify-end">
            <button
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
              disabled={!from && !to}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-foreground disabled:opacity-40"
            >
              <ArrowUpDown className="h-3.5 w-3.5" /> Swap
            </button>
          </div>
          <PlacePicker label="Destination" value={to} onChange={setTo} />
        </div>

        {!from && !to && (
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Popular routes</p>
            <div className="flex flex-wrap gap-1.5">
              {POPULAR_ROUTES.map((r) => (
                <button
                  key={routeName(r)}
                  onClick={() => {
                    setFrom(r.from);
                    setTo(r.to);
                  }}
                  className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-foreground/90 hover:border-brand/50"
                >
                  {routeName(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        {mounted && savedRoutes.length > 0 && (
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Your routes</p>
            <ul className="space-y-1">
              {savedRoutes.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-lg bg-surface px-2.5 py-1.5">
                  <button
                    onClick={() => {
                      setFrom(r.from);
                      setTo(r.to);
                      setBufferKm(r.bufferKm);
                      setGroup(r.group);
                    }}
                    className="min-w-0 flex-1 truncate text-left text-xs text-foreground hover:text-brand"
                  >
                    {routeName(r)}
                  </button>
                  <button
                    onClick={() => setRouteAlerts(r.id, !r.alerts)}
                    aria-label={r.alerts ? `Turn off alerts for ${routeName(r)}` : `Turn on alerts for ${routeName(r)}`}
                    title={r.alerts ? "Alerts on" : "Alerts off"}
                    className={clsx("shrink-0", r.alerts ? "text-brand" : "text-muted hover:text-foreground")}
                  >
                    {r.alerts ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => removeRoute(r.id)}
                    aria-label={`Remove ${routeName(r)}`}
                    className="shrink-0 text-muted hover:text-critical"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(from || to) && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Select
              label="Distance from road"
              value={String(bufferKm)}
              onChange={(v) => setBufferKm(Number(v))}
              options={BUFFER_OPTIONS_KM.map((km) => ({ value: String(km), label: `${km} km` }))}
            />
            <Select
              label="Reported in"
              value={String(windowHours)}
              onChange={(v) => setWindowHours(Number(v))}
              options={WINDOW_OPTIONS_HOURS.map((h) => ({
                value: String(h),
                label: h >= 48 ? `Last ${h / 24} days` : `Last ${h} hours`,
              }))}
            />
            <Select
              label="Show"
              value={group}
              onChange={(v) => setGroup(v as RouteIncidentGroup)}
              options={(Object.keys(ROUTE_GROUPS) as RouteIncidentGroup[]).map((g) => ({
                value: g,
                label: ROUTE_GROUPS[g].label,
              }))}
            />
          </div>
        )}

        {route.status === "loading" && <p className="mt-5 text-sm text-muted">Finding the route…</p>}
        {route.status === "error" && (
          <p className="mt-5 rounded-lg border border-high/40 bg-high/10 px-3 py-2 text-sm text-high">{route.message}</p>
        )}

        {geometry && (
          <div className="mt-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-foreground">
                  {formatKm(geometry.distanceKm)} by road · about {formatDuration(geometry.durationMin)}
                </p>
                {routeCounties.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-muted">Through {routeCounties.join(", ")}</p>
                )}
              </div>
              {mounted && (
                <button
                  onClick={saved ? () => removeRoute(saved.id) : onSave}
                  className={clsx(
                    "flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium",
                    saved ? "border-brand/50 text-brand" : "border-border text-foreground hover:border-brand/50"
                  )}
                >
                  <Bookmark className={clsx("h-3.5 w-3.5", saved && "fill-current")} />
                  {saved ? "Saved" : "Save & alert me"}
                </button>
              )}
            </div>
            {saved?.alerts && (
              <p className="mt-1.5 text-[11px] text-muted">
                You&apos;ll get an alert when a new incident is reported along this route while Deckwatch is open
                in a tab, and a browser notification if you&apos;ve allowed them.
              </p>
            )}

            {!ready ? (
              <p className="mt-5 text-sm text-muted">Loading live incidents…</p>
            ) : (
              <>
                <h2 className="mt-5 text-sm font-semibold text-foreground">
                  Along your route{" "}
                  <span className="font-normal text-muted">
                    · {matches.along.length} in the last {windowLabel}
                  </span>
                </h2>
                {matches.along.length === 0 ? (
                  <p className="mt-2 rounded-lg bg-surface px-3 py-3 text-xs text-muted">
                    No incidents have been placed within {bufferKm} km of this route in the last {windowLabel}.
                  </p>
                ) : (
                  <ol className="mt-2 space-y-2">
                    {matches.along.map((m) => (
                      <li key={m.incident.id} id={`route-incident-${m.incident.id}`}>
                        <RouteIncidentCard
                          match={m}
                          routeKm={geometry.distanceKm}
                          active={m.incident.id === selectedId}
                          onSelect={() => setSelectedId(m.incident.id === selectedId ? null : m.incident.id)}
                        />
                      </li>
                    ))}
                  </ol>
                )}

                {matches.inCounties.length > 0 && (
                  <div className="mt-6">
                    <h2 className="text-sm font-semibold text-foreground">
                      In counties you pass through{" "}
                      <span className="font-normal text-muted">· {matches.inCounties.length}</span>
                    </h2>
                    <p className="mt-0.5 text-[11px] text-muted">
                      These reports name only the county, so they may be nowhere near your road.
                    </p>
                    <ul className="mt-2 space-y-1">
                      {countyList.map((incident) => (
                        <li key={incident.id}>
                          <IncidentListItem
                            incident={incident}
                            onClick={() => focus({ kind: "incident", value: incident.id })}
                          />
                        </li>
                      ))}
                    </ul>
                    {matches.inCounties.length > COUNTY_LEVEL_PREVIEW && (
                      <button
                        onClick={() => setShowAllCounty((v) => !v)}
                        className="mt-1.5 text-[11px] font-medium text-brand hover:underline"
                      >
                        {showAllCounty ? "Show fewer" : `Show all ${matches.inCounties.length}`}
                      </button>
                    )}
                  </div>
                )}

                <p className="mt-6 flex gap-2 rounded-lg border border-border px-3 py-2.5 text-[11px] leading-relaxed text-muted">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    No reports doesn&apos;t mean a route is safe. Deckwatch only knows what Kenyan newsrooms have
                    reported and where it could place them. Check official sources before you travel.
                  </span>
                </p>
              </>
            )}
          </div>
        )}

        <p className="mt-6 text-[10px] text-muted/80">
          Driving routes by OSRM, © OpenStreetMap contributors. Place names © GeoNames (CC BY 4.0).
        </p>
      </section>
    </div>
  );
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-foreground focus:border-brand/60 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
