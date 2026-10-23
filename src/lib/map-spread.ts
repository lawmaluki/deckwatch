/** Laying out markers that share one point so each stays visible and
 * clickable. Many incidents are known only to their county and sit on its
 * centre; drawn as-is, five Nairobi reports would read as one dot. Pure, so
 * it is testable without Leaflet: the layer converts these pixel offsets to
 * map positions at the current zoom. */

/** Gap between neighbouring dots on a ring, in screen pixels: a 16 px dot
 * plus breathing room. */
const DOT_SPACING_PX = 20;
const MIN_RING_RADIUS_PX = 14;

/** Groups items that sit on the same point (to ~11 m), keeping input order. */
export function groupByPoint<T extends { lat: number; lng: number }>(items: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

/** Pixel offsets for `n` dots sharing a point: none for one, otherwise a ring
 * wide enough that neighbours don't overlap, starting at twelve o'clock. */
export function ringOffsets(n: number): [number, number][] {
  if (n <= 1) return [[0, 0]];
  const radius = Math.max(MIN_RING_RADIUS_PX, (DOT_SPACING_PX * n) / (2 * Math.PI));
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [Math.round(radius * Math.cos(angle)), Math.round(radius * Math.sin(angle))];
  });
}
