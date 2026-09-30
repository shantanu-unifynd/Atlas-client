import { useMemo, useRef, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, MeshReflectorMaterial, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';

// Cinematic "Nocturne" renderer — dark atrium mood, brass accents, reflective
// concourse, choreographed camera. Data-driven: reads the same published MPM as
// the 2.5D renderer (rooms[].polygon/centroid, walls[].polyline, graph.nodes[]
// {id,position,label}, coordinateSystem.bounds). No fixture-specific schema.

const S = 0.02;
const WALL_H = 150;
const INSET = 0.9;
const ROUTE_H = 24;

// Perf profile: phones / weak GPUs get cheaper reflections, shadows and dpr.
const LOW_PERF = typeof window !== 'undefined'
  && (Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4);

const INK = '#070709';
const BRASS = '#c9a35f';
const BRASS_HOT = '#ffe6ae';

// Warm-family interior glow per category, with a safe default for any label the
// backend produces (FASHION, F&B, DEPARTMENT, …).
const GLOW = {
  FASHION: '#ffd9ae', JEWELRY: '#fff0c4', BEAUTY: '#ffcdbd', ACCESSORIES: '#f6dcab',
  FOOTWEAR: '#ecd2ae', LIFESTYLE: '#e9d9b6', ELECTRONICS: '#cfe2ea', 'F&B': '#ffc890',
  DEPARTMENT: '#ffd9a0', ENTERTAINMENT: '#e6c8ff', ANCHOR: '#ffd9a0', LOBBY: '#d9e3e8',
};
const glowOf = (r) => GLOW[(r.category || '').toUpperCase()] || '#f0d8ac';

// ── shared procedural textures (created once) ──────────────────────────────────────
let glowTexShared = null;
let stoneTexShared = null;
function makeStoneTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#d3c8b4'; g.fillRect(0, 0, 512, 512);
  const TILE = 128;
  for (let ty = 0; ty < 4; ty += 1) {
    for (let tx = 0; tx < 4; tx += 1) {
      const j = (Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453) % 1;
      const l = 200 + Math.abs(j) * 22;
      g.fillStyle = `rgb(${l},${l - 8},${l - 24})`;
      g.fillRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
    }
  }
  g.strokeStyle = 'rgba(60,52,40,0.55)'; g.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    g.beginPath(); g.moveTo(i * TILE, 0); g.lineTo(i * TILE, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * TILE); g.lineTo(512, i * TILE); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function ensureTextures() {
  if (!glowTexShared) glowTexShared = makeGlowTexture();
  if (!stoneTexShared) { stoneTexShared = makeStoneTexture(); stoneTexShared.repeat.set(1 / 150, 1 / 150); }
}

// ── small helpers ──────────────────────────────────────────────────────────────────
const centroidOf = (r) => {
  if (r.centroid && Number.isFinite(r.centroid.x)) return r.centroid;
  const p = r.polygon;
  return { x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length };
};
function ribbonGeometry(points, width) {
  const half = width / 2; const pos = []; const uv = []; const idx = [];
  const n = points.length;
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    let tx = b.x - a.x; let tz = b.z - a.z;
    const len = Math.hypot(tx, tz) || 1; tx /= len; tz /= len;
    const v = i / (n - 1);
    pos.push(p.x - tz * half, p.y, p.z + tx * half, p.x + tz * half, p.y, p.z - tx * half);
    uv.push(0, v, 1, v);
  }
  for (let i = 0; i < n - 1; i += 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ── room block: extruded volume, dark walls, brass crown, warm interior glow ───────
// Robust on any traced polygon (no vertex-order / storefront assumption).
function Unit({ room, dimmed, active, hovered, onHover, onPick }) {
  const glow = useMemo(() => new THREE.Color(glowOf(room)), [room]);
  const { volume, edges, roofGeo } = useMemo(() => {
    const poly = room.polygon;
    const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p.y, 0) / poly.length;
    const pts = poly.map((p) => ({ x: cx + (p.x - cx) * INSET, y: cy + (p.y - cy) * INSET }));
    const shape = new THREE.Shape();
    pts.forEach((p, i) => (i ? shape.lineTo(p.x, p.y) : shape.moveTo(p.x, p.y)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: WALL_H, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const roof = new THREE.ShapeGeometry(shape, 2);
    roof.rotateX(-Math.PI / 2);
    return { volume: geo, edges: new THREE.EdgesGeometry(geo, 18), roofGeo: roof };
  }, [room.polygon]);

  const grp = useRef();
  const glowRef = useRef();
  const crownRef = useRef();
  useFrame(() => {
    if (!grp.current) return;
    const lift = hovered ? 9 : active ? 5 : 0;
    grp.current.position.y += (lift - grp.current.position.y) * 0.12;
    const ts = dimmed ? 0.5 : 1;
    grp.current.scale.y += (ts - grp.current.scale.y) * 0.09;
    if (glowRef.current) {
      const t = dimmed ? 0.05 : hovered ? 0.42 : active ? 0.36 : 0.16;
      glowRef.current.material.emissiveIntensity += (t - glowRef.current.material.emissiveIntensity) * 0.1;
    }
    if (crownRef.current) {
      const t = dimmed ? 0.12 : hovered || active ? 0.95 : 0.4;
      crownRef.current.material.opacity += (t - crownRef.current.material.opacity) * 0.1;
    }
  });

  return (
    <group ref={grp}>
      <mesh
        geometry={volume}
        castShadow
        receiveShadow
        onPointerOver={(e) => { e.stopPropagation(); onHover?.(room); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover?.(null); document.body.style.cursor = 'auto'; }}
        onClick={(e) => { e.stopPropagation(); onPick?.(room); }}
      >
        <meshStandardMaterial color={room.source === 'MANUAL' ? '#211d26' : '#1b1820'} roughness={0.82} metalness={0.08} />
      </mesh>
      {/* warm interior glow washing up the roof face */}
      <mesh geometry={roofGeo} ref={glowRef} position={[0, WALL_H - 0.5, 0]}>
        <meshStandardMaterial color="#2a2632" emissive={glow} emissiveIntensity={0.16} roughness={0.7} metalness={0.1} />
      </mesh>
      {/* brass crown edge */}
      <lineSegments geometry={edges} ref={crownRef} position={[0, 0.4, 0]}>
        <lineBasicMaterial color={active || hovered ? BRASS_HOT : BRASS} transparent opacity={0.4} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

// ── walls (thin dark slabs) — only if the floor carries wall geometry ──────────────
function Walls({ walls }) {
  const segs = useMemo(() => {
    const out = [];
    (walls || []).forEach((w, wi) => {
      const pl = w.polyline || [];
      for (let i = 0; i < pl.length - 1; i += 1) {
        const a = pl[i]; const b = pl[i + 1];
        const dx = b.x - a.x; const dy = b.y - a.y;
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
      <boxGeometry args={[s.len, H, 7]} />
      <meshStandardMaterial color="#17141b" roughness={0.85} metalness={0.06} />
    </mesh>
  ));
}

// ── reflective concourse floor sized from the floor bounds ─────────────────────────
function Concourse({ w, h, routeActive }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[w * 1.2, h * 1.2]} />
      <MeshReflectorMaterial
        resolution={LOW_PERF ? 256 : 512} mixBlur={0.85} mixStrength={0.7} blur={[160, 50]}
        roughness={0.34} depthScale={0.6} minDepthThreshold={0.4} maxDepthThreshold={1.2}
        color={routeActive ? '#5f5647' : '#a89c86'} metalness={0.06} map={stoneTexShared}
        envMapIntensity={routeActive ? 0.25 : 0.5}
      />
    </mesh>
  );
}

// ── animated route ribbon (shader) ─────────────────────────────────────────────────
function useRoutePts(graph, routePath) {
  return useMemo(() => {
    const pos = new Map(((graph && graph.nodes) || []).map((n) => [n.id, n.position]));
    const pts = (routePath || []).map((id) => pos.get(id)).filter((p) => p && Number.isFinite(p.x));
    if (pts.length < 2) return null;
    const vs = pts.map((p) => new THREE.Vector3(p.x, ROUTE_H, -p.y));
    return new THREE.CatmullRomCurve3(vs, false, 'centripetal', 0.9).getPoints(180);
  }, [graph, routePath]);
}
function RouteRibbon({ graph, routePath }) {
  const pts = useRoutePts(graph, routePath);
  const material = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    uniforms: {
      uTime: { value: 0 }, uReveal: { value: 0 },
      uBase: { value: new THREE.Color('#b06f1f') }, uHot: { value: new THREE.Color('#ffb84d') },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `
      varying vec2 vUv; uniform float uTime; uniform float uReveal; uniform vec3 uBase; uniform vec3 uHot;
      void main(){
        if (vUv.y > uReveal) discard;
        float edge = smoothstep(0.0,0.18,vUv.x)*smoothstep(1.0,0.82,vUv.x);
        float f = fract(vUv.y*3.0 - uTime*0.5);
        float pulse = smoothstep(0.0,0.06,f)*smoothstep(0.34,0.14,f);
        float head = 1.0 - smoothstep(uReveal-0.05, uReveal, vUv.y);
        vec3 col = mix(uBase, uHot, max(pulse, 1.0-head)) * 2.4;
        gl_FragColor = vec4(col, edge*(0.9 + 0.1*pulse));
      }`,
  }), []);
  const under = useMemo(() => new THREE.MeshBasicMaterial({
    color: new THREE.Color('#140c02'), transparent: true, opacity: 0.55,
    depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }), []);
  const geo = useMemo(() => (pts ? ribbonGeometry(pts, 26) : null), [pts]);
  const underGeo = useMemo(() => (pts ? ribbonGeometry(pts, 44) : null), [pts]);
  const key = (routePath || []).join('|');
  useEffect(() => { material.uniforms.uReveal.value = 0; }, [key, material]);
  useFrame((_, dt) => {
    material.uniforms.uTime.value += dt;
    material.uniforms.uReveal.value = Math.min(1, material.uniforms.uReveal.value + dt / 1.5);
  });
  if (!geo) return null;
  return (
    <group>
      <mesh geometry={underGeo} material={under} position={[0, -1.5, 0]} renderOrder={39} />
      <mesh geometry={geo} material={material} renderOrder={40} />
    </group>
  );
}

// ── origin pulse + floating destination beacon ─────────────────────────────────────
function RouteMarkers({ graph, routePath }) {
  const ring = useRef();
  const gem = useRef();
  const ends = useMemo(() => {
    const pos = new Map(((graph && graph.nodes) || []).map((n) => [n.id, n.position]));
    const pts = (routePath || []).map((id) => pos.get(id)).filter((p) => p && Number.isFinite(p.x));
    if (pts.length < 2) return null;
    return { o: pts[0], d: pts[pts.length - 1] };
  }, [graph, routePath]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) {
      const s = 1 + (t * 0.9 % 1) * 1.6;
      ring.current.scale.set(s, s, s);
      ring.current.material.opacity = 0.55 * (1 - (t * 0.9 % 1));
    }
    if (gem.current) {
      gem.current.rotation.y = t * 1.2;
      gem.current.position.y = Math.sin(t * 2) * 9;
    }
  });
  if (!ends) return null;
  return (
    <group>
      <mesh ref={ring} position={[ends.o.x, ROUTE_H + 2, -ends.o.y]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={41}>
        <ringGeometry args={[18, 26, 40]} />
        <meshBasicMaterial color={BRASS_HOT} toneMapped={false} transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[ends.d.x, ROUTE_H + 1.5, -ends.d.y]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={41}>
        <circleGeometry args={[30, 36]} />
        <meshBasicMaterial map={glowTexShared} color="#ffcf7d" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[ends.d.x, ROUTE_H + 2, -ends.d.y]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={42}>
        <ringGeometry args={[20, 24, 40]} />
        <meshBasicMaterial color="#ffb84d" toneMapped={false} transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={gem} position={[ends.d.x, 0, -ends.d.y]}>
        <mesh position={[0, 232, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[17, 52, 24]} />
          <meshStandardMaterial color={BRASS} emissive={BRASS_HOT} emissiveIntensity={1.9} metalness={0.75} roughness={0.25} toneMapped={false} />
        </mesh>
        <mesh position={[0, 272, 0]}>
          <sphereGeometry args={[23, 22, 22]} />
          <meshStandardMaterial color={BRASS} emissive={BRASS_HOT} emissiveIntensity={2.2} metalness={0.75} roughness={0.25} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// ── brass name pins (HTML), emphasised for hover + route endpoints ─────────────────
function Labels({ rooms, hoveredId, endpointNames }) {
  const named = useMemo(() => (rooms || []).filter((r) => r.name && r.polygon), [rooms]);
  return named.map((r) => {
    const c = centroidOf(r);
    const hot = hoveredId === r.id || endpointNames.has(r.name);
    return (
      <Html key={r.id} position={[c.x, WALL_H + 60, -c.y]} center zIndexRange={[8, 0]}
        style={{ pointerEvents: 'none', userSelect: 'none' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
          padding: hot ? '5px 13px' : '4px 11px', borderRadius: 999,
          background: 'rgba(10,8,6,0.78)',
          border: `1px solid ${hot ? 'rgba(255,230,174,0.95)' : 'rgba(201,163,95,0.4)'}`,
          backdropFilter: 'blur(8px)',
          boxShadow: hot ? '0 10px 30px rgba(0,0,0,0.6)' : '0 4px 14px rgba(0,0,0,0.4)',
          transition: 'all .18s ease', transform: hot ? 'scale(1.06)' : 'scale(1)',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: BRASS_HOT, boxShadow: `0 0 9px ${BRASS}` }} />
          <span style={{
            fontFamily: '"Manrope", system-ui, sans-serif', fontWeight: 600,
            fontSize: 'clamp(12px, 0.5vw + 8px, 19px)',
            letterSpacing: '0.06em', color: hot ? '#ffefd0' : 'rgba(240,226,198,0.85)',
          }}>{r.name}</span>
        </div>
      </Html>
    );
  });
}

// ── scene assembly ─────────────────────────────────────────────────────────────────
function FloorModel({ mpm, routePath, hoveredId, onHover, onPick }) {
  ensureTextures();
  const cs = mpm && mpm.coordinateSystem && mpm.coordinateSystem.bounds;
  const rooms = (mpm && mpm.rooms) || [];
  const walls = (mpm && mpm.walls) || [];
  const graph = mpm && mpm.graph;
  const polyRooms = useMemo(
    () => rooms.filter((r) => r.polygon && r.polygon.length >= 3
      && r.polygon.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))),
    [rooms]
  );
  if (!cs) return null;

  const w = cs.maxX - cs.minX;
  const h = cs.maxY - cs.minY;
  const cx = (cs.minX + cs.maxX) / 2;
  const cy = (cs.minY + cs.maxY) / 2;
  const nodeById = new Map(((graph && graph.nodes) || []).map((n) => [n.id, n]));
  const routeActive = (routePath || []).length > 1;
  const endpointNames = routeActive
    ? new Set([nodeById.get(routePath[0])?.label, nodeById.get(routePath[routePath.length - 1])?.label].filter(Boolean))
    : new Set();
  const isEndpoint = (r) => r.name && endpointNames.has(r.name);

  return (
    <group scale={[S, S, S]}>
      <Concourse w={w} h={h} routeActive={routeActive} />
      {/* surrounding ground so the floor never floats in a void */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -18, 0]}>
        <circleGeometry args={[Math.max(w, h) * 2.2, 48]} />
        <meshStandardMaterial color="#0b0a10" roughness={0.95} metalness={0} />
      </mesh>
      <group position={[-cx, 0, cy]}>
        {polyRooms.map((r) => (
          <Unit key={r.id} room={r}
            dimmed={routeActive && !isEndpoint(r)} active={isEndpoint(r)}
            hovered={hoveredId === r.id} onHover={onHover} onPick={onPick} />
        ))}
        <Walls walls={walls} />
        <RouteRibbon graph={graph} routePath={routePath} />
        <RouteMarkers graph={graph} routePath={routePath} />
        <Labels rooms={rooms} hoveredId={hoveredId} endpointNames={endpointNames} />
      </group>
    </group>
  );
}

// ── camera choreography: intro sweep, route framing, step focus, idle drift ────────
function CameraDirector({ controlsRef, worldPts, focusPoint, span, onStart, onEnd }) {
  const { camera } = useThree();
  const dir = useMemo(() => new THREE.Vector3(0.1, 1.0, -0.68).normalize(), []);
  const routeDir = useMemo(() => new THREE.Vector3(0.08, 1.5, -0.52).normalize(), []);
  const anim = useRef(null);
  const idle = useRef(0);

  function glideTo(center, dist, dur = 1.8, d = dir) {
    anim.current = {
      t: 0, dur,
      fromPos: camera.position.clone(),
      fromTarget: controlsRef.current ? controlsRef.current.target.clone() : new THREE.Vector3(),
      toPos: center.clone().add(d.clone().multiplyScalar(dist)),
      toTarget: center.clone(),
    };
    onStart?.();
  }
  useEffect(() => {
    camera.position.set(-span * 1.35, span * 0.4, -span * 1.5);
    glideTo(new THREE.Vector3(0, 0, -span * 0.04), span * 0.94, 3.2);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!worldPts || worldPts.length < 2) return;
    const box = new THREE.Box3().setFromPoints(worldPts);
    const s = box.getSize(new THREE.Vector3()).length() || 4;
    glideTo(box.getCenter(new THREE.Vector3()), Math.min(Math.max(s * 1.45, span * 0.42), span * 1.05), 2.0, routeDir);
  }, [worldPts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (focusPoint) glideTo(focusPoint, span * 0.34, 1.4, routeDir);
  }, [focusPoint]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, delta) => {
    const a = anim.current;
    if (a) {
      a.t = Math.min(1, a.t + delta / a.dur);
      const e = a.t < 0.5 ? 4 * a.t * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 3) / 2;
      camera.position.lerpVectors(a.fromPos, a.toPos, e);
      const tgt = new THREE.Vector3().lerpVectors(a.fromTarget, a.toTarget, e);
      camera.lookAt(tgt);
      if (controlsRef.current) controlsRef.current.target.copy(tgt);
      if (a.t >= 1) { anim.current = null; controlsRef.current?.update(); onEnd?.(); }
    } else if (controlsRef.current) {
      idle.current += delta * 0.04;
      controlsRef.current.setAzimuthalAngle(controlsRef.current.getAzimuthalAngle() + Math.sin(idle.current) * delta * 0.011);
    }
  });
  return null;
}

