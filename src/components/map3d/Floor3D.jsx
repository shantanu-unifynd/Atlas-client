import { useMemo, useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Html } from '@react-three/drei';
import * as THREE from 'three';

// Milestone 2 — 2.5D floor renderer (Mappedin-style).
// Rooms render as flat colored floor patches; the MPM *walls* are the vertical
// geometry — each wall polyline is thickened into a ribbon and extruded upward,
// so the 284 wall primitives become the room dividers you actually walk between.
// All geometry lives in plan (x,y) space, extruded along +z, then rotated so the
// plan lies on the world XZ ground plane and the extrusion becomes height. M2+.

const WALL_H = 150;    // wall extrusion height (plan px) — short Mappedin-style walls
const WALL_T = 16;     // wall thickness (plan px)
const S = 0.02;        // world scale (bounds ~2245px -> ~45 world units)
const FLOOR_LIFT = 1;  // plan px the room patches sit above the plate (avoid z-fight)
const ROUTE_H = 10;    // plan px the route line floats above the floor
const ROUTE_R = 7;     // route tube radius (plan px)
const LABEL_H = WALL_H + 45; // plan px — labels float above the walls

// Soft mall palette by shop category (Woosmap-style calm fills). Falls back to a
// neutral tint for uncategorised rooms.
const PALETTE = {
  FASHION: '#F6D9E3', FOOTWEAR: '#F4E2C9', ELECTRONICS: '#D6E4F5', JEWELRY: '#E7DCF7',
  ACCESSORIES: '#FCE7C8', BEAUTY: '#F7D9D9', 'F&B': '#FBE6B8', LIFESTYLE: '#D9EFE4',
  DEPARTMENT: '#DCE8FB', ENTERTAINMENT: '#E5DAF0',
};
function roomColor(r) {
  return PALETTE[(r.category || '').toUpperCase()] || (r.source === 'MANUAL' ? '#DCE8FB' : '#EEF2F6');
}

// Flat filled polygon laid on the ground for a room footprint. `opacity` < 1 dims
// it (used to fade non-route shops so the active path reads clearly).
function RoomPatch({ polygon, color, opacity = 1 }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    polygon.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, FLOOR_LIFT, 0);
    return geo;
  }, [polygon]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={color} roughness={1} metalness={0} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

// Solid extruded shop block for a room-based floor: the whole footprint is raised
// into a colored volume with edge outlines. `opacity` < 1 fades off-route shops.
function RoomBlock({ polygon, color, opacity = 1 }) {
  const { geometry, edges } = useMemo(() => {
    const shape = new THREE.Shape();
    polygon.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return { geometry: geo, edges: new THREE.EdgesGeometry(geo, 20) };
  }, [polygon]);

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.9} metalness={0} transparent={opacity < 1} opacity={opacity} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#8A94A0" transparent opacity={opacity < 1 ? 0.35 : 0.85} />
      </lineSegments>
    </group>
  );
}

// Rectangle (4 plan-space corners) for one polyline segment a->b, thickness t.
function segRect(a, b, t) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (t / 2);
  const ny = (dx / len) * (t / 2);
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
    { x: b.x - nx, y: b.y - ny },
    { x: a.x - nx, y: a.y - ny },
  ];
}

