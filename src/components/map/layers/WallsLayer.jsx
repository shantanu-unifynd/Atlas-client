import { mapTheme as T } from '../mapTheme';

function WallsLayer({ walls = [], strokeW }) {
  return (
    <g>
      {walls.map((w) => (
        <polyline key={w.id} points={w.polyline.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke={T.wall} strokeWidth={strokeW * 1.15} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </g>
  );
}
export default WallsLayer;
