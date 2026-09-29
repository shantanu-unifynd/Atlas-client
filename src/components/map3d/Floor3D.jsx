import { useMemo, useRef, useEffect, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Text, MeshReflectorMaterial, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, SMAA, ToneMapping, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';

// ── Palladium UG · "Nocturne Atrium" renderer ──────────────────────────────────
// A real indoor space, not a grid of blocks: a curved polished-stone concourse,
// glass storefronts with warm lit interiors and fascia signage, an elliptical
// atrium void with escalators and a ring chandelier, a colonnade, an enclosing
// shell plinth, and a champagne route ribbon that reveals itself and flows around
// the void. Plan (x,y) maps to world (x, height, -y); everything lives in plan
// units inside a group scaled by S.

const S = 0.02;
const ROUTE_H = 24;

// Perf profile: phones / weak GPUs get cheaper reflections, shadows and dpr.
const LOW_PERF = typeof window !== 'undefined'
  && (Math.min(window.innerWidth, window.innerHeight) < 700 || (navigator.hardwareConcurrency || 8) <= 4);

const H_SHOP = 175;
const H_ANCHOR = 218;
const H_LOBBY = 196;
const FASCIA_H = 42;

const INK = '#070709';
const BRASS = '#c9a35f';
const BRASS_HOT = '#ffe6ae';
const IVORY = '#f3e7cd';

// Warm-family interior glow per category — hue nudges, one palette.
const GLOW = {
  ANCHOR: '#ffd9a0', FASHION: '#ffd9ae', JEWELRY: '#fff0c4', BEAUTY: '#ffcdbd',
  ACCESSORIES: '#f6dcab', FOOTWEAR: '#ecd2ae', LIFESTYLE: '#e9d9b6',
  ELECTRONICS: '#cfe2ea', 'F&B': '#ffc890', LOBBY: '#d9e3e8', CIRCULATION: '#e4c07a',
};
const glowOf = (r) => GLOW[(r.category || '').toUpperCase()] || '#f0d8ac';
const heightOf = (r) => {
  const c = (r.category || '').toUpperCase();
  if (c === 'ANCHOR') return H_ANCHOR;
  if (c === 'LOBBY') return H_LOBBY;
  return H_SHOP;
};

// ---- small math helpers (plan space, y-down) -------------------------------------
const mid2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const centroid2 = (poly) => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
});