// All walls in one merged geometry: every segment of every polyline becomes a
// thickened rectangle, and ExtrudeGeometry accepts the whole shape array at once.
function WallsMesh({ walls }) {
  const { geometry, edges } = useMemo(() => {
    const shapes = [];
    walls.forEach((w) => {
      const pl = (w.polyline || []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
      for (let i = 0; i < pl.length - 1; i++) {
        const r = segRect(pl[i], pl[i + 1], WALL_T);
        const s = new THREE.Shape();
        r.forEach((p, k) => (k ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
        shapes.push(s);
      }
    });
    if (!shapes.length) return { geometry: null, edges: null };
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: WALL_H, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return { geometry: geo, edges: new THREE.EdgesGeometry(geo, 30) };
  }, [walls]);

  if (!geometry) return null;
  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color="#C9D2DC" roughness={0.95} metalness={0} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#5B6570" />
      </lineSegments>
    </group>
  );
}

// Computed route as a tube floating just above the floor, with an origin sphere
// and a destination pin. Node positions come from mpm.graph; a plan point (x,y)
// maps to inner-group local (x, height, -y) — same convention as the walls.
function RouteMesh({ graph, routePath }) {
  const { curve, o, d } = useMemo(() => {
    const pos = new Map(((graph && graph.nodes) || []).map((n) => [n.id, n.position]));
    const pts = (routePath || []).map((id) => pos.get(id)).filter((p) => p && Number.isFinite(p.x));
    if (pts.length < 2) return { curve: null };
    const vs = pts.map((p) => new THREE.Vector3(p.x, ROUTE_H, -p.y));
    return { curve: new THREE.CatmullRomCurve3(vs), o: vs[0], d: vs[vs.length - 1] };
  }, [graph, routePath]);

  if (!curve) return null;
  return (
    <group>
      <mesh castShadow>
        <tubeGeometry args={[curve, Math.max(32, routePath.length * 6), ROUTE_R, 10, false]} />
        <meshStandardMaterial color="#e8590c" emissive="#e8590c" emissiveIntensity={0.85} roughness={0.5} toneMapped={false} />
      </mesh>
      <mesh position={o}>
        <sphereGeometry args={[ROUTE_R * 2, 24, 24]} />
        <meshStandardMaterial color="#2563eb" emissive="#2563eb" emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      <mesh position={[d.x, d.y + ROUTE_R * 3, d.z]}>
        <coneGeometry args={[ROUTE_R * 2, ROUTE_R * 5, 24]} />
        <meshStandardMaterial color="#aa3bff" emissive="#aa3bff" emissiveIntensity={0.6} toneMapped={false} />
      </mesh>
    </group>
  );
}

// Room labels as billboarded HTML sprites floating above the walls. To avoid a
// jumble, only labels whose room has a real polygon footprint are shown — the
// point-fallback rooms (no traced footprint yet) would just clutter the view.
function Labels({ mpm }) {
  const labels = (mpm && mpm.labels) || [];
  const roomsById = useMemo(
    () => new Map(((mpm && mpm.rooms) || []).map((r) => [r.id, r])),
    [mpm]
  );
  return labels.map((l) => {
    if (!l.position || !Number.isFinite(l.position.x)) return null;
    const room = roomsById.get(l.roomId);
    if (!room || !room.polygon) return null; // hide point-fallback labels
    return (
      <Html key={l.id} position={[l.position.x, LABEL_H, -l.position.y]} center sprite zIndexRange={[10, 0]}
        style={{
          pointerEvents: 'none', whiteSpace: 'nowrap', userSelect: 'none',
          fontFamily: 'system-ui, sans-serif', fontWeight: 600,
          fontSize: 13, color: '#1f2a37',
          textShadow: '0 0 3px #fff, 0 1px 2px #fff, 0 -1px 2px #fff',
        }}>
        {l.text}
      </Html>
    );
  });
}

function FloorModel({ mpm, routePath }) {
  const cs = mpm && mpm.coordinateSystem && mpm.coordinateSystem.bounds;
  const rooms = (mpm && mpm.rooms) || [];
  const walls = (mpm && mpm.walls) || [];
  const graph = mpm && mpm.graph;
  if (!cs) return null;

  const w = cs.maxX - cs.minX;
  const h = cs.maxY - cs.minY;
  const cx = (cs.minX + cs.maxX) / 2;
  const cy = (cs.minY + cs.maxY) / 2;
  const polyRooms = rooms.filter(
    (r) => r.polygon && r.polygon.length >= 3 && r.polygon.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  );

  // Vertical geometry is adaptive: raise the floor's own walls when it has them
  // (wall-based floors like Phoenix). Otherwise raise each room's outline into
  // thin walls so room-based floors (e.g. August) still stand up as real rooms —
  // a room's polygon boundary is effectively its walls.
  // Wall-based floors (real wall data, e.g. Phoenix) extrude their walls with flat
  // room floors; room-based floors (e.g. August) raise each shop into a solid
  // colored block instead.
  const roomBased = !walls.length;

  // Guide the eye (Woosmap-style): calm pastel shops; once a route is active, dim
  // every shop except the origin/destination so the bright path is what stands out.
  const nodeById = new Map(((graph && graph.nodes) || []).map((n) => [n.id, n]));
  const routeActive = (routePath || []).length > 1;
  const originLabel = routeActive ? (nodeById.get(routePath[0]) || {}).label : null;
  const destLabel = routeActive ? (nodeById.get(routePath[routePath.length - 1]) || {}).label : null;
  const isEndpoint = (r) => r.name && (r.name === originLabel || r.name === destLabel);

  return (
    <group scale={[S, S, S]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[w * 1.04, h * 1.04]} />
        <meshStandardMaterial color="#E9ECF0" roughness={1} />
      </mesh>
      <group position={[-cx, 0, cy]}>
        {polyRooms.map((r) => {
          const dim = routeActive && !isEndpoint(r);
          const color = dim ? '#C7CDD6' : roomColor(r);
          return roomBased
            ? <RoomBlock key={r.id} polygon={r.polygon} color={color} opacity={dim ? 0.55 : 1} />
            : <RoomPatch key={r.id} polygon={r.polygon} color={color} opacity={dim ? 0.5 : 1} />;
        })}
        {!roomBased && <WallsMesh walls={walls} />}
        <RouteMesh graph={graph} routePath={routePath} />
        <Labels mpm={mpm} />
      </group>
    </group>
  );
}

// One orchestrated camera glide on route reveal: eases the view once to frame the
// whole path, then hands control back. No loop, no auto-spin (per design principles).
// worldPts are the route points already in world space. Mirrors Scene3D's pattern:
// OrbitControls is disabled while gliding so it doesn't fight the eased motion.
function RouteReveal({ controlsRef, worldPts, distRange, onStart, onEnd }) {
  const { camera } = useThree();
  const anim = useRef(null);

  useEffect(() => {
    if (!worldPts || worldPts.length < 2) return;
    const center = worldPts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / worldPts.length);
    const span = new THREE.Box3().setFromPoints(worldPts).getSize(new THREE.Vector3()).length() || 4;
    const dir = new THREE.Vector3(0.35, 1.0, 0.78).normalize();
    const dist = Math.min(Math.max(span * 1.8, distRange[0]), distRange[1]);
    anim.current = {
      t: 0,
      fromPos: camera.position.clone(),
      fromTarget: controlsRef.current ? controlsRef.current.target.clone() : new THREE.Vector3(),
      toPos: center.clone().add(dir.multiplyScalar(dist)),
      toTarget: center,
    };
    onStart && onStart();
  }, [worldPts]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const a = anim.current;
    if (!a) return;
    a.t = Math.min(1, a.t + delta / 2.2); // ~2.2s reveal
    const e = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2; // easeInOutQuad
    camera.position.lerpVectors(a.fromPos, a.toPos, e);
    const tgt = new THREE.Vector3().lerpVectors(a.fromTarget, a.toTarget, e);
    camera.lookAt(tgt);
    if (controlsRef.current) controlsRef.current.target.copy(tgt);
    if (a.t >= 1) {
      anim.current = null;
      if (controlsRef.current) controlsRef.current.update();
      onEnd && onEnd();
    }
  });

  return null;
}

