import { useMemo } from 'react';

// Reads the plan's coordinate box from its viewBox (or width/height) so the
// route overlay can be drawn in the same space as the node positions.
function parsePlanSize(svg) {
  const vb = svg.match(/viewBox="([-\d.\s]+)"/);
  if (vb) {
    const p = vb[1].trim().split(/\s+/).map(Number);
    if (p.length === 4 && p[2] && p[3]) return { w: p[2], h: p[3] };
  }
  const w = svg.match(/width="([\d.]+)/);
  const h = svg.match(/height="([\d.]+)/);
  if (w && h) return { w: parseFloat(w[1]), h: parseFloat(h[1]) };
  return null;
}

// The floor plan (inlined SVG) with a route overlay drawn in the same viewBox.
// C1 is a static fit-to-width preview — zoom/pan and 3D come later.
function PlanView({ svg, nodes, routePath, originId, destId }) {
  const size = useMemo(() => parsePlanSize(svg), [svg]);
  const posById = useMemo(() => new Map(nodes.map((n) => [n.id, n.position])), [nodes]);
  if (!size) return null;

  const pts = (routePath || []).map((id) => posById.get(id)).filter(Boolean);
  const origin = posById.get(originId);
  const dest = posById.get(destId);
  const r = Math.max(size.w, size.h) * 0.008;

  return (
    <div className="plan">
      <div className="plan-bg" dangerouslySetInnerHTML={{ __html: svg }} />
      <svg className="plan-overlay" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="xMidYMid meet">
        {pts.length > 1 && (
          <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} className="route-line" />
        )}
        {origin && <circle cx={origin.x} cy={origin.y} r={r} className="marker-origin" />}
        {dest && <circle cx={dest.x} cy={dest.y} r={r} className="marker-dest" />}
      </svg>
    </div>
  );
}

export default PlanView;
