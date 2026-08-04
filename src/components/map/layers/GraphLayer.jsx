import { mapTheme as T } from '../mapTheme';

function GraphLayer({ graph, strokeW, showNodes = true, showEdges = true }) {
  if (!graph) return null;
  const pos = new Map((graph.nodes || []).map((n) => [n.id, n.position]));
  return (
    <g>
      {showEdges && (graph.edges || []).map((e) => {
        const a = pos.get(e.source); const b = pos.get(e.target);
        if (!a || !b) return null;
        return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={T.graph.edge} strokeWidth={strokeW * 0.6} />;
      })}
      {showNodes && (graph.nodes || []).map((n) => (
        <circle key={n.id} cx={n.position.x} cy={n.position.y} r={strokeW * 1.5} fill={T.graph.node} />
      ))}
    </g>
  );
}
export default GraphLayer;
