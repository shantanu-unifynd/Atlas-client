import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  getFloorGraph,
  getNodes,
  getBlueprintFileUrl,
  getBlueprintSvg,
  computeRoute,
} from '../services/wayfinding.service';
import PlanView from '../components/PlanView';

// C1 — 2D wayfinding: load a READY floor's plan + graph, let the visitor pick a
// start and destination, compute the route and draw it on the plan.
function WayfindingPage() {
  const { buildingId, floorId } = useParams();
  const [params] = useSearchParams();

  const [load, setLoad] = useState({ loading: true, error: null, graph: null, nodes: [], svg: null });
  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState('');
  const [routePath, setRoutePath] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const graph = await getFloorGraph(floorId);
        if (!graph) throw new Error('This floor is not ready for navigation yet.');
        const [nodes, fileUrl] = await Promise.all([
          getNodes(graph.id),
          getBlueprintFileUrl(buildingId, floorId),
        ]);
        const svg = fileUrl ? await getBlueprintSvg(fileUrl) : null;
        if (alive) setLoad({ loading: false, error: null, graph, nodes, svg });
      } catch (e) {
        if (alive) setLoad({ loading: false, error: e.message || 'Failed to load floor', graph: null, nodes: [], svg: null });
      }
    })();
    return () => {
      alive = false;
    };
  }, [buildingId, floorId]);

  const nodes = load.nodes;
  const options = useMemo(
    () => [...nodes].sort((a, b) => (a.metadata?.label || '').localeCompare(b.metadata?.label || '')),
    [nodes]
  );

  // Deep-link a destination via ?to=<label> (host app / QR).
  useEffect(() => {
    const to = params.get('to');
    if (!to || !nodes.length) return;
    const match = nodes.find((n) => (n.metadata?.label || '').toLowerCase() === to.toLowerCase());
    if (match) setDestId(match.id);
  }, [params, nodes]);

  async function findRoute() {
    if (!originId || !destId || !load.graph) return;
    setComputing(true);
    try {
      const res = await computeRoute(load.graph.id, originId, destId);
      setRoutePath(res.path || []);
      setRouteInfo({ hops: Math.max((res.path || []).length - 1, 0), cost: res.totalCost });
    } catch {
      setRoutePath([]);
      setRouteInfo({ error: 'No route found between these points.' });
    } finally {
      setComputing(false);
    }
  }

  if (load.loading) {
    return (
      <main className="screen">
        <div className="brand">Atlas</div>
        <p className="hint">Loading floor…</p>
      </main>
    );
  }

  if (load.error) {
    return (
      <main className="screen">
        <div className="brand">Atlas</div>
        <p className="hint">{load.error}</p>
      </main>
    );
  }

  const labelOf = (id) => nodes.find((n) => n.id === id)?.metadata?.label;

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-sm">Atlas</span>
        <span className="hint">Find your way</span>
      </header>

      <div className="plan-wrap">
        {load.svg ? (
          <PlanView svg={load.svg} nodes={nodes} routePath={routePath} originId={originId} destId={destId} />
        ) : (
          <p className="hint">No floor plan available.</p>
        )}
      </div>

      {routeInfo && (
        <div className="routeinfo">
          {routeInfo.error
            ? routeInfo.error
            : `To ${labelOf(destId) || ''} · ${routeInfo.hops} stop${routeInfo.hops === 1 ? '' : 's'}`}
        </div>
      )}

      <div className="controls">
        <select value={originId} onChange={(e) => setOriginId(e.target.value)} aria-label="Start">
          <option value="">From…</option>
          {options.map((n) => (
            <option key={n.id} value={n.id}>{n.metadata?.label || n.id.slice(0, 6)}</option>
          ))}
        </select>
        <select value={destId} onChange={(e) => setDestId(e.target.value)} aria-label="Destination">
          <option value="">To…</option>
          {options.map((n) => (
            <option key={n.id} value={n.id}>{n.metadata?.label || n.id.slice(0, 6)}</option>
          ))}
        </select>
        <button onClick={findRoute} disabled={!originId || !destId || computing}>
          {computing ? '…' : 'Go'}
        </button>
      </div>
    </div>
  );
}

export default WayfindingPage;
