"""Shrink public/data/kenya-counties.geojson for the browser.

Run against a freshly sourced boundary file:  python3 scripts/simplify-counties.py
It rewrites the file in place, so the unsimplified original lives in git
history rather than beside it.

At the default tolerance the worst-case vertex moves ~111 m: about 1.5 px at
the zoom the map flies to for an incident, and well under a pixel at the
country view it opens on. Borders here are a backdrop for the markers, so
that is not a detail anyone can see.

Douglas-Peucker is run per ring, but the points it keeps are pooled into one
global set and every ring is then rebuilt from that pool. A border shared by
two counties is the same coordinate sequence in both rings, so both keep the
same subset of it and the shared edge stays exactly coincident -- no slivers,
no gaps. The cost is a slightly weaker reduction than per-ring dropping.
"""
import json, sys

# Degrees. ~111 m; see the module docstring for why that is invisible here.
TOLERANCE = 0.001

def dp_keep(pts, tol):
    """Indices Douglas-Peucker keeps for this ring."""
    n = len(pts)
    if n < 3:
        return set(range(n))
    keep = {0, n - 1}
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        ax, ay = pts[i]; bx, by = pts[j]
        dx, dy = bx - ax, by - ay
        den = dx * dx + dy * dy
        worst, wi = -1.0, -1
        for k in range(i + 1, j):
            px, py = pts[k]
            if den == 0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / den
                t = 0.0 if t < 0 else (1.0 if t > 1 else t)
                ex, ey = ax + t * dx - px, ay + t * dy - py
                d = ex * ex + ey * ey
            if d > worst:
                worst, wi = d, k
        if worst > tol * tol:
            keep.add(wi)
            stack.append((i, wi)); stack.append((wi, j))
    return keep

def rings_of(geom):
    return geom['coordinates'] if geom['type'] == 'Polygon' else [r for p in geom['coordinates'] for r in p]

def simplify(doc, tol):
    pool = set()
    for f in doc['features']:
        for r in rings_of(f['geometry']):
            pts = [tuple(p) for p in r]
            for i in dp_keep(pts, tol):
                pool.add(pts[i])

    def rebuild(r):
        out = [tuple(p) for p in r if tuple(p) in pool]
        if len(out) < 4:                      # collapsed: keep the original
            return [tuple(p) for p in r]
        if out[0] != out[-1]:
            out.append(out[0])
        return out

    import copy
    nd = copy.deepcopy(doc)
    for f in nd['features']:
        g = f['geometry']
        if g['type'] == 'Polygon':
            g['coordinates'] = [rebuild(r) for r in g['coordinates']]
        else:
            g['coordinates'] = [[rebuild(r) for r in p] for p in g['coordinates']]
    return nd

def vcount(doc):
    return sum(len(r) for f in doc['features'] for r in rings_of(f['geometry']))

if __name__ == '__main__':
    import gzip
    src = sys.argv[1] if len(sys.argv) > 1 else 'public/data/kenya-counties.geojson'
    tol = float(sys.argv[2]) if len(sys.argv) > 2 else TOLERANCE
    doc = json.load(open(src))
    before = open(src, 'rb').read()
    out = simplify(doc, tol)

    assert len(out['features']) == len(doc['features']), 'feature count changed'
    assert all(f['properties'].get('name') for f in out['features']), 'county names lost'

    body = json.dumps(out, separators=(',', ':')).encode()
    open(src, 'wb').write(body)
    print(f"{src}: {len(before)/1024:.0f} -> {len(body)/1024:.0f} KB raw, "
          f"{len(gzip.compress(before,9))/1024:.0f} -> {len(gzip.compress(body,9))/1024:.0f} KB gzip, "
          f"{vcount(doc)} -> {vcount(out)} vertices")
