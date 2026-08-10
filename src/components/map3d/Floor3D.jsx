import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
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

// Flat filled polygon laid on the ground for a room footprint (color/context only).
function RoomPatch({ polygon, color }) {
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
      <meshStandardMaterial color={color} roughness={1} metalness={0} />
    </mesh>
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

function FloorModel({ mpm }) {
  const cs = mpm && mpm.coordinateSystem && mpm.coordinateSystem.bounds;
  const rooms = (mpm && mpm.rooms) || [];
  const walls = (mpm && mpm.walls) || [];
  if (!cs) return null;

  const w = cs.maxX - cs.minX;
  const h = cs.maxY - cs.minY;
  const cx = (cs.minX + cs.maxX) / 2;
  const cy = (cs.minY + cs.maxY) / 2;
  const polyRooms = rooms.filter(
    (r) => r.polygon && r.polygon.length >= 3 && r.polygon.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  );

  return (
    <group scale={[S, S, S]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[w * 1.04, h * 1.04]} />
        <meshStandardMaterial color="#E9ECF0" roughness={1} />
      </mesh>
      <group position={[-cx, 0, cy]}>
        {polyRooms.map((r) => (
          <RoomPatch key={r.id} polygon={r.polygon} color={r.source === 'MANUAL' ? '#DCE8FB' : '#F4F7FA'} />
        ))}
        <WallsMesh walls={walls} />
      </group>
    </group>
  );
}

function Floor3D({ mpm }) {
  const cs = mpm && mpm.coordinateSystem && mpm.coordinateSystem.bounds;
  const span = cs ? Math.max(cs.maxX - cs.minX, cs.maxY - cs.minY) * S : 45;
  const d = span * 0.95;

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

      <FloorModel mpm={mpm} />

      <ContactShadows position={[0, -0.98, 0]} opacity={0.4} scale={span * 1.6} blur={2.6} far={span} resolution={1024} color="#26313d" />

      <OrbitControls
        enableDamping dampingFactor={0.08}
        minPolarAngle={0.15} maxPolarAngle={1.4}
        minDistance={d * 0.35} maxDistance={d * 2.4}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

export default Floor3D;