function planShape(poly, holes = []) {
  const s = new THREE.Shape();
  poly.forEach((p, i) => (i ? s.lineTo(p.x, p.y) : s.moveTo(p.x, p.y)));
  s.closePath();
  holes.forEach((h) => {
    const path = new THREE.Path();
    h.forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
    path.closePath();
    s.holes.push(path);
  });
  return s;
}
// Flat geometry laid onto XZ (plan y → -z), normal up.
function flatGeo(poly, holes) {
  const g = new THREE.ShapeGeometry(planShape(poly, holes), 2);
  g.rotateX(-Math.PI / 2);
  return g;
}
function loopGeo(poly, h) {
  const arr = [];
  poly.forEach((p) => arr.push(p.x, h, -p.y));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

// ---- procedural textures ----------------------------------------------------------
function makeStoneTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#d3c8b4';
  g.fillRect(0, 0, 512, 512);
  const TILE = 128;
  for (let ty = 0; ty < 4; ty += 1) {
    for (let tx = 0; tx < 4; tx += 1) {
      const j = (Math.sin(tx * 12.9898 + ty * 78.233) * 43758.5453) % 1;
      const l = 200 + Math.abs(j) * 22;
      g.fillStyle = `rgb(${l},${l - 8},${l - 24})`;
      g.fillRect(tx * TILE + 1, ty * TILE + 1, TILE - 2, TILE - 2);
      // faint diagonal veining
      g.strokeStyle = 'rgba(120,105,84,0.16)';
      g.lineWidth = 1;
      for (let v = 0; v < 3; v += 1) {
        const sx = tx * TILE + Math.abs((j * (v + 3) * 997) % 1) * TILE;
        const sy = ty * TILE;
        g.beginPath();
        g.moveTo(sx, sy);
        g.bezierCurveTo(sx + 30, sy + 40, sx - 24, sy + 80, sx + 12, sy + TILE);
        g.stroke();
      }
    }
  }
  // grout
  g.strokeStyle = 'rgba(60,52,40,0.55)';
  g.lineWidth = 2;
  for (let i = 0; i <= 4; i += 1) {
    g.beginPath(); g.moveTo(i * TILE, 0); g.lineTo(i * TILE, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * TILE); g.lineTo(512, i * TILE); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
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
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function makeBeamTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ── storefront-bearing unit ────────────────────────────────────────────────────────
// polygon[0]→polygon[1] is the concourse-facing edge (fixture convention, with a
// centroid-based orientation fix so any sane polygon still works).
function Unit({ room, dimmed, active, onHover, onPick, hovered }) {
  const H = heightOf(room);
  const isLobby = (room.category || '').toUpperCase() === 'LOBBY';
  const glow = useMemo(() => new THREE.Color(glowOf(room)), [room]);

  const d = useMemo(() => {
    const poly = room.polygon;
    let A = poly[0]; let B = poly[1];
    const c = centroid2(poly);
    let D = { x: B.x - A.x, y: B.y - A.y };
    const L = Math.hypot(D.x, D.y) || 1;
    D = { x: D.x / L, y: D.y / L };
    let nrm = { x: D.y, y: -D.x }; // local +z after rotY
    const M = mid2(A, B);
    if ((M.x - c.x) * nrm.x + (M.y - c.y) * nrm.y < 0) {
      [A, B] = [B, A];
      D = { x: -D.x, y: -D.y };
      nrm = { x: -nrm.x, y: -nrm.y };
    }
    const ry = Math.atan2(D.y, D.x);
    // depth of unit ≈ distance from front edge mid to centroid, doubled
    const depth = 2 * Math.hypot(c.x - M.x, c.y - M.y);
    // side walls: every edge except 0-1
    const walls = [];
    for (let i = 1; i < poly.length; i += 1) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      walls.push({ mid: mid2(a, b), ry: Math.atan2(b.y - a.y, b.x - a.x), len });
    }
    // flat roof-name orientation: read along the storefront, top pointing north
    let rz = Math.atan2(D.y, D.x);
    if (Math.cos(rz) > 0) rz += Math.PI;
    return { A, B, M, D, nrm, ry, rz, L, c, depth, walls };
  }, [room.polygon]);

  const roofGeo = useMemo(() => flatGeo(room.polygon), [room.polygon]);
  const floorGeo = useMemo(() => flatGeo(room.polygon), [room.polygon]);
  const crownGeo = useMemo(() => loopGeo(room.polygon, H + 1.5), [room.polygon, H]);
  const catchGeo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(planShape(room.polygon), { depth: H, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [room.polygon, H]);

  const name = (room.name || '').toUpperCase();
  const displayName = isLobby ? 'RESIDENCES' : name;
  const glassW = d.L * 0.94;
  const glassH = H - FASCIA_H - 8;
  const fontSize = Math.min(30, (d.L * 0.8) / Math.max(displayName.length * 0.68, 1));

  const grp = useRef();
  const glowRef = useRef();
  const crownRef = useRef();
  const fasciaGlowRef = useRef();

  useFrame(() => {
    if (!grp.current) return;
    const lift = hovered ? 9 : active ? 5 : 0;
    grp.current.position.y += (lift - grp.current.position.y) * 0.12;
    // route mode: non-relevant units crouch so the path reads end-to-end
    const ts = dimmed ? 0.5 : 1;
    grp.current.scale.y += (ts - grp.current.scale.y) * 0.09;
    if (glowRef.current) {
      const t = dimmed ? 0.16 : hovered ? 1.25 : active ? 1.1 : 0.62;
      glowRef.current.material.opacity += (t * 0.5 - glowRef.current.material.opacity) * 0.1;
    }
    if (fasciaGlowRef.current) {
      const t = dimmed ? 0.3 : hovered || active ? 2.6 : 1.15;
      fasciaGlowRef.current.material.emissiveIntensity += (t - fasciaGlowRef.current.material.emissiveIntensity) * 0.1;
    }
    if (crownRef.current) {
      const t = dimmed ? 0.12 : hovered || active ? 0.9 : 0.3;
      crownRef.current.material.opacity += (t - crownRef.current.material.opacity) * 0.1;
    }
  });

  return (
    <group ref={grp}>
      {/* invisible raycast catcher over the whole volume */}
      <mesh
        geometry={catchGeo}
        onPointerOver={(e) => { e.stopPropagation(); onHover?.(room); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover?.(null); document.body.style.cursor = 'auto'; }}
        onClick={(e) => { e.stopPropagation(); onPick?.(room); }}
      >
        <meshBasicMaterial colorWrite={false} depthWrite={false} />
      </mesh>

      {/* interior floor, softly lit */}
      <mesh geometry={floorGeo} position={[0, 1.2, 0]}>
        <meshStandardMaterial color="#26211f" roughness={0.9} emissive={glow} emissiveIntensity={dimmed ? 0.03 : 0.1} />
      </mesh>

      {/* roof slab */}
      <mesh geometry={roofGeo} position={[0, H, 0]} castShadow receiveShadow>
        <meshStandardMaterial color="#2a2632" roughness={0.78} metalness={0.12} />
      </mesh>
      {/* roof name — world-space, so it stays legible at any zoom without hover */}
      <Text
        font="/fonts/Marcellus-Regular.ttf"
        position={[d.c.x, H + 2.6, -d.c.y]}
        rotation={[-Math.PI / 2, 0, d.rz]}
        fontSize={Math.min(44, (d.L * 0.72) / Math.max(name.length * 0.66, 1), d.depth * 0.36)}
        letterSpacing={0.14}
        anchorX="center"
        anchorY="middle"
        color={active ? '#ffe3a2' : dimmed ? '#5d5647' : '#d9cdb2'}
      >
        {name}
      </Text>
      <lineLoop geometry={crownGeo} ref={crownRef}>
        <lineBasicMaterial color={active || hovered ? BRASS_HOT : BRASS} transparent opacity={0.3} toneMapped={false} />
      </lineLoop>

      {/* side + back walls */}
      {d.walls.map((w, i) => (
        <mesh key={i} position={[w.mid.x, H / 2, -w.mid.y]} rotation={[0, w.ry, 0]} castShadow receiveShadow>
          <boxGeometry args={[w.len, H, 7]} />
          <meshStandardMaterial color="#1b1820" roughness={0.82} metalness={0.05} />
        </mesh>
      ))}

      {/* storefront assembly */}
      <group position={[d.M.x, 0, -d.M.y]} rotation={[0, d.ry, 0]}>
        {/* interior back-lit display wall */}
        <mesh position={[0, 44, -d.depth * 0.52]}>
          <boxGeometry args={[d.L * 0.72, 88, 8]} />
          <meshStandardMaterial color="#2c241d" emissive={glow} emissiveIntensity={dimmed ? 0.06 : 0.5} roughness={0.7} />
        </mesh>
        {/* warm interior glow plane (reads through the glass) */}
        <mesh ref={glowRef} position={[0, glassH * 0.42, -22]}>
          <planeGeometry args={[glassW * 0.92, glassH * 0.85]} />
          <meshBasicMaterial color={glow} transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        {/* glass */}
        <mesh position={[0, glassH / 2 + 4, 0]}>
          <planeGeometry args={[glassW, glassH]} />
          <meshPhysicalMaterial
            color="#9fb4b8" transparent opacity={0.16} roughness={0.06} metalness={0}
            envMapIntensity={1.5} clearcoat={1} clearcoatRoughness={0.1} side={THREE.DoubleSide} depthWrite={false}
          />
        </mesh>
        {/* mullions + side piers */}
        {[-glassW / 2, -glassW / 6, glassW / 6, glassW / 2].map((x, i) => (
          <mesh key={i} position={[x, glassH / 2 + 4, 0]}>
            <boxGeometry args={[i === 0 || i === 3 ? 7 : 2.6, glassH, 5]} />
            <meshStandardMaterial color="#141217" roughness={0.5} metalness={0.5} />
          </mesh>
        ))}
        {/* brass threshold */}
        <mesh position={[0, 2.2, 2]}>
          <boxGeometry args={[glassW, 1.6, 3]} />
          <meshStandardMaterial color={BRASS} emissive={BRASS} emissiveIntensity={0.45} metalness={0.8} roughness={0.3} toneMapped={false} />
        </mesh>
        {/* fascia band + signage */}
        <mesh ref={fasciaGlowRef} position={[0, H - FASCIA_H / 2 + 2, 1]}>
          <boxGeometry args={[d.L * 0.985, FASCIA_H, 10]} />
          <meshStandardMaterial color="#171319" emissive="#3d2f1a" emissiveIntensity={1.1} roughness={0.55} metalness={0.25} />
        </mesh>
        <Text
          font="/fonts/Marcellus-Regular.ttf"
          position={[0, H - FASCIA_H / 2 + 2, 6.8]}
          fontSize={fontSize}
          letterSpacing={0.18}
          anchorX="center"
          anchorY="middle"
          color={dimmed ? '#7a6a4e' : IVORY}
        >
          {displayName}
        </Text>
        {/* warm light spill onto the concourse */}
        <mesh position={[0, 2.6, 34]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[glassW * 0.9, 66]} />
          <meshBasicMaterial
            map={glowTexShared} color={glow} transparent opacity={dimmed ? 0.05 : 0.22}
            blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false}
          />
        </mesh>
      </group>
    </group>
  );
}

// module-level shared textures (created once)
let glowTexShared = null;
let beamTexShared = null;
let stoneTexShared = null;
function ensureTextures() {
  if (!glowTexShared) glowTexShared = makeGlowTexture();
  if (!beamTexShared) beamTexShared = makeBeamTexture();
  if (!stoneTexShared) {
    stoneTexShared = makeStoneTexture();
    stoneTexShared.repeat.set(1 / 150, 1 / 150);
  }
}

// ── concourse: polished stone with a real reflection ───────────────────────────────
function Concourse({ walkway, atriumHole, routeActive }) {
  const shape = useMemo(() => planShape(walkway, atriumHole ? [atriumHole] : []), [walkway, atriumHole]);
  const edge = useMemo(() => loopGeo(walkway, 3.2), [walkway]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.8, 0]} receiveShadow>
        <shapeGeometry args={[shape, 2]} />
        <MeshReflectorMaterial
          resolution={LOW_PERF ? 256 : 512} mixBlur={0.85} mixStrength={0.7} blur={[160, 50]}
          roughness={0.32} depthScale={0.6} minDepthThreshold={0.4} maxDepthThreshold={1.2}
          color={routeActive ? '#6e6350' : '#b9ad97'} metalness={0.06} map={stoneTexShared}
          envMapIntensity={routeActive ? 0.25 : 0.5}
        />
      </mesh>
      <lineLoop geometry={edge}>
        <lineBasicMaterial color={BRASS} transparent opacity={0.55} toneMapped={false} />
      </lineLoop>
    </group>
  );
}

