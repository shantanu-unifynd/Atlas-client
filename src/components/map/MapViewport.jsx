import { useCallback, useEffect, useRef, useState } from 'react';
import MapCanvas from './MapCanvas';

const MIN = 0.5;
const MAX = 8;
const FACTOR = 1.15;
const LAYERS = ['rooms', 'walls', 'labels', 'graph', 'route'];

// Interactive viewport around the (pure) MapCanvas: smooth wheel-zoom + drag-pan
// via a CSS transform, fit-to-floor, and layer toggles. Keeps MapCanvas dumb.
function MapViewport({ mpm, routePath = [], initialVisibility }) {
  const [zoom, setZoom] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [visibility, setVisibility] = useState({ rooms: true, walls: true, labels: true, graph: false, route: true, ...initialVisibility });
  const viewportRef = useRef(null);
  const drag = useRef({ on: false, x: 0, y: 0, tx: 0, ty: 0 });

  const clamp = (z) => Math.min(MAX, Math.max(MIN, z));
  const fit = useCallback(() => { setZoom(1); setTranslate({ x: 0, y: 0 }); }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    setZoom((z) => clamp(e.deltaY < 0 ? z * FACTOR : z / FACTOR));
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Fit-to-floor on initial load / when the floor changes.
  useEffect(() => { fit(); }, [mpm, fit]);

  useEffect(() => {
    function move(e) {
      if (!drag.current.on) return;
      setTranslate({ x: drag.current.tx + (e.clientX - drag.current.x), y: drag.current.ty + (e.clientY - drag.current.y) });
    }
    function up() { drag.current.on = false; }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  }, []);

  function handleDown(e) {
    if (e.button !== 0) return;
    drag.current = { on: true, x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
  }

  const toggle = (k) => setVisibility((v) => ({ ...v, [k]: !v[k] }));

  return (
    <div className="mapviewport" ref={viewportRef} onMouseDown={handleDown}>
      <div className="maptransform" style={{ transform: `translate(${translate.x}px, ${translate.y}px) scale(${zoom})` }}>
        <MapCanvas mpm={mpm} routePath={routePath} visibility={visibility} />
      </div>

      <div className="mapzoom" onMouseDown={(e) => e.stopPropagation()}>
        <button aria-label="Zoom in" onClick={() => setZoom((z) => clamp(z * FACTOR))}>+</button>
        <button aria-label="Zoom out" onClick={() => setZoom((z) => clamp(z / FACTOR))}>−</button>
        <button aria-label="Fit" onClick={fit}>Fit</button>
      </div>

      <div className="maptoggles" onMouseDown={(e) => e.stopPropagation()}>
        {LAYERS.map((k) => (
          <button key={k} className={visibility[k] ? 'active' : ''} onClick={() => toggle(k)}>
            {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
export default MapViewport;
