"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { LocateFixed, MapPin, X } from "lucide-react";
import clsx from "clsx";
import { HOTSPOTS } from "@/lib/data/hotspots";
import type { RoutePlace } from "@/lib/route-watch";

interface Candidate extends RoutePlace {
  kind: "town" | "local";
}

const MAX_SUGGESTIONS = 8;

// Loaded once per page view and shared by both pickers: ~75 KB gzipped of
// towns, villages and estates (scripts/build-places.py). Curated hotspots go
// first so "Nairobi CBD"-style names people actually type are found.
let placesPromise: Promise<Candidate[]> | null = null;

function loadPlaces(): Promise<Candidate[]> {
  placesPromise ??= fetch("/data/route-places.json")
    .then((r) => r.json() as Promise<{ places: [string, string, number, number, "town" | "local"][] }>)
    .then(({ places }) => [
      // Roads and wide regions aren't somewhere you set off from.
      ...HOTSPOTS.filter((h) => !/road|corridor|delta|highlands|hills|forest|creek|turkana central/i.test(h.name)).map(
        (h): Candidate => ({ name: h.name, county: h.county, lat: h.lat, lng: h.lng, kind: "local" })
      ),
      ...places.map(([name, county, lat, lng, kind]): Candidate => ({ name, county, lat, lng, kind })),
    ])
    .catch(() => {
      placesPromise = null; // let the next focus retry
      return [];
    });
  return placesPromise;
}

function rank(places: Candidate[], query: string): Candidate[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: Candidate[] = [];
  const contains: Candidate[] = [];
  const seen = new Set<string>();
  for (const p of places) {
    const name = p.name.toLowerCase();
    const key = `${name}|${p.county}`;
    if (seen.has(key)) continue;
    if (name.startsWith(q)) starts.push(p);
    else if (name.includes(q) || `${name} ${p.county?.toLowerCase()}`.includes(q)) contains.push(p);
    else continue;
    seen.add(key);
  }
  // Towns before villages of the same name: "Thika" means the town.
  const byKind = (a: Candidate, b: Candidate) => Number(a.kind !== "town") - Number(b.kind !== "town");
  return [...starts.sort(byKind), ...contains.sort(byKind)].slice(0, MAX_SUGGESTIONS);
}

export function PlacePicker({
  label,
  value,
  onChange,
  allowMyLocation = false,
}: {
  label: string;
  value: RoutePlace | null;
  onChange: (place: RoutePlace | null) => void;
  allowMyLocation?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<Candidate[]>([]);
  const [active, setActive] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => rank(places, query), [places, query]);

  useEffect(() => {
    if (open && places.length === 0) void loadPlaces().then(setPlaces);
  }, [open, places.length]);

  const choose = (place: RoutePlace) => {
    onChange(place);
    setQuery("");
    setOpen(false);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      setLocateError("This browser can't share its location.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // Rounded to ~100 m: enough to route from, and the URL this ends up
        // in may be shared.
        choose({
          name: "My location",
          county: null,
          lat: Math.round(pos.coords.latitude * 1e3) / 1e3,
          lng: Math.round(pos.coords.longitude * 1e3) / 1e3,
        });
      },
      () => {
        setLocating(false);
        setLocateError("Couldn't get your location. Type a place instead.");
      },
      { timeout: 10_000, maximumAge: 5 * 60_000 }
    );
  };

  if (value) {
    return (
      <div>
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">{label}</span>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface py-1 pl-3 pr-1 md:py-2 md:pr-3">
          <MapPin className="h-4 w-4 shrink-0 text-brand" />
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">
            {value.name}
            {value.county && <span className="text-muted"> · {value.county}</span>}
          </span>
          <button
            onClick={() => {
              onChange(null);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            aria-label={`Change ${label.toLowerCase()}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center text-muted hover:text-foreground md:h-auto md:w-auto"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const listId = `${id}-list`;
  return (
    <div className="relative">
      <label htmlFor={id} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && suggestions[active] ? `${id}-opt-${active}` : undefined}
          autoComplete="off"
          placeholder="Town, estate or village"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && suggestions[active]) {
              e.preventDefault();
              choose(suggestions[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          // 16px on phones: iOS zooms the page into any smaller input.
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-base text-foreground placeholder:text-muted/70 focus:border-brand/60 focus:outline-none md:h-auto md:py-2 md:text-sm"
        />
        {allowMyLocation && (
          <button
            onClick={useMyLocation}
            disabled={locating}
            aria-label="Use my location"
            title="Use my location"
            className="flex w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:text-foreground disabled:opacity-50 md:w-auto md:px-2.5"
          >
            <LocateFixed className={clsx("h-4 w-4", locating && "animate-pulse text-brand")} />
          </button>
        )}
      </div>
      {locateError && <p className="mt-1 text-[11px] text-high">{locateError}</p>}
      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-[600] mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-surface-raised py-1 shadow-lg shadow-black/40"
        >
          {suggestions.map((p, i) => (
            <li
              key={`${p.name}|${p.county}|${p.lat}`}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(p);
              }}
              onMouseEnter={() => setActive(i)}
              className={clsx(
                "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2.5 text-sm md:py-1.5",
                i === active ? "bg-brand/10 text-foreground" : "text-foreground/90"
              )}
            >
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-[11px] text-muted">
                {p.county}
                {p.kind === "town" ? " · town" : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