// ── base slab + surrounding ground ─────────────────────────────────────────────────
function BaseSlab({ shell, atriumHole }) {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(planShape(shell, atriumHole ? [atriumHole] : []), { depth: 16, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); // plan → XZ, extrusion rises +y
    g.translate(0, -15.5, 0); // top face just under the finishes
    return g;
  }, [shell, atriumHole]);
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial color="#161320" roughness={0.72} metalness={0.1} />
    </mesh>
  );
}

// ── atrium: void, glass balustrade, escalators, chandelier ─────────────────────────
function Atrium({ ring, escRoom }) {
  const center = useMemo(() => centroid2(ring), [ring]);
  const lowerGeo = useMemo(() => flatGeo(ring), [ring]);
  const rimGeo = useMemo(() => {
    const outer = ring.map((p) => ({
      x: center.x + (p.x - center.x) * 1.07, y: center.y + (p.y - center.y) * 1.07,
    }));
    const g = new THREE.ShapeGeometry(planShape(outer, [ring]), 2);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [ring, center]);
  const balGeo = useMemo(() => loopGeo(ring, 0), [ring]);

  // escalator pair from the CIRCULATION room quad
  const esc = useMemo(() => {
    if (!escRoom) return null;
    const p = escRoom.polygon;
    const c = centroid2(p);
    const D = { x: p[1].x - p[0].x, y: p[1].y - p[0].y };
    const len = Math.hypot(D.x, D.y);
    return { c, ry: Math.atan2(D.y / len, D.x / len), len };
  }, [escRoom]);

  const chandelier = useRef();
  useFrame((_, dt) => { if (chandelier.current) chandelier.current.rotation.y += dt * 0.08; });

  const DROP = 72;
  const angle = Math.atan2(DROP + 6, (esc ? esc.len : 240) * 0.86);

  return (
    <group>
      {/* lower-ground floor visible through the void */}
      <mesh geometry={lowerGeo} position={[0, -DROP, 0]}>
        <meshStandardMaterial color="#171316" roughness={0.9} emissive="#382a18" emissiveIntensity={0.22} />
      </mesh>
      <mesh position={[center.x, -DROP + 1.5, -center.y]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[70, 32]} />
        <meshBasicMaterial map={glowTexShared} color="#e0b877" transparent opacity={0.5} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>

      {/* glowing brass rim ring */}
      <mesh geometry={rimGeo} position={[0, 2.6, 0]}>
        <meshStandardMaterial color={BRASS} emissive={BRASS} emissiveIntensity={0.9} metalness={0.7} roughness={0.3} toneMapped={false} />
      </mesh>

      {/* glass balustrade */}
      {ring.map((p, i) => {
        const q = ring[(i + 1) % ring.length];
        const m = mid2(p, q);
        const len = Math.hypot(q.x - p.x, q.y - p.y);
        return (
          <mesh key={i} position={[m.x, 17, -m.y]} rotation={[0, Math.atan2(q.y - p.y, q.x - p.x), 0]}>
            <planeGeometry args={[len, 28]} />
            <meshPhysicalMaterial color="#aebfc2" transparent opacity={0.14} roughness={0.08} envMapIntensity={1.2} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        );
      })}

      {/* escalators crossing the void */}
      {esc && (
        <group position={[esc.c.x, 0, -esc.c.y]} rotation={[0, esc.ry, 0]}>
          {[+1, -1].map((s) => (
            <group key={s} position={[0, 0, s * 15]} rotation={[0, 0, s * angle]}>
              <mesh position={[0, -DROP / 2 + 4, 0]}>
                <boxGeometry args={[esc.len * 0.86, 9, 24]} />
                <meshStandardMaterial color="#25222a" metalness={0.55} roughness={0.35} />
              </mesh>
              <mesh position={[0, -DROP / 2 + 9.2, 0]}>
                <boxGeometry args={[esc.len * 0.84, 1.4, 18]} />
                <meshStandardMaterial color="#0c0b0e" emissive={BRASS_HOT} emissiveIntensity={0.7} toneMapped={false} />
              </mesh>
              {[+1, -1].map((g) => (
                <mesh key={g} position={[0, -DROP / 2 + 20, g * 11]}>
                  <planeGeometry args={[esc.len * 0.84, 22]} />
                  <meshPhysicalMaterial color="#aebfc2" transparent opacity={0.16} roughness={0.06} envMapIntensity={1.2} side={THREE.DoubleSide} depthWrite={false} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      )}

      {/* ring chandelier */}
      <group ref={chandelier} position={[center.x, 0, -center.y]}>
        {[{ r: 86, y: 132 }, { r: 60, y: 154 }, { r: 36, y: 176 }].map((c, i) => (
          <mesh key={i} position={[0, c.y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[c.r, 2.2, 10, 72]} />
            <meshStandardMaterial color={BRASS} emissive={BRASS_HOT} emissiveIntensity={1.5} metalness={0.8} roughness={0.25} toneMapped={false} />
          </mesh>
        ))}
        <pointLight position={[0, 170, 0]} intensity={2.4} distance={1400} decay={1.6} color="#ffd9a0" />
      </group>
    </group>
  );
}

// ── colonnade + pendants along the concourse ───────────────────────────────────────
function Colonnade({ walkway, atriumCenter, entrances }) {
  const cols = useMemo(() => {
    if (walkway.length !== 62) return [];
    const out = [];
    for (let i = 2; i <= 28; i += 4) {
      [[i, 61 - i], [61 - i, i]].forEach(([a, b]) => {
        const v = walkway[a];
        const w = walkway[b];
        const p = { x: v.x + (w.x - v.x) * 0.055, y: v.y + (w.y - v.y) * 0.055 };
        const dA = Math.hypot(p.x - atriumCenter.x, p.y - atriumCenter.y);
        const nearDoor = entrances.some((e) => Math.hypot(p.x - e.x, p.y - e.y) < 170);
        if (dA > 300 && !nearDoor) out.push(p);
      });
    }
    return out;
  }, [walkway, atriumCenter, entrances]);
  return cols.map((p, i) => (
    <group key={i} position={[p.x, 0, -p.y]}>
      <mesh position={[0, 124, 0]} castShadow>
        <cylinderGeometry args={[5.2, 6.2, 248, 12]} />
        <meshStandardMaterial color="#453f52" roughness={0.42} metalness={0.4} />
      </mesh>
      <mesh position={[0, 246, 0]}>
        <cylinderGeometry args={[6.6, 6.6, 6, 12]} />
        <meshStandardMaterial color={BRASS} emissive={BRASS_HOT} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {/* soft pool of light at the base */}
      <mesh position={[0, 2.4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[26, 20]} />
        <meshBasicMaterial map={glowTexShared} color="#ffdca8" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  ));
}

function Pendants({ nodes }) {
  const pts = useMemo(
    () => nodes.filter((n) => n.id.startsWith('sp-w') || n.id.startsWith('sp-e')).map((n) => n.position),
    [nodes]
  );
  return pts.map((p, i) => (
    <group key={i} position={[p.x, 0, -p.y]}>
      <mesh position={[0, 272, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 52, 6]} />
        <meshBasicMaterial color="#3a3730" />
      </mesh>
      <mesh position={[0, 244, 0]}>
        <sphereGeometry args={[6.4, 14, 14]} />
        <meshStandardMaterial color={BRASS_HOT} emissive={BRASS_HOT} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
    </group>
  ));
}

// ── shell plinth + pylons ──────────────────────────────────────────────────────────
function Shell({ shell }) {
  const segs = useMemo(() => {
    const out = [];
    for (let i = 0; i < shell.length - 1; i += 1) {
      const a = shell[i];
      const b = shell[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len < 1) continue;
      out.push({ mid: mid2(a, b), ry: Math.atan2(b.y - a.y, b.x - a.x), len, i });
    }
    return out;
  }, [shell]);
  const topLine = useMemo(() => loopGeo(shell, 48), [shell]);
  return (
    <group>
      {segs.map((s) => (
        <mesh key={s.i} position={[s.mid.x, 23, -s.mid.y]} rotation={[0, s.ry, 0]} castShadow>
          <boxGeometry args={[s.len + 2, 46, 15]} />
          <meshStandardMaterial color="#191621" roughness={0.7} metalness={0.15} />
        </mesh>
      ))}
      <lineLoop geometry={topLine}>
        <lineBasicMaterial color={BRASS} transparent opacity={0.35} toneMapped={false} />
      </lineLoop>
      {segs.filter((_, i) => i % 5 === 2).map((s) => (
        <group key={`p${s.i}`} position={[s.mid.x, 0, -s.mid.y]}>
          <mesh position={[0, 160, 0]} castShadow>
            <boxGeometry args={[13, 320, 13]} />
            <meshStandardMaterial color="#221f2b" roughness={0.6} metalness={0.25} />
          </mesh>
          <mesh position={[0, 322, 0]}>
            <boxGeometry args={[14, 4, 14]} />
            <meshStandardMaterial color={BRASS} emissive={BRASS} emissiveIntensity={1.1} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ── entrance portals ───────────────────────────────────────────────────────────────
function Portals({ mpm }) {
  const portals = useMemo(() => {
    const nodes = (mpm.graph && mpm.graph.nodes) || [];
    const ents = nodes.filter((n) => /entrance/i.test(n.id));
    return ents.map((e) => {
      // face along the concourse: point toward the nearest spine node
      let best = null;
      let bd = Infinity;
      nodes.forEach((n) => {
        if (!n.id.startsWith('sp-')) return;
        const d2 = Math.hypot(n.position.x - e.position.x, n.position.y - e.position.y);
        if (d2 < bd) { bd = d2; best = n; }
      });
      const dir = best
        ? { x: (best.position.x - e.position.x) / bd, y: (best.position.y - e.position.y) / bd }
        : { x: 1, y: 0 };
      return { id: e.id, label: e.label, p: e.position, ry: Math.atan2(dir.y, dir.x) };
    });
  }, [mpm]);

  return portals.map((pt) => (
    <group key={pt.id} position={[pt.p.x, 0, -pt.p.y]} rotation={[0, pt.ry, 0]}>
      {[+1, -1].map((s) => (
        <mesh key={s} position={[0, 112, s * 102]} castShadow>
          <boxGeometry args={[15, 224, 15]} />
          <meshStandardMaterial color="#221f2b" roughness={0.55} metalness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 231, 0]} castShadow>
        <boxGeometry args={[15, 26, 218]} />
        <meshStandardMaterial color="#282433" roughness={0.5} metalness={0.35} />
      </mesh>
      <mesh position={[0, 216, 0]}>
        <boxGeometry args={[9, 2.6, 196]} />
        <meshStandardMaterial color={BRASS} emissive={BRASS_HOT} emissiveIntensity={1.8} toneMapped={false} />
      </mesh>
      {/* light wash through the doors */}
      <mesh position={[0, 2.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[150, 190]} />
        <meshBasicMaterial map={glowTexShared} color="#ffd9a0" transparent opacity={0.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  ));
}

// ── route: reveal ribbon + markers ─────────────────────────────────────────────────
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
  // dark casing under the bright core — keeps the path legible on pale stone
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
      {/* destination: floor pad + light beacon + floating gem above the roofline */}
      <mesh position={[ends.d.x, ROUTE_H + 1.5, -ends.d.y]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={41}>
        <circleGeometry args={[30, 36]} />
        <meshBasicMaterial map={glowTexShared} color="#ffcf7d" transparent opacity={0.95} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[ends.d.x, ROUTE_H + 2, -ends.d.y]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={42}>
        <ringGeometry args={[20, 24, 40]} />
        <meshBasicMaterial color="#ffb84d" toneMapped={false} transparent opacity={0.95} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* floating destination pin */}
      <group ref={gem} position={[ends.d.x, 0, -ends.d.y]}>
        <mesh position={[0, 232, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[17, 52, 24]} />
          <meshStandardMaterial color={BRASS} emissive={BRASS_HOT} emissiveIntensity={1.9} metalness={0.75} roughness={0.25} toneMapped={false} />
        </mesh>
        <mesh position={[0, 272, 0]}>
          <sphereGeometry args={[23, 22, 22]} />
          <meshStandardMaterial color={BRASS} emissive={BRASS_HOT} emissiveIntensity={2.2} metalness={0.75} roughness={0.25} toneMapped={false} />
        </mesh>
        <mesh position={[0, 272, 0]}>
          <sphereGeometry args={[9, 14, 14]} />
          <meshBasicMaterial color="#2a1c08" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// ── labels (restrained: hero rooms, hovered, route endpoints) ──────────────────────
function Labels({ mpm, hoveredId, endpointNames }) {
  const rooms = (mpm.rooms || []).filter((r) => r.polygon && r.name && (r.category || '').toUpperCase() !== 'WALKWAY');
  return rooms.map((r) => {
    const cat = (r.category || '').toUpperCase();
    const isHero = cat === 'ANCHOR' || cat === 'LOBBY' || cat === 'CIRCULATION';
    const isEnd = endpointNames.has(r.name);
    const hot = hoveredId === r.id || isEnd;
    if (!isHero && !hot) return null;
    const H = cat === 'CIRCULATION' ? 40 : heightOf(r);
    return (
      <Html key={r.id} position={[r.point.x, H + 66, -r.point.y]} center zIndexRange={[8, 0]}
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
  const parsed = useMemo(() => {
    if (!cs) return null;
    const rooms = mpm.rooms || [];
    const shops = rooms.filter((r) => {
      const c = (r.category || '').toUpperCase();
      return r.polygon && r.polygon.length >= 3 && c !== 'WALKWAY' && c !== 'CIRCULATION';
    });
    const walkway = rooms.find((r) => (r.category || '').toUpperCase() === 'WALKWAY');
    const escRoom = rooms.find((r) => (r.category || '').toUpperCase() === 'CIRCULATION');
    const shellWall = (mpm.walls || []).find((w) => w.id.includes('shell'));
    const atriumWall = (mpm.walls || []).find((w) => w.id.includes('atrium'));
    const atriumRing = atriumWall ? atriumWall.polyline.slice(0, -1) : null;
    const shell = shellWall ? shellWall.polyline.slice(0, -1) : null;
    const entrances = ((mpm.graph && mpm.graph.nodes) || []).filter((n) => /entrance/i.test(n.id)).map((n) => n.position);
    return {
      shops, walkway, escRoom, shell, atriumRing,
      atriumCenter: atriumRing ? centroid2(atriumRing) : { x: 0, y: 0 },
      entrances,
    };
  }, [mpm, cs]);
  if (!cs || !parsed) return null;

  const cx = (cs.minX + cs.maxX) / 2;
  const cy = (cs.minY + cs.maxY) / 2;
  const graph = mpm.graph;
  const nodeById = new Map(((graph && graph.nodes) || []).map((n) => [n.id, n]));
  const routeActive = (routePath || []).length > 1;
  const endpointNames = routeActive
    ? new Set([nodeById.get(routePath[0])?.label, nodeById.get(routePath[routePath.length - 1])?.label])
    : new Set();
  const isEndpoint = (r) => r.name && endpointNames.has(r.name);

  return (
    <group scale={[S, S, S]}>
      <group position={[-cx, 0, cy]}>
        {/* surrounding ground so the shell never floats in a void */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -18, -cy]}>
          <circleGeometry args={[4200, 48]} />
          <meshStandardMaterial color="#0b0a10" roughness={0.95} metalness={0} />
        </mesh>
        {parsed.shell && <BaseSlab shell={parsed.shell} atriumHole={parsed.atriumRing} />}
        {parsed.walkway && <Concourse walkway={parsed.walkway.polygon} atriumHole={parsed.atriumRing} routeActive={routeActive} />}
        {parsed.atriumRing && <Atrium ring={parsed.atriumRing} escRoom={parsed.escRoom} />}
        {parsed.shell && <Shell shell={parsed.shell} />}
        {parsed.walkway && (
          <Colonnade walkway={parsed.walkway.polygon} atriumCenter={parsed.atriumCenter} entrances={parsed.entrances} />
        )}
        <Pendants nodes={(graph && graph.nodes) || []} />
        <Portals mpm={mpm} />

        {parsed.shops.map((r) => (
          <Unit key={r.id} room={r}
            dimmed={routeActive && !isEndpoint(r)} active={isEndpoint(r)}
            hovered={hoveredId === r.id} onHover={onHover} onPick={onPick} />
        ))}

        <RouteRibbon graph={graph} routePath={routePath} />
        <RouteMarkers graph={graph} routePath={routePath} />
        <Labels mpm={mpm} hoveredId={hoveredId} endpointNames={endpointNames} />
      </group>
    </group>
  );
}

// ── camera choreography ────────────────────────────────────────────────────────────
function CameraDirector({ controlsRef, worldPts, focusPoint, span, onStart, onEnd }) {
  const { camera } = useThree();
  const dir = useMemo(() => new THREE.Vector3(0.1, 1.0, -0.68).normalize(), []);
  // steeper approach for route framing so the path isn't hidden behind rooflines
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

      {/* cool ambient air, one warm architectural key, a cool rim */}
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
