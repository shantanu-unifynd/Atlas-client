// Mock data layer. When enabled, the visitor app serves one hand-authored floor
// (Palladium UG) entirely client-side — no backend, no pipeline. Flip the flag off
// (VITE_USE_MOCK=false) to fall back to the real API with zero component changes.

import { palladiumUG } from './palladiumUG';
import { computePath } from './dijkstra';

// Default ON — this build is a decoupled frontend showcase. Set VITE_USE_MOCK=false
// in .env to hit the real backend instead.
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

const FLOORS = { ug: palladiumUG, 'palladium-ug': palladiumUG };

export function getMockMapModel(floorId) {
  const mpm = FLOORS[floorId] || palladiumUG;
  return Promise.resolve(mpm);
}

export function computeMockRoute(graphId, originNodeId, destinationNodeId) {
  // Only one floor is mocked; its graph id is fixed.
  return Promise.resolve(computePath(palladiumUG.graph, originNodeId, destinationNodeId));
}
