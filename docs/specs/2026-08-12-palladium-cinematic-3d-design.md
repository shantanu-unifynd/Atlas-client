# Palladium UG — Cinematic 3D Wayfinder (design)

Date: 2026-08-12 · Branch: `feat/palladium-cinematic-3d`

## Goal
Best-in-class version of the Atlas visitor app (Atlas-client), maxing map / interaction /
animation quality, on the Palladium Chennai Upper-Ground floor. Backend integration is
deferred; the floor is served from a local fixture so frontend work is fully decoupled.

## Approach (decisions)
- **Data: local fixture.** Author the Map Presentation Model (MPM) directly as
  `src/mock/palladiumUG.js` — no SVG, no pipeline, no backend. Faithful to the real PDF:
  units UG-1…UG-20 + Forever 21, a central concourse, escalator core, residential lobbies,
  entrances. Behind a flag so it drops into the real backend later unchanged.
- **Hero: cinematic 3D.** Elevate the existing react-three-fiber scene (`Floor3D.jsx`):
  premium materials + lighting, camera choreography, a flowing route ribbon, hover/select
  motion, refined labels. 2D (`MapViewport`) stays as a clean fallback.
- **Names:** real unit codes from the PDF (UG-1…), Forever 21 as the anchor. No invented
  tenants presented as fact.

## Data contract (from backend source read)
Visitor app consumes `model.data` from `getMapModel(floorId)` and `{path,totalCost}` from
`computeRoute(graphId, o, d)`. MPM shape:
- `coordinateSystem.bounds {minX,minY,maxX,maxY}` — required or nothing renders. Plan units,
  y-down. 3D maps plan (x,y) → world (x, height, -y), scale S.
- `rooms[] {id, polygon:[{x,y}], point, source, category, name}` (polygon ≥3 pts to draw)
- `walls[] {id, polyline}` · `openings[] {id, position, type}` · `labels[] {id, position, text, roomId}`
- `graph {navigationGraphId, nodes:[{id,position{x,y},label}], edges:[{id,source,target}]}`

## Components
- `src/mock/palladiumUG.js` — procedural MPM builder (rooms, labels, openings, graph).
- `src/mock/dijkstra.js` — local shortest-path over the graph (Euclidean weights).
- `src/mock/index.js` — flag + `getMockMapModel` / `computeMockRoute`.
- `wayfinding.service.js` — short-circuit to the mock when the flag is on.
- `LandingPage` / `App` — auto-enter `/visit/palladium/ug`.
- `Floor3D.jsx` — cinematic renderer rewrite (materials, lighting, camera, route, interaction).
- Chrome/CSS — luxury restyle of controls, search, turn-by-turn, top bar.

## Scope
In: the above on one Palladium UG floor, fully mocked. Out: multi-floor, live positioning,
real backend wiring, PDF→geometry skill, accessibility route variants.

## How we work
Build v1 → open in browser → iterate visually on the real app. Fast loop.
