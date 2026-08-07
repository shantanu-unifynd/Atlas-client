import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';

// Milestone 1 — 2.5D extruded floor renderer (Mappedin-style).
// Consumes the published MPM directly: each room polygon is extruded into a low
// block, laid on a neutral floor plate, lit for soft shadows, and viewed through
// a tilted orbit camera. No route/labels yet (those are M2).

const WALL_H = 46;        // extrusion height in plan (px) units — short "model" walls
const S = 0.02;           // world scale (bounds ~2245px -> ~45 world units)

// One extruded room. Shape is built in the plan's XY, then laid flat (rotateX)
// so the footprint sits on the ground (XZ) and the extrusion rises up (+Y).
function RoomMesh({ polygon, color }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    polygon.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, [polygon]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.9} metalness={0} />
    </mesh>
  );
}

function FloorModel({ mpm }) {
  const cs = mpm && mpm.coordinateSystem && mpm.coordinateSystem.bounds;
  const rooms = (mpm && mpm.rooms) || [];
  if (!cs) return null;

  const w = cs.maxX - cs.minX;
  const h = cs.maxY - cs.minY;
  const cx = (cs.minX + cs.maxX) / 2;
  const cy = (cs.minY + cs.maxY) / 2;

  const polyRooms = rooms.filter((r) => r.polygon && r.polygon.length >= 3);

  return (
    <group scale={[S, S, S]}>
      {/* floor plate — neutral, receives the block shadows */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]} receiveShadow>
        <planeGeometry args={[w * 1.12, h * 1.12]} />
        <meshStandardMaterial color="#E4E8EC" roughness={1} />
      </mesh>

      {/* rooms, centered on the origin (footprint z = -planY, so shift +cy) */}
      <group position={[-cx, 0, cy]}>
        {polyRooms.map((r) => (
          <RoomMesh
            key={r.id}
            polygon={r.polygon}
            color={r.source === 'MANUAL' ? '#EAF0FB' : '#F7F8FA'}
          />
        ))}
      </group>
    </group>
  );
}

// Frames the camera to the floor's larger dimension so any floor fits on load.
function Floor3D({ mpm }) {
  const cs = mpm && mpm.coordinateSystem && mpm.coordinateSystem.bounds;
  const span = cs ? Math.max(cs.maxX - cs.minX, cs.maxY - cs.minY) * S : 45;
  const d = span * 0.95;

  return (
    <Canvas shadows dpr={[1, 2]} camera={{ position: [d * 0.05, d * 0.9, d * 0.95], fov: 42, near: 0.1, far: 2000 }}
      style={{ width: '100%', height: '100%' }}>
      <color attach="background" args={['#EEF1F4']} />
      <fog attach="fog" args={['#EEF1F4', d * 2.2, d * 4]} />
      <ambientLight intensity={0.85} />
      <directionalLight
        position={[span * 0.6, span * 1.4, span * 0.5]}
        intensity={1.15}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span} shadow-camera-right={span}
        shadow-camera-top={span} shadow-camera-bottom={-span}
        shadow-camera-far={span * 4}
      />
      <hemisphereLight args={['#ffffff', '#c9d2dc', 0.4]} />

      <FloorModel mpm={mpm} />

      <ContactShadows position={[0, -0.49, 0]} opacity={0.42} scale={span * 1.5} blur={2.4} far={span} resolution={1024} color="#26313d" />

      <OrbitControls
        enableDamping dampingFactor={0.08}
        minPolarAngle={0.15} maxPolarAngle={1.35}
        minDistance={d * 0.4} maxDistance={d * 2.2}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

export default Floor3D;
