import { mapTheme as T } from '../mapTheme';

// Computed route: a glow under-stroke + crisp rounded line, with a start ring
// and a destination pin (start/destination highlighted).
function RouteLayer({ routePath = [], graph, strokeW }) {
  if (!graph || routePath.length < 2) return null;
  const pos = new Map((graph.nodes || []).map((n) => [n.id, n.position]));
  const pts = routePath.map((id) => pos.get(id)).filter(Boolean);
  if (pts.length < 2) return null;
  const o = pts[0]; const d = pts[pts.length - 1];
  const line = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const r = strokeW * 3;
  return (
    <g>
      <polyline points={line} fill="none" stroke={T.route.glow} strokeWidth={strokeW * 5} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line} fill="none" stroke={T.route.line} strokeWidth={strokeW * 2.2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={o.x} cy={o.y} r={r} fill={T.route.start} stroke={T.route.markerRing} strokeWidth={strokeW * 0.6} />
      <path d={`M ${d.x} ${d.y - r * 1.7} L ${d.x + r} ${d.y} L ${d.x - r} ${d.y} Z`} fill={T.route.dest} stroke={T.route.markerRing} strokeWidth={strokeW * 0.6} />
      <circle cx={d.x} cy={d.y} r={r * 0.4} fill={T.route.markerRing} />
    </g>
  );
}
export default RouteLayer;
