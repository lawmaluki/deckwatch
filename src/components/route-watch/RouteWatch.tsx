"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { FeatureCollection } from "geojson";
import {
  ArrowUpDown,
  Bell,
  BellOff,
  Bookmark,
  Car,
  Footprints,
  Info,
  Maximize2,
  Minimize2,
  Navigation,
  Pencil,
  Square,
  Trash2,
} from "lucide-react";
import clsx from "clsx";
import { PlacePicker } from "@/components/route-watch/PlacePicker";
import { RouteIncidentCard } from "@/components/route-watch/RouteIncidentCard";
import { IncidentListItem } from "@/components/incidents/IncidentListItem";
import { useIncidents } from "@/hooks/useIncidents";
import { useMapFocus } from "@/hooks/useMapFocus";
import { useRouteTrip } from "@/hooks/useRouteTrip";
import { USE_API } from "@/lib/incidents-source";
import { useAppStore } from "@/store/useAppStore";
import {
  BUFFER_OPTIONS_KM,
  countiesAlongRoute,
  DEFAULT_WINDOW_HOURS,
  formatKm,
  matchRoute,
  POPULAR_ROUTES,
  prepareRoute,
  ROUTE_GROUPS,
  routeName,
  SAVED_ROUTE_TOLERANCE_KM,
  simplifyRoute,
  TRAVEL_MODES,
  WINDOW_OPTIONS_HOURS,
  type RouteGeometry,
  type RouteIncidentGroup,
  type RoutePlace,
  type SavedRoute,
  type TravelMode,
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
  | { status: "ready"; routes: RouteGeometry[] }
  | { status: "error"; message: string };

/** A finished request, tagged with what was asked: the state shown is derived
 * from whether it answers the current from/to/mode, so nothing has to be
 * reset when they change. */
type RouteResult = { query: string } & ({ routes: RouteGeometry[] } | { error: string });

function routeQuery(from: RoutePlace | null, to: RoutePlace | null, mode: TravelMode): string | null {
  if (!from || !to) return null;
  // mode is always sent: responses are cached at the edge for a day, and
  // URLs without it still hold the older single-route answer.
  return `from=${from.lat.toFixed(4)},${from.lng.toFixed(4)}&to=${to.lat.toFixed(4)},${to.lng.toFixed(4)}&mode=${mode}`;
}

export interface RouteWatchInitial {
  from: RoutePlace | null;
  to: RoutePlace | null;
  bufferKm: number | null;
  mode: TravelMode | null;
}

/** Shared form for "Name@lat,lng" in the URL, so a route can be linked to. */
export function encodePlace(p: RoutePlace): string {
  return `${p.name}@${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
}

function routeId(from: RoutePlace, to: RoutePlace, mode: TravelMode): string {
  // Driving ids keep their original form, so routes saved before walking was
  // offered are still recognised.
  const id = `${from.lat.toFixed(3)},${from.lng.toFixed(3)}>${to.lat.toFixed(3)},${to.lng.toFixed(3)}`;
  return mode === "driving" ? id : `${mode}:${id}`;
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
  const [mode, setMode] = useState<TravelMode>(initial.mode ?? "driving");
  const [bufferKm, setBufferKm] = useState<number>(
    initial.bufferKm ?? TRAVEL_MODES[initial.mode ?? "driving"].defaultBufferKm
  );
  // Which of the route options is shown, for the query it was picked on.
  const [picked, setPicked] = useState<{ query: string; index: number } | null>(null);
  const [windowHours, setWindowHours] = useState<number>(DEFAULT_WINDOW_HOURS);
  const [group, setGroup] = useState<RouteIncidentGroup>("all");
  const [result, setResult] = useState<RouteResult | null>(null);
  const [counties, setCounties] = useState<FeatureCollection | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAllCounty, setShowAllCounty] = useState(false);
  // Phones only (md: always shows the full form and a full-height map): the
  // route being edited, so the form folds back to one line as soon as a new
  // route is chosen, and whether the map has been enlarged.
  const [editingQuery, setEditingQuery] = useState<string | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);

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
  const query = routeQuery(from, to, mode);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/route?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? "Couldn't find a route.");
        setResult({ query, routes: (body as { routes: RouteGeometry[] }).routes });
      })
      .catch((err: Error) => {
        if (err.name !== "AbortError") setResult({ query, error: err.message });
      });
    return () => controller.abort();
  }, [query]);

  const compact = query !== null && editingQuery !== query;

  const route: RouteState =
    query === null
      ? { status: "idle" }
      : result?.query !== query
        ? { status: "loading" }
        : "routes" in result
          ? { status: "ready", routes: result.routes }
          : { status: "error", message: result.error };

  // Keep the URL shareable. history.replaceState, not router.replace: the page
  // has nothing to re-render on the server for a change of route.
  useEffect(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", encodePlace(from));
    if (to) params.set("to", encodePlace(to));
    if (mode !== "driving") params.set("mode", mode);
    if (bufferKm !== TRAVEL_MODES[mode].defaultBufferKm) params.set("buffer", String(bufferKm));
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [from, to, bufferKm, mode]);

  const routes = route.status === "ready" ? route.routes : null;
  const routeIndex = picked && picked.query === query && routes && picked.index < routes.length ? picked.index : 0;
  const geometry = routes ? routes[routeIndex] : null;
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

  // Incidents along each option, to compare them by. Counties aren't needed:
  // only incidents placed on the road are counted.
  const optionCounts = useMemo(
    () =>
      routes && routes.length > 1 && ready
        ? routes.map(
            (r) =>
              matchRoute(prepareRoute(r.coords), snapshot.incidents, {
                bufferKm,
                windowHours,
                group,
                nowMs: snapshot.referenceTime.getTime(),
                counties: [],
              }).along.length
          )
        : null,
    [routes, ready, snapshot, bufferKm, windowHours, group]
  );

  const trip = useRouteTrip(prepared, query && `${query}#${routeIndex}`, matches.along, mode);
  const shownAlong = trip.progress ? trip.progress.ahead : matches.along;

  const changeMode = (next: TravelMode) => {
    if (next === mode) return;
    // Follow the new mode's default corridor unless the reader chose one.
    if (bufferKm === TRAVEL_MODES[mode].defaultBufferKm) setBufferKm(TRAVEL_MODES[next].defaultBufferKm);
    setMode(next);
  };

  const savedId = from && to ? routeId(from, to, mode) : null;
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
      mode,
    };
    saveRoute(route);
  };

  const windowLabel = windowHours >= 48 ? `${windowHours / 24} days` : `${windowHours} hours`;
  const countyList = showAllCounty ? matches.inCounties : matches.inCounties.slice(0, COUNTY_LEVEL_PREVIEW);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* On a phone the map waits for a route (before one there is nothing on
          it worth a third of the screen) and starts compact so the list stays
          in view; it can be enlarged. dvh, not vh: mobile browsers' collapsing
          toolbars make 100vh taller than the visible page. */}
      <div
        className={clsx(
          "relative shrink-0 md:order-last md:block md:h-full md:flex-1",
          query === null ? "hidden" : mapExpanded ? "h-[62dvh]" : "h-[30dvh]"
        )}
      >
        <RouteMap
          coords={geometry?.coords ?? null}
          alternatives={routes ? routes.map((r, i) => (i === routeIndex ? null : r.coords)) : []}
          onPickRoute={(i) => query && setPicked({ query, index: i })}
          position={trip.position}
          from={from}
          to={to}
          matches={matches.along}
          selectedId={selectedId}
          onSelect={(id) => {
            setSelectedId(id);
            document.getElementById(`route-incident-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }}
        />
        <button
          onClick={() => setMapExpanded((v) => !v)}
          aria-label={mapExpanded ? "Make the map smaller" : "Make the map bigger"}
          className="glass-panel absolute bottom-7 right-2 z-[500] flex h-10 w-10 items-center justify-center rounded-lg text-foreground md:hidden"
        >
          {mapExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      <section
        aria-label="Route Watch"
        className="min-h-0 flex-1 overflow-y-auto border-border px-4 py-4 md:w-[420px] md:flex-none md:border-r"
      >
        <h1 className={clsx("text-lg font-semibold text-foreground", compact && "sr-only md:not-sr-only")}>
          Route Watch
        </h1>
        <p className={clsx("mt-0.5 text-xs text-muted", compact && "hidden md:block")}>
          Before you leave, see what has been reported along your route.
        </p>

        {compact && from && to && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface py-1 pl-3 pr-1 md:hidden">
            {mode === "walking" ? (
              <Footprints className="h-4 w-4 shrink-0 text-muted" aria-label="Walking" />
            ) : (
              <Car className="h-4 w-4 shrink-0 text-muted" aria-label="Driving" />
            )}
            <p className="min-w-0 flex-1 truncate text-sm text-foreground">
              {from.name} <span className="text-muted">&rarr;</span> {to.name}
            </p>
            <button
              onClick={() => setEditingQuery(query)}
              className="flex h-10 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium text-brand"
            >
              <Pencil className="h-3.5 w-3.5" /> Change
            </button>
          </div>
        )}

        <div className={clsx("mt-4 space-y-2", compact && "hidden md:block")}>
          <div role="radiogroup" aria-label="Travel mode" className="flex gap-1.5">
            {(Object.keys(TRAVEL_MODES) as TravelMode[]).map((m) => {
              const Icon = m === "driving" ? Car : Footprints;
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => changeMode(m)}
                  className={clsx(
                    "flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium md:h-8",
                    mode === m ? "border-brand/60 bg-brand/10 text-brand" : "border-border bg-surface text-muted hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {TRAVEL_MODES[m].label}
                </button>
              );
            })}
          </div>
          <PlacePicker label="Starting point" value={from} onChange={setFrom} allowMyLocation />
          <div className="flex justify-end">
            <button
              onClick={() => {
                setFrom(to);
                setTo(from);
              }}
              disabled={!from && !to}
              className="-my-1 flex h-9 items-center gap-1 px-1 text-xs text-muted hover:text-foreground disabled:opacity-40 md:h-auto md:text-[11px]"
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
                  className="rounded-full border border-border bg-surface px-3 py-2 text-xs text-foreground/90 hover:border-brand/50 md:px-2.5 md:py-1"
                >
                  {routeName(r)}
                </button>
              ))}
            </div>
          </div>
        )}

        {mounted && savedRoutes.length > 0 && (
          <div className={clsx("mt-4", compact && "hidden md:block")}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">Your routes</p>
            <ul className="space-y-1">
              {savedRoutes.map((r) => (
                <li key={r.id} className="flex items-center gap-1 rounded-lg bg-surface pl-2.5 md:gap-2 md:py-1.5 md:pr-2.5">
                  <button
                    onClick={() => {
                      setFrom(r.from);
                      setTo(r.to);
                      setMode(r.mode ?? "driving");
                      setBufferKm(r.bufferKm);
                      setGroup(r.group);
                    }}
                    className="min-h-10 min-w-0 flex-1 truncate text-left text-sm text-foreground hover:text-brand md:min-h-0 md:text-xs"
                  >
                    {routeName(r)}
                    {r.mode === "walking" && <span className="text-muted"> · walking</span>}
                  </button>
                  <button
                    onClick={() => setRouteAlerts(r.id, !r.alerts)}
                    aria-label={r.alerts ? `Turn off alerts for ${routeName(r)}` : `Turn on alerts for ${routeName(r)}`}
                    title={r.alerts ? "Alerts on" : "Alerts off"}
                    className={clsx(
                      "flex h-10 w-10 shrink-0 items-center justify-center md:h-auto md:w-auto",
                      r.alerts ? "text-brand" : "text-muted hover:text-foreground"
                    )}
                  >
                    {r.alerts ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => removeRoute(r.id)}
                    aria-label={`Remove ${routeName(r)}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center text-muted hover:text-critical md:h-auto md:w-auto"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(from || to) && (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:mt-4">
            <Select
              label="Within"
              value={String(bufferKm)}
              onChange={(v) => setBufferKm(Number(v))}
              options={BUFFER_OPTIONS_KM.map((km) => ({ value: String(km), label: `${km} km` }))}
            />
            <Select
              label="Reported"
              value={String(windowHours)}
              onChange={(v) => setWindowHours(Number(v))}
              options={WINDOW_OPTIONS_HOURS.map((h) => ({
                value: String(h),
                label: h >= 48 ? `Last ${h / 24} days` : `Last ${h} hours`,
              }))}
            />
            <Select
              className="col-span-2 sm:col-span-1"
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
                  {formatKm(geometry.distanceKm)} {mode === "walking" ? "on foot" : "by road"} · about{" "}
                  {formatDuration(geometry.durationMin)}
                </p>
                {routeCounties.length > 0 && (
                  <p className="mt-0.5 text-[11px] text-muted">Through {routeCounties.join(", ")}</p>
                )}
              </div>
              {mounted && (
                <button
                  onClick={saved ? () => removeRoute(saved.id) : onSave}
                  className={clsx(
                    "flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium md:h-auto md:px-2.5 md:py-1.5",
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
                in a tab. Allow browser notifications in Alerts to hear about it when you&apos;re on another tab
                too.
              </p>
            )}

            {routes && routes.length > 1 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
                  {routes.length} ways to go
                </p>
                <div role="radiogroup" aria-label="Route options" className="space-y-1.5">
                  {routes.map((r, i) => (
                    <button
                      key={i}
                      role="radio"
                      aria-checked={i === routeIndex}
                      onClick={() => query && setPicked({ query, index: i })}
                      className={clsx(
                        "flex min-h-10 w-full items-center justify-between gap-3 rounded-lg border px-3 py-1.5 text-left text-xs",
                        i === routeIndex ? "border-brand/60 bg-brand/10" : "border-border bg-surface hover:border-brand/40"
                      )}
                    >
                      <span className="text-foreground">
                        {i === 0 ? "Suggested" : `Option ${i + 1}`} · {formatKm(r.distanceKm)} · {formatDuration(r.durationMin)}
                      </span>
                      {optionCounts && (
                        <span className={clsx("shrink-0", optionCounts[i] > 0 ? "text-high" : "text-muted")}>
                          {optionCounts[i] === 0
                            ? "none reported"
                            : `${optionCounts[i]} incident${optionCounts[i] === 1 ? "" : "s"}`}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  Counts only incidents placed on each road. Fewer reports isn&apos;t the same as safer.
                </p>
              </div>
            )}

            {ready && (
              <div className="mt-4 rounded-lg border border-border bg-surface px-3 py-2.5">
                {!trip.active ? (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] leading-relaxed text-muted">
                      Travelling now? Follow your trip to see what&apos;s still ahead and get a warning before you
                      reach it. Keep this page open; your location stays on your device.
                    </p>
                    <button
                      onClick={trip.start}
                      className="flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-brand px-3 text-xs font-semibold text-black md:h-8"
                    >
                      <Navigation className="h-3.5 w-3.5" /> Start trip
                    </button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {!trip.position
                          ? "Finding your location…"
                          : !trip.progress?.onRoute
                            ? `You're ${formatKm(trip.progress?.offRouteKm ?? 0)} off this route`
                            : `km ${Math.round(trip.progress.alongKm)} of ${Math.round(geometry.distanceKm)}`}
                      </p>
                      <button
                        onClick={trip.stop}
                        className="flex h-10 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-foreground md:h-8"
                      >
                        <Square className="h-3 w-3" /> End trip
                      </button>
                    </div>
                    {trip.progress?.onRoute && (
                      <p className="mt-1 text-[11px] text-muted">
                        {trip.progress.ahead.length === 0
                          ? "Nothing reported on the road ahead."
                          : `Next: ${formatKm(Math.max(0, trip.progress.ahead[0].alongKm - trip.progress.alongKm))} ahead. You'll be warned ${formatKm(TRAVEL_MODES[mode].approachKm)} before each incident.`}
                      </p>
                    )}
                    {trip.error && <p className="mt-1 text-[11px] text-high">{trip.error}</p>}
                  </div>
                )}
                {trip.error && !trip.active && <p className="mt-1 text-[11px] text-high">{trip.error}</p>}
              </div>
            )}

            {!ready ? (
              <p className="mt-5 text-sm text-muted">Loading live incidents…</p>
            ) : (
              <>
                <h2 className="mt-5 text-sm font-semibold text-foreground">
                  {trip.progress ? "Ahead of you" : "Along your route"}{" "}
                  <span className="font-normal text-muted">
                    · {shownAlong.length} in the last {windowLabel}
                    {trip.progress && trip.progress.passed.length > 0 && `, ${trip.progress.passed.length} passed`}
                  </span>
                </h2>
                {shownAlong.length === 0 ? (
                  <p className="mt-2 rounded-lg bg-surface px-3 py-3 text-xs text-muted">
                    {trip.progress && matches.along.length > 0
                      ? "You've passed everything reported along this route."
                      : `No incidents have been placed within ${bufferKm} km of this route in the last ${windowLabel}.`}
                  </p>
                ) : (
                  <ol className="mt-2 space-y-2">
                    {shownAlong.map((m) => (
                      <li key={m.incident.id} id={`route-incident-${m.incident.id}`}>
                        <RouteIncidentCard
                          match={m}
                          routeKm={geometry.distanceKm}
                          aheadKm={trip.progress?.onRoute ? m.alongKm - trip.progress.alongKm : null}
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
                        className="mt-1 min-h-10 text-xs font-medium text-brand hover:underline md:min-h-0 md:text-[11px]"
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
          Routes by OSRM and FOSSGIS, © OpenStreetMap contributors. Place names © GeoNames (CC BY 4.0).
          Public transport routes aren&apos;t available.
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
  className,
}: {
  className?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className={clsx("block min-w-0", className)}>
      <span className="mb-1 block truncate text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // 16px on phones: iOS zooms the page into any smaller form control.
        className="h-10 w-full rounded-lg border border-border bg-surface px-2 text-base text-foreground focus:border-brand/60 focus:outline-none md:h-auto md:py-1.5 md:text-xs"
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
