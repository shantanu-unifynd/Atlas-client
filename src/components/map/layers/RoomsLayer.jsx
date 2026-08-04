import { mapTheme as T } from '../mapTheme';

// Rooms: polygons (SEMANTIC vs MANUAL fills) + point-fallback markers.
function RoomsLayer({ rooms = [], strokeW }) {
  return (
    <g>
      {rooms.map((r) => {
        if (r.polygon && r.polygon.length >= 3) {
          const manual = r.source === 'MANUAL';
          return (
            <polygon key={r.id} points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
              fill={manual ? T.room.manualFill : T.room.semanticFill}
              stroke={manual ? T.room.manualStroke : T.room.semanticStroke}
              strokeWidth={strokeW} strokeLinejoin="round" />
          );
        }
        if (r.point) return <circle key={r.id} cx={r.point.x} cy={r.point.y} r={strokeW * 2.6} fill={T.room.point} />;
        return null;
      })}
    </g>
  );
}
export default RoomsLayer;
