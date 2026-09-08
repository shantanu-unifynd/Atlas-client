import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows, Bounds, Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';

// Milestone 1 + M2 overlays — 2.5D extruded floor renderer.
// Rooms = extruded polygons; walls = thin slabs; auto-fit camera via <Bounds>.
// Overlays (render only when the data exists): room labels, route ribbon on the
// floor, directional chevrons, and an origin/location marker.

const WALL_H = 150;
const S = 0.02;
const INSET = 0.9;
const WALL_THICK = 7;
const ROUTE = '#2563eb';

function RoomMesh({ polygon, color }) {
  const { geometry, edges } = useMemo(() => {
    const cx = polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
    const cy = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
    const pts = polygon.map((p) => ({ x: cx + (p.x - cx) * INSET, y: cy + (p.y - cy) * INSET }));
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return { geometry: geo, edges: new THREE.EdgesGeometry(geo, 20) };
  }, [polygon]);
  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.92} metalness={0} />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#68727E" />
      </lineSegments>
    </group>
  );
}

function Walls({ walls }) {
  const segs = useMemo(() => {
    const out = [];
    (walls || []).forEach((w, wi) => {
      const pl = w.polyline || [];
      for (let i = 0; i < pl.length - 1; i += 1) {
        const a = pl[i];
        const b = pl[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1) continue;
        out.push({ key: `${wi}-${i}`, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, len, angle: Math.atan2(dy, dx) });
      }
    });
    return out;
  }, [walls]);
  const H = WALL_H * 1.05;
  return segs.map((s) => (
    <mesh key={s.key} position={[s.cx, H / 2, -s.cy]} rotation={[0, s.angle, 0]} castShadow>
      <boxGeometry args={[s.len, H, WALL_THICK]} />
      <meshStandardMaterial color="#B9C0C8" roughness={0.95} />
    </mesh>
  ));
}

// Billboarded room labels — floats each named room's name above the unit.
function RoomLabels({ rooms }) {
  const named = useMemo(
    () => (rooms || []).filter((r) => r.name && r.centroid && Number.isFinite(r.centroid.x)),
    [rooms]
  );
  return named.map((r) => (
    <Billboard key={r.id} position={[r.centroid.x, WALL_H * 1.35, -r.centroid.y]}>
      <Text fontSize={72} color="#1d2733" anchorX="center" anchorY="middle" outlineWidth={7} outlineColor="#ffffff">
        {r.name}
      </Text>
    </Billboard>
  ));
}

// Route ribbon on the floor + directional chevrons + origin marker.
function Route({ routePath, graph }) {
  const chevronShape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(34, 0);
    s.lineTo(-16, 22);
    s.lineTo(-16, -22);
    s.closePath();
    return s;
  }, []);

  const data = useMemo(() => {
    if (!routePath || routePath.length < 2 || !graph) return null;
    const byId = new Map((graph.nodes || []).map((n) => [n.id, n.position]));
    const pts = routePath.map((id) => byId.get(id)).filter((p) => p && Number.isFinite(p.x));
    if (pts.length < 2) return null;
    const H = WALL_H * 0.16;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, H, -p.y)));
    const tube = new THREE.TubeGeometry(curve, Math.max(pts.length * 8, 24), 16, 8, false);
    const chevrons = [];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      chevrons.push({ key: i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, angle: Math.atan2(b.y - a.y, b.x - a.x) });
    }
    return { tube, chevrons, origin: pts[0], H };
  }, [routePath, graph]);

  if (!data) return null;
  const { tube, chevrons, origin, H } = data;
  return (
    <group>
      <mesh geometry={tube}>
        <meshStandardMaterial color={ROUTE} emissive={ROUTE} emissiveIntensity={0.35} roughness={0.5} />
      </mesh>
      {chevrons.map((c) => (
        <group key={c.key} position={[c.x, H + 6, -c.y]} rotation={[0, c.angle, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <shapeGeometry args={[chevronShape]} />
            <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
      {/* origin / location marker */}
      <group position={[origin.x, 0, -origin.y]}>
        <mesh position={[0, H + 70, 0]}>
          <cylinderGeometry args={[7, 7, 140, 12]} />
          <meshStandardMaterial color={ROUTE} />
        </mesh>
        <mesh position={[0, H + 150, 0]}>
          <sphereGeometry args={[28, 18, 18]} />
          <meshStandardMaterial color={ROUTE} emissive={ROUTE} emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, H + 4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[34, 46, 24]} />
          <meshBasicMaterial color={ROUTE} side={THREE.DoubleSide} transparent opacity={0.6} />
        </mesh>
      </group>
    </group>
  );
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

  return (
    <group scale={[S, S, S]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1, 0]} receiveShadow>
        <planeGeometry args={[w * 1.15, h * 1.15]} />
        <meshStandardMaterial color="#E9ECF0" roughness={1} />
      </mesh>
      <group position={[-cx, 0, cy]}>
        {polyRooms.map((r) => (
          <RoomMesh key={r.id} polygon={r.polygon} color={r.source === 'MANUAL' ? '#DCE8FB' : '#FFFFFF'} />
        ))}
        <Walls walls={walls} />
        <RoomLabels rooms={rooms} />
        <Route routePath={routePath} graph={graph} />
      </group>
    </group>
  );
}

function Floor3D({ mpm, routePath = [] }) {
  return (
    <Canvas shadows dpr={[1, 2]}
      camera={{ position: [30, 44, 34], fov: 40, near: 0.1, far: 4000 }}
      style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={['#EEF1F4']} />
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[40, 90, 30]} intensity={1.2} castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-80} shadow-camera-right={80}
        shadow-camera-top={80} shadow-camera-bottom={-80} shadow-camera-far={400}
      />
      <hemisphereLight args={['#ffffff', '#c4cdd8', 0.45]} />

      <Bounds fit clip observe margin={1.2}>
        <FloorModel mpm={mpm} routePath={routePath} />
      </Bounds>

      <ContactShadows position={[0, -0.98, 0]} opacity={0.38} scale={140} blur={2.6} far={90} resolution={1024} color="#26313d" />

      <OrbitControls makeDefault enableDamping dampingFactor={0.08} minPolarAngle={0.15} maxPolarAngle={1.4} />
    </Canvas>
  );
}

export default Floor3D;
