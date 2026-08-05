import { api } from './api';

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
