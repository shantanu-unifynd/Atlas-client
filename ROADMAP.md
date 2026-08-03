# Atlas-client — Visitor Wayfinding Web App

Separate web app (React + Vite) for visitors. Embedded into an existing production
web app via **iframe** (config by URL params + a postMessage bridge), and also
openable directly via QR/link. Talks to the Atlas backend API.

## Parts

- **C0 — Foundation**: Vite + React, mobile-first, iframe-ready (URL-param
  config), API client, routing. Runs + builds. (No 3D yet.)
- **C1 — 2D wayfinding**: load a READY floor's plan + graph -> destination directory
  (search shops from node labels) -> manual start + destination -> compute route
  (existing Dijkstra) -> draw the path on the 2D plan. Reuses existing endpoints.
- **C2 — 3D experience**: add three + @react-three/fiber + @react-three/drei; plan
  as a textured 3D floor -> glowing route ribbon -> camera fly-through along the path.
- **C3 — Embed + polish**: iframe URL params (?to=), postMessage bridge (route
  events), frame-ancestors CSP, responsive; search UX, loading/empty/error, optional PWA.
- **C4 — Deploy + integrate**: static host, VITE_API_BASE_URL, CORS/CSP for the host
  domain, the <iframe> snippet + QR links.

## Later (post client-v1)
Dedicated public wayfinding API (replace reuse-of-admin-endpoints; backend proposal),
live positioning ("you are here"), multi-floor, accessibility (step-free),
turn-by-turn, full-3D building.

## Run
```
npm install
npm run dev     # http://localhost:5174
```
Backend must be running (admin API, default http://localhost:5000/api).
