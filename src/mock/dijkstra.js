// Local shortest-path over an MPM graph, so routing works with zero backend.
// Edges are treated as undirected; weights are Euclidean distance between node
// positions (plan units). Mirrors the backend's compute response: { path, totalCost }.

export function computePath(graph, originNodeId, destinationNodeId) {
  const nodes = (graph && graph.nodes) || [];
  const edges = (graph && graph.edges) || [];
  const pos = new Map(nodes.map((n) => [n.id, n.position]));

  const adj = new Map(nodes.map((n) => [n.id, []]));
  const dist = (a, b) => {
    const pa = pos.get(a); const pb = pos.get(b);
    if (!pa || !pb) return Infinity;
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  };
  edges.forEach((e) => {
    if (!adj.has(e.source) || !adj.has(e.target)) return;
    const w = dist(e.source, e.target);
    adj.get(e.source).push({ to: e.target, w });
    adj.get(e.target).push({ to: e.source, w });
  });

  if (!pos.has(originNodeId) || !pos.has(destinationNodeId)) {
    return { path: [], totalCost: 0 };
  }

  // Dijkstra with a simple linear-scan frontier (graph is tiny).
  const best = new Map(nodes.map((n) => [n.id, Infinity]));
  const prev = new Map();
  const done = new Set();
  best.set(originNodeId, 0);

  while (done.size < nodes.length) {
    let u = null; let ud = Infinity;
    for (const [id, d] of best) {
      if (!done.has(id) && d < ud) { ud = d; u = id; }
    }
    if (u == null || ud === Infinity) break;
    if (u === destinationNodeId) break;
    done.add(u);
    for (const { to, w } of adj.get(u) || []) {
      if (done.has(to)) continue;
      const nd = ud + w;
      if (nd < best.get(to)) { best.set(to, nd); prev.set(to, u); }
    }
  }

  if (best.get(destinationNodeId) === Infinity) return { path: [], totalCost: 0 };

  const path = [];
  let cur = destinationNodeId;
  while (cur != null) { path.unshift(cur); cur = prev.get(cur); }
  return { path, totalCost: Math.round(best.get(destinationNodeId)) };
}

export default computePath;
