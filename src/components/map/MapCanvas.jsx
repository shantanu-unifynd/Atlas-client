import RoomsLayer from './layers/RoomsLayer';
import WallsLayer from './layers/WallsLayer';
import LabelsLayer from './layers/LabelsLayer';
import GraphLayer from './layers/GraphLayer';
import RouteLayer from './layers/RouteLayer';
import { mapTheme as T } from './mapTheme';

// MPM-driven 2D map renderer. Renders ONLY from the Map Presentation Model in
// its canonical world space (viewBox = coordinateSystem.bounds). Layer order is
// fixed for legibility; visibility toggles come from the viewport.
function MapCanvas({ mpm, routePath = [], visibility = {} }) {
  const b = mpm && mpm.coordinateSystem && mpm.coordinateSystem.bounds;
  if (!b) return <p className="hint">This floor has no coordinate system in its MPM.</p>;

  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const s = Math.max(w, h);
  const strokeW = s * 0.0013;
  const fontSize = s * 0.0095;
  const v = { rooms: true, walls: true, openings: true, labels: true, graph: false, route: true, ...visibility };
  const roomsById = new Map((mpm.rooms || []).map((r) => [r.id, r]));

  return (
    <svg viewBox={`${b.minX} ${b.minY} ${w} ${h}`} width="100%" height="100%"
      style={{ display: 'block', background: T.bg }} preserveAspectRatio="xMidYMid meet">
      {v.rooms && <RoomsLayer rooms={mpm.rooms} strokeW={strokeW} />}
      {v.walls && <WallsLayer walls={mpm.walls} strokeW={strokeW} />}
      {v.openings && (mpm.openings || []).map((op) => (
        <circle key={op.id} cx={op.position.x} cy={op.position.y} r={s * 0.0034}
          fill={op.type === 'DOOR' ? T.opening.door : T.opening.passage} />
      ))}
      {v.graph && <GraphLayer graph={mpm.graph} strokeW={strokeW} />}
      {v.route && <RouteLayer routePath={routePath} graph={mpm.graph} strokeW={strokeW} />}
      {v.labels && <LabelsLayer labels={mpm.labels} roomsById={roomsById} fontSize={fontSize} />}
    </svg>
  );
}
export default MapCanvas;