function Floor3D({ mpm, routePath = [], focusT = null, onPick }) {
  const cs = mpm && mpm.coordinateSystem && mpm.coordinateSystem.bounds;
  const span = cs ? Math.max(cs.maxX - cs.minX, cs.maxY - cs.minY) * S : 48;
  const cx = cs ? (cs.minX + cs.maxX) / 2 : 0;
  const cy = cs ? (cs.minY + cs.maxY) / 2 : 0;
  const controlsRef = useRef();
  const [gliding, setGliding] = useState(false);
  const [hoveredId, setHoveredId] = useState(null);

  const worldRoute = useMemo(() => {
    if (!cs) return null;
    const pos = new Map(((mpm && mpm.graph && mpm.graph.nodes) || []).map((n) => [n.id, n.position]));
    const pts = (routePath || []).map((id) => pos.get(id)).filter((p) => p && Number.isFinite(p.x));
    if (pts.length < 2) return null;
    return pts.map((p) => new THREE.Vector3((p.x - cx) * S, ROUTE_H * S, (cy - p.y) * S));
  }, [mpm, routePath, cx, cy, cs]);

  // step-focus: arc-length point along the route for the active instruction
  const focusPoint = useMemo(() => {
    if (focusT == null || !worldRoute || worldRoute.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < worldRoute.length; i += 1) cum[i] = cum[i - 1] + worldRoute[i].distanceTo(worldRoute[i - 1]);
    const total = cum[cum.length - 1] || 1;
    const want = focusT * total;
    for (let i = 1; i < worldRoute.length; i += 1) {
      if (cum[i] >= want) {
        const f = (want - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
        return new THREE.Vector3().lerpVectors(worldRoute[i - 1], worldRoute[i], f);
      }
    }
    return worldRoute[worldRoute.length - 1].clone();
  }, [focusT, worldRoute]);

  return (
    <Canvas
      shadows
      dpr={LOW_PERF ? [1, 1.5] : [1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => { gl.toneMappingExposure = 1.05; }}
      camera={{ position: [0, span * 0.7, -span * 1.1], fov: 33, near: 0.1, far: 3000 }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      <color attach="background" args={[INK]} />
      <fog attach="fog" args={[INK, span * 1.6, span * 4.4]} />

      <ambientLight intensity={0.3} color="#93a3c4" />
      <hemisphereLight args={['#39415c', '#0c0906', 0.5]} />
      <directionalLight
        position={[span * 0.45, span * 1.6, -span * 0.4]} intensity={1.0} color="#ffd9a4"
        castShadow shadow-mapSize={LOW_PERF ? [1024, 1024] : [2048, 2048]} shadow-bias={-0.0005}
        shadow-camera-left={-span * 0.9} shadow-camera-right={span * 0.9}
        shadow-camera-top={span * 0.9} shadow-camera-bottom={-span * 0.9} shadow-camera-far={span * 4}
      />
      <directionalLight position={[-span * 0.8, span * 0.6, span * 0.6]} intensity={0.45} color="#7d93cc" />

      <Suspense fallback={null}>
        <Environment preset="warehouse" environmentIntensity={0.28} />
      </Suspense>
      <Suspense fallback={null}>
        <FloorModel mpm={mpm} routePath={routePath} hoveredId={hoveredId}
          onHover={(r) => setHoveredId(r ? r.id : null)} onPick={onPick} />
      </Suspense>

      <CameraDirector controlsRef={controlsRef} worldPts={worldRoute} focusPoint={focusPoint} span={span}
        onStart={() => setGliding(true)} onEnd={() => setGliding(false)} />

      <OrbitControls ref={controlsRef} makeDefault enabled={!gliding}
        enableDamping dampingFactor={0.08}
        enablePan screenSpacePanning={false} panSpeed={0.85} rotateSpeed={0.75}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
        minPolarAngle={0.22} maxPolarAngle={1.28} minDistance={span * 0.28} maxDistance={span * 1.6} />

      <EffectComposer disableNormalPass multisampling={0}>
        <Bloom mipmapBlur intensity={0.9} luminanceThreshold={0.72} luminanceSmoothing={0.2} radius={0.7} />
        <Noise opacity={0.045} />
        <ToneMapping />
        <Vignette eskil={false} offset={0.26} darkness={0.8} />
        <SMAA />
      </EffectComposer>
    </Canvas>
  );
}

export default Floor3D;
