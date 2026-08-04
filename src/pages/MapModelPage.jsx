import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getMapModel } from '../services/wayfinding.service';

// Preview of the Map Presentation Model — draws the generated map (rooms, walls,
// openings, labels) directly from the backend MPM, in its canonical world space.
function MapModelPage() {
  const { floorId } = useParams();
  const [state, setState] = useState({ loading: true, error: null, mpm: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mpm = await getMapModel(floorId);
        if (alive) setState({ loading: false, error: null, mpm });
      } catch (e) {
        if (alive) setState({ loading: false, error: e.message || 'Failed to load map model', mpm: null });
      }
    })();
    return () => { alive = false; };
  }, [floorId]);

  if (state.loading) return <main className="screen"><div className="brand">Atlas</div><p className="hint">Loading map model…</p></main>;
  if (state.error) return <main className="screen"><div className="brand">Atlas</div><p className="hint">{state.error}</p></main>;

  const d = state.mpm;
  const b = d?.coordinateSystem?.bounds;
  if (!b) return <main className="screen"><div className="brand">Atlas</div><p className="hint">This floor has no coordinate system in its MPM.</p></main>;

  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const s = Math.max(w, h);
  const c = d.metadata?.counts || {};

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand-sm">Atlas</span>
        <span className="hint">Map Model · {c.rooms} rooms · {c.walls} walls · {c.openings} openings · {c.labels} labels</span>
      </header>
      <div className="plan-wrap" style={{ background: '#0b0d12' }}>
        <svg viewBox={`${b.minX} ${b.minY} ${w} ${h}`} width="100%" style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet">
          {d.rooms.filter((r) => r.polygon).map((r) => (
            <polygon key={r.id} points={r.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="rgba(170,59,255,0.14)" stroke="rgba(170,59,255,0.55)" strokeWidth={s * 0.0011} />
          ))}
          {d.walls.map((wl) => (
            <polyline key={wl.id} points={wl.polyline.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke="#8b93a3" strokeWidth={s * 0.0013} strokeLinecap="round" />
          ))}
          {d.openings.map((o) => (
            <circle key={o.id} cx={o.position.x} cy={o.position.y} r={s * 0.0038}
              fill={o.type === 'DOOR' ? '#e8590c' : '#5b8cff'} />
          ))}
          {d.labels.map((l) => (
            <text key={l.id} x={l.position.x} y={l.position.y} fill="#f4f6fb"
              fontSize={s * 0.009} textAnchor="middle" style={{ paintOrder: 'stroke', stroke: '#0b0d12', strokeWidth: s * 0.003 }}>
              {l.text}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

export default MapModelPage;
