import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getMapModel, computeRoute } from '../services/wayfinding.service';
import MapViewport from '../components/map/MapViewport';

// C2-01 — MPM-driven wayfinding. The floor is rendered ENTIRELY from the Map
// Presentation Model (rooms/walls/labels/graph); the visitor picks start +
// destination and the computed route is overlaid on top.
function WayfindingPage() {
  const { floorId } = useParams();
  const [params] = useSearchParams();

  const [load, setLoad] = useState({ loading: true, error: null, mpm: null });
  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState('');
  const [routePath, setRoutePath] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mpm = await getMapModel(floorId);
        if (alive) setLoad({ loading: false, error: null, mpm });
      } catch (e) {
        if (alive) setLoad({ loading: false, error: e.message || 'Failed to load map', mpm: null });
      }
    })();
    return () => { alive = false; };
  }, [floorId]);

  const graph = load.mpm && load.mpm.graph;
  const nodes = (graph && graph.nodes) || [];
  const options = useMemo(
    () => [...nodes].sort((a, b) => (a.label || '').localeCompare(b.label || '')),
    [nodes]
  );

  useEffect(() => {
    const to = params.get('to');
    if (!to || !nodes.length) return;
    const match = nodes.find((n) => (n.label || '').toLowerCase() === to.toLowerCase());
    if (match) setDestId(match.id);
  }, [params, nodes]);

  async function findRoute() {
    if (!originId || !destId || !graph) return;
    setComputing(true);
    try {
      const res = await computeRoute(graph.navigationGraphId, originId, destId);
      setRoutePath(res.path || []);
      setRouteInfo({ hops: Math.max((res.path || []).length - 1, 0) });
    } catch {
      setRoutePath([]);
      setRouteInfo({ error: 'No route found between these points.' });
    } finally {
      setComputing(false);
    }
  }

  if (load.loading) return <main className="screen"><div className="brand">Atlas</div><p className="hint">Loading map…</p></main>;
  if (load.error) return <main className="screen"><div className="brand">Atlas</div><p className="hint">{load.error}</p></main>;

  const labelOf = (id) => nodes.find((n) => n.id === id)?.label;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-sm">Atlas</span>
        <span className="hint">Find your way</span>
      </header>

      <div className="plan-wrap">
        <MapViewport mpm={load.mpm} routePath={routePath} />
      </div>

      {routeInfo && (
        <div className="routeinfo">
          {routeInfo.error ? routeInfo.error : `To ${labelOf(destId) || ''} · ${routeInfo.hops} stop${routeInfo.hops === 1 ? '' : 's'}`}
        </div>
      )}

      <div className="controls">
        <select value={originId} onChange={(e) => setOriginId(e.target.value)} aria-label="Start">
          <option value="">From…</option>
          {options.map((n) => <option key={n.id} value={n.id}>{n.label || n.id.slice(0, 6)}</option>)}
        </select>
        <select value={destId} onChange={(e) => setDestId(e.target.value)} aria-label="Destination">
          <option value="">To…</option>
          {options.map((n) => <option key={n.id} value={n.id}>{n.label || n.id.slice(0, 6)}</option>)}
        </select>
        <button onClick={findRoute} disabled={!originId || !destId || computing}>{computing ? '…' : 'Go'}</button>
      </div>
    </div>
  );
}
export default WayfindingPage;
