import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { getMapModel, computeRoute } from '../services/wayfinding.service';
import MapViewport from '../components/map/MapViewport';
import Floor3D from '../components/map3d/Floor3D';

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

// C3-04 — centered full-page state (loading / empty / error). Reused for every
// blocking state so they look consistent and never leave a blank screen.
function StateScreen({ spinner, title, message, actionLabel, onAction }) {
  return (
    <main className="screen" role="status" aria-live="polite">
      {spinner ? <div className="spinner" aria-hidden="true" /> : <div className="brand">Atlas</div>}
      {title && <p className="state-title">{title}</p>}
      {message && <p className="hint">{message}</p>}
      {actionLabel && (
        <button type="button" className="btn-primary" onClick={onAction}>{actionLabel}</button>
      )}
    </main>
  );
}

// C2-01 — MPM-driven wayfinding. The floor is rendered ENTIRELY from the Map
// Presentation Model (rooms/walls/labels/graph); the visitor picks start +
// destination and the computed route is overlaid on top.
function WayfindingPage() {
  const { buildingId, floorId } = useParams();
  const [params, setSearchParams] = useSearchParams();
  const embed = params.get('embed') === 'true';

  const [load, setLoad] = useState({ loading: true, error: null, mpm: null, notPublished: false });
  const [originId, setOriginId] = useState('');
  const [destId, setDestId] = useState('');
  const [routePath, setRoutePath] = useState([]);
  const [routeInfo, setRouteInfo] = useState(null);
  const [computing, setComputing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [view, setView] = useState('2d');
  const [stepIdx, setStepIdx] = useState(0);
  const [stepped, setStepped] = useState(false);

  useEffect(() => { document.title = 'Atlas — Find your way'; }, []);

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
  }, [floorId, reloadKey]);

  // C3-04 — retry reloads the current floor's map without a full page reload.
  function retry() {
    setLoad({ loading: true, error: null, mpm: null, notPublished: false });
    setReloadKey((k) => k + 1);
  }

  const graph = load.mpm && load.mpm.graph;
  const nodes = (graph && graph.nodes) || [];
  const options = useMemo(
    () => [...nodes].sort((a, b) => (a.label || '').localeCompare(b.label || '')),
    [nodes]
  );

  // Turn-by-turn steps derived from the route geometry: head out, each significant
  // turn (left/right, sharp if the bend is steep), then arrive at the destination.
  const stepList = useMemo(() => {
    if (!graph || (routePath || []).length < 2) return [];
    const pos = new Map(nodes.map((n) => [n.id, n.position]));
    const pts = routePath.map((id) => pos.get(id)).filter((p) => p && Number.isFinite(p.x));
    if (pts.length < 2) return [];
    const dest = nodes.find((n) => n.id === routePath[routePath.length - 1])?.label || 'your destination';
    // Cumulative arc length → each step carries its fraction `t` (0..1) along the route.
    const cum = [0];
    for (let i = 1; i < pts.length; i += 1) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    const total = cum[pts.length - 1] || 1;
    const steps = [{ icon: '↑', text: 'Head toward the walkway', t: 0 }];
    for (let i = 1; i < pts.length - 1; i += 1) {
      const a = pts[i - 1], b = pts[i], c = pts[i + 1];
      const ix = b.x - a.x, iy = b.y - a.y, ox = c.x - b.x, oy = c.y - b.y;
      const ang = (Math.atan2(ix * oy - iy * ox, ix * ox + iy * oy) * 180) / Math.PI;
      if (Math.abs(ang) < 25) continue; // effectively straight
      const right = ang > 0;
      steps.push({ icon: right ? '↱' : '↰', t: cum[i] / total,
        text: `${Math.abs(ang) > 115 ? 'Sharp t' : 'T'}urn ${right ? 'right' : 'left'}, then walk straight` });
    }
    steps.push({ icon: '📍', text: `Arrive at ${dest}`, t: 1 });
    return steps;
  }, [graph, routePath, nodes]);

  useEffect(() => { setStepIdx(0); setStepped(false); }, [routePath]);

  async function computeRouteFor(oId, dId) {
    // C3-04 — bail if inputs missing or a computation is already in flight
    // (prevents duplicate/overlapping route requests).
    if (!oId || !dId || !graph || computing) return;
    setComputing(true);
    try {
      const res = await computeRoute(graph.navigationGraphId, oId, dId);
      const path = res.path || [];
      setRoutePath(path);
      setRouteInfo({ hops: Math.max(path.length - 1, 0) });
      // C3-03 — notify the host of the computed route.
      window.parent.postMessage(
        { type: 'atlas-route', from: oId, to: dId, distance: res.totalCost ?? null, nodeCount: path.length },
        '*'
      );
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

  // C3-03 — embed bridge. Refs keep the message listener registered once while it
  // always reads the latest nodes / compute fn.
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const computeRef = useRef(computeRouteFor);
  computeRef.current = computeRouteFor;

  // Announce readiness to the host once, on load.
  const readySent = useRef(false);
  useEffect(() => {
    if (readySent.current) return;
    readySent.current = true;
    window.parent.postMessage({ type: 'atlas-ready', floorId, buildingId }, '*');
  }, [floorId, buildingId]);

  // Listen for host route commands. Ignores our own posts (event.source === window
  // when not framed) so it never loops; invalid node ids are ignored. Listener is
  // removed on unmount.
  useEffect(() => {
    function onMessage(event) {
      if (event.source === window) return;
      const msg = event.data;
      if (!msg || msg.type !== 'atlas-route') return;
      const fromId = resolveNodeId(msg.from, nodesRef.current);
      const toId = resolveNodeId(msg.to, nodesRef.current);
      if (!fromId || !toId) return;
      setOriginId(fromId);
      setDestId(toId);
      computeRef.current(fromId, toId);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (load.loading) return <StateScreen spinner title="Loading map…" />;
  if (load.notPublished) return <StateScreen title="Map not yet published" message="This floor’s map hasn’t been published yet. Please check back soon." />;
  if (load.error) return <StateScreen title="Couldn’t load the map" message={load.error} actionLabel="Retry" onAction={retry} />;

  const labelOf = (id) => nodes.find((n) => n.id === id)?.label;
  const hasGraph = Boolean(graph && nodes.length);

  return (
    <div className="app">
      {!embed && (
        <header className="topbar">
          <span className="brand-sm">Atlas</span>
          <span className="hint">Find your way</span>
        </header>
      )}

      <div className="plan-wrap">
        {view === '3d'
          ? <Floor3D mpm={load.mpm} routePath={routePath} focusT={stepped ? (stepList[stepIdx]?.t ?? null) : null} />
          : <MapViewport mpm={load.mpm} routePath={routePath} />}
        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 6, display: 'flex', gap: 4,
          background: '#fff', borderRadius: 10, padding: 3, boxShadow: '0 4px 14px rgba(20,35,45,.16)' }}>
          {['2d', '3d'].map((m) => (
            <button key={m} type="button" onClick={() => setView(m)} aria-pressed={view === m}
              style={{ border: 0, borderRadius: 8, padding: '6px 13px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit',
                background: view === m ? '#2563eb' : 'transparent', color: view === m ? '#fff' : '#5c6b78' }}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {stepList.length > 0 && (
          <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 6, maxWidth: '60%',
            display: 'flex', alignItems: 'center', gap: 10, color: '#3a2e07',
            background: 'linear-gradient(90deg,#d4ab4e,#ecca72)', borderRadius: 12,
            padding: '10px 12px', boxShadow: '0 6px 18px rgba(20,35,45,.22)' }}>
            <span style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{stepList[stepIdx]?.icon}</span>
            <span style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.15 }}>{stepList[stepIdx]?.text}</span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              <button type="button" aria-label="Previous step" onClick={() => { setStepped(true); setStepIdx((i) => Math.max(0, i - 1)); }}
                disabled={stepIdx === 0}
                style={{ border: 0, background: 'rgba(255,255,255,.7)', borderRadius: 8, width: 26, height: 26, cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>‹</button>
              <button type="button" aria-label="Next step" onClick={() => { setStepped(true); setStepIdx((i) => Math.min(stepList.length - 1, i + 1)); }}
                disabled={stepIdx === stepList.length - 1}
                style={{ border: 0, background: 'rgba(255,255,255,.7)', borderRadius: 8, width: 26, height: 26, cursor: 'pointer', fontWeight: 800, fontSize: 16 }}>›</button>
            </span>
          </div>
        )}
      </div>

      {(computing || routeInfo) && (
        <div className="routeinfo" role="status" aria-live="polite" aria-busy={computing}>
          {computing
            ? 'Computing route…'
            : routeInfo.error
              ? routeInfo.error
              : `To ${labelOf(destId) || ''} · ${routeInfo.hops} stop${routeInfo.hops === 1 ? '' : 's'}`}
        </div>
      )}

      {hasGraph ? (
        <div className="controls">
          <select value={originId} onChange={(e) => setOriginId(e.target.value)} aria-label="Start location">
            <option value="">From…</option>
            {options.map((n) => <option key={n.id} value={n.id}>{n.label || n.id.slice(0, 6)}</option>)}
          </select>
          <select value={destId} onChange={(e) => setDestId(e.target.value)} aria-label="Destination">
            <option value="">To…</option>
            {options.map((n) => <option key={n.id} value={n.id}>{n.label || n.id.slice(0, 6)}</option>)}
          </select>
          <button type="button" aria-label="Compute route" aria-busy={computing}
            onClick={findRoute} disabled={!originId || !destId || computing}>
            {computing ? 'Computing…' : 'Go'}
          </button>
        </div>
      ) : (
        <div className="controls">
          <p className="hint" style={{ margin: 0 }}>Wayfinding isn’t available for this floor yet.</p>
        </div>
      )}
    </div>
  );
}
export default WayfindingPage;
