import { api } from './api';
import { USE_MOCK, getMockMapModel, computeMockRoute } from '../mock';

export async function computeRoute(graphId, originNodeId, destinationNodeId) {
  if (USE_MOCK) return computeMockRoute(graphId, originNodeId, destinationNodeId);
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
//
// When the mock layer is enabled (this decoupled frontend build) the floor is
// served from a local fixture instead — same shape, no backend.
export async function getMapModel(floorId) {
  if (USE_MOCK) return getMockMapModel(floorId);
  const { data: model } = await api.get(`/floors/${floorId}/map-model`, { params: { published: true } });
  return model.data;
}
