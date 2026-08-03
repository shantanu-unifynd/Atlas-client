import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import usePlanTexture from '../hooks/usePlanTexture';

const SPAN = 10; // world size of the plan's longer side

// Map a plan point (px,py) into world space on the XZ floor. Consistent with the
// textured plane so the route lines up with the plan.
function toWorld(p, W, H, planeW, planeH, y = 0) {
  return new THREE.Vector3((p.x / W - 0.5) * planeW, y, (p.y / H - 0.5) * planeH);
}

// One orchestrated walk-through: eases the camera along the route once, at eye
// level, looking ahead — then hands control back. No looping, no auto-spin.
function Walkthrough({ curve, playing, onEnd }) {
  const { camera } = useThree();
  const t = useRef(0);
  useEffect(() => {
    if (playing) t.current = 0;
  }, [playing]);
  useFrame((_, delta) => {
    if (!playing || !curve) return;
    t.current = Math.min(1, t.current + delta / 9);
    const here = curve.getPointAt(t.current);
    const ahead = curve.getPointAt(Math.min(1, t.current + 0.02));
    camera.position.lerp(new THREE.Vector3(here.x, 0.55, here.z), 0.15);
    camera.lookAt(ahead.x, 0.3, ahead.z);
    if (t.current >= 1) onEnd?.();
  });
  return null;
}

function Scene({ texture, size, nodes, routePath, originId, destId, playing, onEnd }) {
  const s = SPAN / Math.max(size.w, size.h);
  const planeW = size.w * s;
  const planeH = size.h * s;
  const posById = useMemo(() => new Map(nodes.map((n) => [n.id, n.position])), [nodes]);

  const curve = useMemo(() => {
    const pts = (routePath || [])
      .map((id) => posById.get(id))
      .filter(Boolean)
      .map((p) => toWorld(p, size.w, size.h, planeW, planeH, 0.06));
    return pts.length > 1 ? new THREE.CatmullRomCurve3(pts) : null;
  }, [routePath, posById, size, planeW, planeH]);

  const origin = originId && posById.get(originId);
  const dest = destId && posById.get(destId);

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[5, 10, 5]} intensity={0.5} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[planeW, planeH]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      {curve && (
        <mesh>
          <tubeGeometry args={[curve, Math.max(24, (routePath.length) * 6), 0.055, 8, false]} />
          <meshStandardMaterial color="#e8590c" emissive="#e8590c" emissiveIntensity={1.3} toneMapped={false} />
        </mesh>
      )}

      {origin && (
        <mesh position={toWorld(origin, size.w, size.h, planeW, planeH, 0.12)}>
          <sphereGeometry args={[0.12, 20, 20]} />
          <meshStandardMaterial color="#5b8cff" emissive="#5b8cff" emissiveIntensity={0.6} toneMapped={false} />
        </mesh>
      )}
      {dest && (
        <mesh position={toWorld(dest, size.w, size.h, planeW, planeH, 0.28)}>
          <coneGeometry args={[0.15, 0.5, 20]} />
          <meshStandardMaterial color="#aa3bff" emissive="#aa3bff" emissiveIntensity={0.7} toneMapped={false} />
        </mesh>
      )}

      <OrbitControls enabled={!playing} enablePan maxPolarAngle={Math.PI / 2.15} />
      <Walkthrough curve={curve} playing={playing} onEnd={onEnd} />
    </>
  );
}

function Scene3D({ svg, nodes, routePath, originId, destId, playing, onWalkEnd }) {
  const { texture, size } = usePlanTexture(svg);
  if (!texture || !size) return <div className="scene-loading">Preparing 3D…</div>;
  return (
    <Canvas camera={{ position: [0, SPAN * 0.85, SPAN * 0.95], fov: 50 }} dpr={[1, 2]}>
      <color attach="background" args={['#0b0d12']} />
      <Scene
        texture={texture}
        size={size}
        nodes={nodes}
        routePath={routePath}
        originId={originId}
        destId={destId}
        playing={playing}
        onEnd={onWalkEnd}
      />
    </Canvas>
  );
}

export default Scene3D;
