import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getMapModel, computeRoute } from '../services/wayfinding.service';
import MapViewport from '../components/map/MapViewport';

// C3-02 — resolve a deep-link param to a node id. Matches by node id first, then
// falls back to a case-insensitive label match (so both id- and label-style links
// work). Returns null when nothing matches, so invalid ids are ignored gracefully.
function resolveNodeId(value, nodes) {
  if (!value) return null;
  const byId = nodes.find((n) => n.id === value);
  if (byId) return byId.id;
  const byLabel = nodes.find((n) => (n.label || '').toLowerCase() === value.toLowerCase());
  return byLabel ? byLabel.id : null;
}

// C2-01 — MPM-driven wayfinding. The floor is rendered ENTIRELY from the Map
// Presentation Model (rooms/walls/labels/graph); the visitor picks start +
// destination and the computed route is overlaid on top.
function WayfindingPage() {
  const { floorId } = useParams();
  const [params, setSearchParams] = useSearchParams();

  const [load, setLoad] = useState({ loading: true, error: null, mpm: null, notPublished: false });
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
        if (alive) setLoad({ loading: false, error: null, mpm, notPublished: false });
      } catch (e) {
        if (!alive) return;
        // C3-01: a floor with no published map returns 404 — that's an expected
        // "not yet published" empty state, not an error. Anything else is a real error.
        if (e.response?.status === 404) {
          setLoad({ loading: false, error: null, mpm: null, notPublished: true });
        } else {
          setLoad({ loading: false, error: e.response?.data?.message || e.message || 'Failed to load map', mpm: null, notPublished: false });
        }
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

  async function computeRouteFor(oId, dId) {
    if (!oId || !dId || !graph) return;
    setComputing(true);
    try {
      const res = await computeRoute(graph.navigationGraphId, oId, dId);
      setRoutePath(res.path || []);
      setRouteInfo({ hops: Math.max((res.path || []).length - 1, 0) });
    } catch {
      setRoutePath([]);
      setRouteInfo({ error: 'No route found between these points.' });
    } finally {
      setComputing(false);
    }
  }
  function findRoute() { computeRouteFor(originId, destId); }

  // C3-02 — deep link: once the published MPM's nodes are available, apply the
  // initial ?from / ?to (node id or label), auto-select both, and auto-compute the
  // route — identical to manual selection. Runs once per floor load; unmatched or
  // missing ids are skipped so manual selection stays fully usable.
  const deepLinkDone = useRef(false);
  const initialDeepLink = useRef({ from: params.get('from'), to: params.get('to') });
  useEffect(() => {
    if (deepLinkDone.current || !nodes.length) return;
    deepLinkDone.current = true;
    const fromId = resolveNodeId(initialDeepLink.current.from, nodes);
    const toId = resolveNodeId(initialDeepLink.current.to, nodes);
    if (fromId) setOriginId(fromId);
    if (toId) setDestId(toId);
    if (fromId && toId) computeRouteFor(fromId, toId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // C3-02 — keep the URL synced with the current selection (canonical node ids) so
  // a refresh restores the same route. Held off until the deep link is applied so
  // it can't clobber the incoming params before they're read.
  useEffect(() => {
    if (!deepLinkDone.current) return;
    const next = new URLSearchParams(params);
    if (originId) next.set('from', originId); else next.delete('from');
    if (destId) next.set('to', destId); else next.delete('to');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originId, destId]);

  if (load.loading) return <main className="screen"><div className="brand">Atlas</div><p className="hint">Loading map…</p></main>;
  if (load.notPublished) return <main className="screen"><div className="brand">Atlas</div><p className="hint">Map not yet published</p><p className="hint">This floor’s map hasn’t been published yet. Please check back soon.</p></main>;
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