function Floor3D({ mpm, routePath = [] }) {
  const cs = mpm && mpm.coordinateSystem && mpm.coordinateSystem.bounds;
  const span = cs ? Math.max(cs.maxX - cs.minX, cs.maxY - cs.minY) * S : 45;
  const d = span * 0.95;
  const cx = cs ? (cs.minX + cs.maxX) / 2 : 0;
  const cy = cs ? (cs.minY + cs.maxY) / 2 : 0;
  const controlsRef = useRef();
  const [gliding, setGliding] = useState(false);

  // Route points in WORLD space (matching FloorModel's group scale S + centering),
  // recomputed only when the route changes — drives the reveal glide.
  const worldRoute = useMemo(() => {
    if (!cs) return null;
    const pos = new Map(((mpm && mpm.graph && mpm.graph.nodes) || []).map((n) => [n.id, n.position]));
    const pts = (routePath || []).map((id) => pos.get(id)).filter((p) => p && Number.isFinite(p.x));
    if (pts.length < 2) return null;
    return pts.map((p) => new THREE.Vector3((p.x - cx) * S, ROUTE_H * S, (cy - p.y) * S));
  }, [mpm, routePath, cx, cy, cs]);

  return (
    <Canvas shadows dpr={[1, 2]}
      camera={{ position: [span * 0.35, span * 1.1, span * 0.78], fov: 40, near: 0.1, far: 2000 }}
      style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={['#EEF1F4']} />
      <fog attach="fog" args={['#EEF1F4', span * 2.4, span * 4.2]} />
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[span * 0.6, span * 1.5, span * 0.4]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span} shadow-camera-right={span}
        shadow-camera-top={span} shadow-camera-bottom={-span}
        shadow-camera-far={span * 4}
      />
      <hemisphereLight args={['#ffffff', '#c4cdd8', 0.45]} />

      <FloorModel mpm={mpm} routePath={routePath} />

      <ContactShadows position={[0, -0.98, 0]} opacity={0.4} scale={span * 1.6} blur={2.6} far={span} resolution={1024} color="#26313d" />

      <RouteReveal controlsRef={controlsRef} worldPts={worldRoute}
        distRange={[d * 0.4, d * 2.2]} onStart={() => setGliding(true)} onEnd={() => setGliding(false)} />

      <OrbitControls ref={controlsRef} makeDefault enabled={!gliding}
        enableDamping dampingFactor={0.08}
        minPolarAngle={0.15} maxPolarAngle={1.4}
        minDistance={d * 0.35} maxDistance={d * 2.4}
      />
    </Canvas>
  );
}

export default Floor3D;
