import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getMapModel } from '../services/wayfinding.service';
import MapViewport from '../components/map/MapViewport';

// MPM inspector — the map rendered purely from the Map Presentation Model, with
// the navigation graph layer shown for debugging.
function MapModelPage() {
  const { floorId } = useParams();
  const [state, setState] = useState({ loading: true, error: null, mpm: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mpm = await getMapModel(floorId);
        if (alive) setState({ loading: false, error: null, mpm });
      } catch (e) {
        if (alive) setState({ loading: false, error: e.message || 'Failed to load map model', mpm: null });
      }
    })();
    return () => { alive = false; };
  }, [floorId]);

  if (state.loading) return <main className="screen"><div className="brand">Atlas</div><p className="hint">Loading map model…</p></main>;
  if (state.error) return <main className="screen"><div className="brand">Atlas</div><p className="hint">{state.error}</p></main>;

  const c = (state.mpm && state.mpm.metadata && state.mpm.metadata.counts) || {};
  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-sm">Atlas</span>
        <span className="hint">Map Model · {c.rooms} rooms · {c.walls} walls · {c.openings} openings · {c.labels} labels</span>
      </header>
      <div className="plan-wrap">
        <MapViewport mpm={state.mpm} initialVisibility={{ graph: true }} />
      </div>
    </div>
  );
}
export default MapModelPage;
