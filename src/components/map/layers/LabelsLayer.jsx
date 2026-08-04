import { mapTheme as T } from '../mapTheme';

// Label hierarchy: labels of polygon rooms read as primary (larger, full
// opacity, semibold); point-fallback labels read as secondary (smaller, muted).
function LabelsLayer({ labels = [], roomsById, fontSize }) {
  return (
    <g>
      {labels.map((l) => {
        const room = roomsById && roomsById.get(l.roomId);
        const primary = Boolean(room && room.polygon);
        const size = primary ? fontSize * 1.12 : fontSize * 0.86;
        return (
          <text key={l.id} x={l.position.x} y={l.position.y} fill={T.label.color}
            fontSize={size} fontWeight={primary ? 600 : 400} textAnchor="middle"
            opacity={primary ? 1 : T.label.mutedOpacity}
            style={{ paintOrder: 'stroke', stroke: T.label.halo, strokeWidth: size * 0.28 }}>
            {l.text}
          </text>
        );
      })}
    </g>
  );
}
export default LabelsLayer;
