import { api } from './api';

// Newest READY graph for a floor (falls back to the newest graph of any status
// so a floor mid-setup still previews). Returns null if the floor has none.
export async function getFloorGraph(floorId) {
  const { data: graphs } = await api.get('/navigation-graphs', { params: { floorId } });
  if (!graphs || graphs.length === 0) return null;
  const ready = graphs.filter((g) => g.status === 'READY');
  const pool = ready.length ? ready : graphs;
  return pool[pool.length - 1];
}

export async function getNodes(graphId) {
  const { data } = await api.get(`/navigation-graphs/${graphId}/nodes`);
  return data;
}

// Latest blueprint import's fileUrl (the plan SVG endpoint), or null.
export async function getBlueprintFileUrl(buildingId, floorId) {
  const { data: imports } = await api.get(`/buildings/${buildingId}/floors/${floorId}/blueprint-imports`);
  if (!imports || imports.length === 0) return null;
  return imports[imports.length - 1].fileUrl;
}

// The /file endpoint returns raw SVG text (not the {success,data} envelope), so
// api.get's already-unwrapped return value IS the markup. Strip the leading /api
// since apiClient's baseURL already ends in /api.
export async function getBlueprintSvg(fileUrl) {
  return api.get(fileUrl.replace(/^\/api/, ''));
}

export async function computeRoute(graphId, originNodeId, destinationNodeId) {
  const { data } = await api.post(`/navigation-graphs/${graphId}/routes/compute`, {
    originNodeId,
    destinationNodeId,
  });
  return data;
}

// C3-01: consume ONLY the PUBLISHED Map Presentation Model — visitors never see
// unpublished admin drafts. Returns the render payload (model.data), unchanged
// shape. A floor with no published version responds 404, which the page turns
// into a friendly "map not yet published" empty state.
export async function getMapModel(floorId) {
  const { data: model } = await api.get(`/floors/${floorId}/map-model`, { params: { published: true } });
  return model.data;
}
