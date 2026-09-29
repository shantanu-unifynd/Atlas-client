// Palladium Chennai — Upper Ground floor, authored as a local Map Presentation
// Model (MPM) fixture. Believability-first redesign: a gently curved concourse
// spine running west→east, storefronts of varied width/depth fanned along both
// sides, a central elliptical atrium void with escalators, Forever 21 as the
// western anchor, two residential lobbies, E/W entrances and an enclosing shell.
//
// Still the exact `model.data` shape the visitor app consumes — rooms / walls /
// openings / labels / graph — so it drops into the real API later unchanged.
// Plan coordinates are in "plan units" (px), y increasing DOWNWARD.

const BOUNDS = { minX: 0, minY: 0, maxX: 2400, maxY: 1440 };

// ---- concourse centreline: a shallow quadratic arc bowing north -----------------
const P0 = { x: 150, y: 860 };
const P1 = { x: 1200, y: 520 };
const P2 = { x: 2250, y: 860 };

const C = (t) => ({
  x: (1 - t) * (1 - t) * P0.x + 2 * (1 - t) * t * P1.x + t * t * P2.x,
  y: (1 - t) * (1 - t) * P0.y + 2 * (1 - t) * t * P1.y + t * t * P2.y,
});
const tangent = (t) => {
  const dx = 2 * (1 - t) * (P1.x - P0.x) + 2 * t * (P2.x - P1.x);
  const dy = 2 * (1 - t) * (P1.y - P0.y) + 2 * t * (P2.y - P1.y);
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
};
// Unit normal pointing NORTH (toward smaller y) of the walking direction.
const normal = (t) => {
  const T = tangent(t);
  return { x: T.y, y: -T.x };
};
// Concourse half-width: swells around the atrium so the walkway flows past the void.
const halfW = (t) => 95 + 62 * Math.exp(-(((t - 0.5) / 0.155) ** 2));

const off = (t, dist) => {
  const p = C(t);
  const n = normal(t);
  return { x: p.x + n.x * dist, y: p.y + n.y * dist };
};

const centroid = (poly) => ({
  x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
  y: poly.reduce((s, p) => s + p.y, 0) / poly.length,
});
const rnd = (p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

// ---- unit programme -------------------------------------------------------------
// side: +1 = north of the concourse, -1 = south. w = relative frontage, d = depth.
const NORTH_UNITS = [
  { name: 'Forever 21', cat: 'ANCHOR', w: 2.15, d: 430 },
  { name: 'UG-2', cat: 'JEWELRY', w: 0.95, d: 330 },
  { name: 'UG-3', cat: 'FASHION', w: 0.85, d: 360 },
  { name: 'UG-4', cat: 'BEAUTY', w: 1.15, d: 310 },
  { name: 'UG-5', cat: 'ACCESSORIES', w: 0.9, d: 385 },
  { name: 'UG-6', cat: 'FASHION', w: 1.0, d: 340 },
  { name: 'UG-7', cat: 'FOOTWEAR', w: 0.8, d: 300 },
  { name: 'UG-8', cat: 'JEWELRY', w: 1.2, d: 405 },
  { name: 'UG-9', cat: 'LIFESTYLE', w: 0.95, d: 345 },
  { name: 'UG-10', cat: 'FASHION', w: 1.05, d: 370 },
  { name: 'Residential Lobby 2', cat: 'LOBBY', w: 1.3, d: 320 },
];
const SOUTH_UNITS = [
  { name: 'Residential Lobby 1', cat: 'LOBBY', w: 1.25, d: 300 },
  { name: 'UG-11', cat: 'F&B', w: 1.0, d: 340 },
  { name: 'UG-12', cat: 'FASHION', w: 0.85, d: 300 },
  { name: 'UG-13', cat: 'BEAUTY', w: 1.1, d: 365 },
  { name: 'UG-14', cat: 'FOOTWEAR', w: 0.9, d: 320 },
  { name: 'UG-15', cat: 'ELECTRONICS', w: 1.0, d: 380 },
  { name: 'UG-16', cat: 'FASHION', w: 1.15, d: 350 },
  { name: 'UG-17', cat: 'ACCESSORIES', w: 0.8, d: 295 },
  { name: 'UG-18', cat: 'JEWELRY', w: 1.05, d: 375 },
  { name: 'UG-19', cat: 'LIFESTYLE', w: 0.9, d: 315 },
  { name: 'UG-20', cat: 'F&B', w: 1.1, d: 355 },
];

// ---- atrium (central void with escalators) ---------------------------------------
const ATRIUM_T = 0.5;
const ATRIUM_A = 175; // semi-axis along the concourse
const ATRIUM_B = 88; // semi-axis across it
const atriumCenter = C(ATRIUM_T);
const atriumAxes = { T: tangent(ATRIUM_T), N: normal(ATRIUM_T) };
const atriumRing = (n = 48, pad = 0) => {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    pts.push(rnd({
      x: atriumCenter.x + atriumAxes.T.x * (ATRIUM_A + pad) * Math.cos(a) + atriumAxes.N.x * (ATRIUM_B + pad) * Math.sin(a),
      y: atriumCenter.y + atriumAxes.T.y * (ATRIUM_A + pad) * Math.cos(a) + atriumAxes.N.y * (ATRIUM_B + pad) * Math.sin(a),
    }));
  }
  return pts;
};

function build() {
  const rooms = [];
  const labels = [];
  const openings = [];
  const nodes = [];
  const edges = [];
  const addEdge = (a, b) => edges.push({ id: `e-${a}-${b}`, source: a, target: b });

  // ---- shop quads fanned along the curve -----------------------------------------
  // Convention consumed by the 3D renderer: polygon[0]→polygon[1] is ALWAYS the
  // storefront (concourse-facing) edge.
  function addSide(units, side) {
    const T_START = 0.012;
    const T_END = 0.988;
    const GAP = 0.005;
    const totalW = units.reduce((s, u) => s + u.w, 0);
    const usable = T_END - T_START - GAP * (units.length - 1);
    let t = T_START;
    units.forEach((u) => {
      const span = (u.w / totalW) * usable;
      const t0 = t;
      const t1 = t + span;
      t = t1 + GAP;

      const innerA = off(t0, side * halfW(t0));
      const innerB = off(t1, side * halfW(t1));
      const nA = normal(t0);
      const nB = normal(t1);
      const outerA = { x: innerA.x + nA.x * side * u.d, y: innerA.y + nA.y * side * u.d };
      const outerB = { x: innerB.x + nB.x * side * u.d, y: innerB.y + nB.y * side * u.d };
      const poly = [innerA, innerB, outerB, outerA].map(rnd);

      const id = `room-${u.name.replace(/\s+/g, '-').toLowerCase()}`;
      rooms.push({ id, polygon: poly, point: centroid(poly), source: 'MANUAL', category: u.cat, name: u.name });
      labels.push({ id: `lbl-${id}`, position: centroid(poly), text: u.name, roomId: id });

      // Door node at the storefront midpoint, one step into the concourse.
      const tm = (t0 + t1) / 2;
      const door = off(tm, side * (halfW(tm) - 2));
      const entryId = `entry-${id}`;
      nodes.push({ id: entryId, position: rnd(door), label: u.name, __t: tm, __side: side });
      openings.push({ id: `op-${id}`, position: rnd(door), type: 'DOOR' });
    });
  }
  addSide(NORTH_UNITS, +1);
  addSide(SOUTH_UNITS, -1);

  // ---- concourse walkway (rendered as the polished circulation floor) -------------
  const walkway = [];
  const WSAMPLES = 30;
  for (let i = 0; i <= WSAMPLES; i += 1) walkway.push(rnd(off(i / WSAMPLES, +halfW(i / WSAMPLES))));
  for (let i = WSAMPLES; i >= 0; i -= 1) walkway.push(rnd(off(i / WSAMPLES, -halfW(i / WSAMPLES))));
  rooms.push({ id: 'room-concourse', polygon: walkway, point: rnd(C(0.25)), source: 'MANUAL', category: 'WALKWAY', name: 'Concourse' });

  // ---- escalator well inside the atrium --------------------------------------------
  const { T, N } = atriumAxes;
  const escPoly = [
    { x: atriumCenter.x - T.x * 130 - N.x * 30, y: atriumCenter.y - T.y * 130 - N.y * 30 },
    { x: atriumCenter.x + T.x * 130 - N.x * 30, y: atriumCenter.y + T.y * 130 - N.y * 30 },
    { x: atriumCenter.x + T.x * 130 + N.x * 30, y: atriumCenter.y + T.y * 130 + N.y * 30 },
    { x: atriumCenter.x - T.x * 130 + N.x * 30, y: atriumCenter.y - T.y * 130 + N.y * 30 },
  ].map(rnd);
  rooms.push({ id: 'room-escalators', polygon: escPoly, point: rnd(atriumCenter), source: 'MANUAL', category: 'CIRCULATION', name: 'Escalators' });
  labels.push({ id: 'lbl-escalators', position: rnd({ x: atriumCenter.x, y: atriumCenter.y }), text: 'Escalators', roomId: 'room-escalators' });

  // ---- navigation graph: spine + twin detour around the atrium ---------------------
  const westTs = [0.015, 0.09, 0.17, 0.25, 0.325, 0.385];
  const ringTs = [0.435, 0.5, 0.565];
  const eastTs = [0.615, 0.675, 0.75, 0.83, 0.91, 0.985];
  const spineNodes = []; // { id, t, side } side 0 = centreline

  westTs.forEach((tt, i) => {
    const id = `sp-w${i}`;
    nodes.push({ id, position: rnd(C(tt)), label: '' });
    spineNodes.push({ id, t: tt, side: 0 });
    if (i > 0) addEdge(`sp-w${i - 1}`, id);
  });
  const RING_OFF = ATRIUM_B + 34;
  ringTs.forEach((tt, i) => {
    const idN = `sp-an${i}`;
    const idS = `sp-as${i}`;
    nodes.push({ id: idN, position: rnd(off(tt, +RING_OFF)), label: '' });
    nodes.push({ id: idS, position: rnd(off(tt, -RING_OFF)), label: '' });
    spineNodes.push({ id: idN, t: tt, side: +1 });
    spineNodes.push({ id: idS, t: tt, side: -1 });
    if (i > 0) { addEdge(`sp-an${i - 1}`, idN); addEdge(`sp-as${i - 1}`, idS); }
  });
  eastTs.forEach((tt, i) => {
    const id = `sp-e${i}`;
    nodes.push({ id, position: rnd(C(tt)), label: '' });
    spineNodes.push({ id, t: tt, side: 0 });
    if (i > 0) addEdge(`sp-e${i - 1}`, id);
  });
  addEdge(`sp-w${westTs.length - 1}`, 'sp-an0');
  addEdge(`sp-w${westTs.length - 1}`, 'sp-as0');
  addEdge(`sp-an${ringTs.length - 1}`, 'sp-e0');
  addEdge(`sp-as${ringTs.length - 1}`, 'sp-e0');

  // Shop entries connect to the nearest spine node on the matching side of the void.
  nodes.filter((n) => n.id.startsWith('entry-')).forEach((n) => {
    let best = null;
    let bd = Infinity;
    spineNodes.forEach((s) => {
      if (s.side !== 0 && n.__side && s.side !== n.__side) return;
      const sp = nodes.find((x) => x.id === s.id).position;
      const d = Math.hypot(sp.x - n.position.x, sp.y - n.position.y);
      if (d < bd) { bd = d; best = s.id; }
    });
    if (best) addEdge(n.id, best);
    delete n.__t;
    delete n.__side;
  });

  // Escalator entry hangs off the north detour.
  nodes.push({ id: 'entry-escalators', position: rnd(off(0.5, +(ATRIUM_B + 12))), label: 'Escalators' });
  addEdge('entry-escalators', 'sp-an1');

  // ---- west / east entrances ---------------------------------------------------------
  const wT = tangent(0);
  const eT = tangent(1);
  const westPos = rnd({ x: C(0).x - wT.x * 78, y: C(0).y - wT.y * 78 });
  const eastPos = rnd({ x: C(1).x + eT.x * 78, y: C(1).y + eT.y * 78 });
  nodes.push({ id: 'entrance-west', position: westPos, label: 'West Entrance' });
  nodes.push({ id: 'entrance-east', position: eastPos, label: 'East Entrance' });
  addEdge('entrance-west', 'sp-w0');
  addEdge(`sp-e${eastTs.length - 1}`, 'entrance-east');
  openings.push({ id: 'op-west', position: westPos, type: 'DOOR' });
  openings.push({ id: 'op-east', position: eastPos, type: 'DOOR' });

  // ---- enclosing shell + atrium ring (walls) -----------------------------------------
  const shell = [];
  const SS = 26;
  for (let i = 0; i <= SS; i += 1) shell.push(rnd(off(i / SS, +(halfW(i / SS) + 468))));
  // east cap swings past the entrance
  shell.push(rnd({ x: eastPos.x + 60, y: eastPos.y - 170 }));
  shell.push(rnd({ x: eastPos.x + 60, y: eastPos.y + 170 }));
  for (let i = SS; i >= 0; i -= 1) shell.push(rnd(off(i / SS, -(halfW(i / SS) + 428))));
  shell.push(rnd({ x: westPos.x - 60, y: westPos.y + 170 }));
  shell.push(rnd({ x: westPos.x - 60, y: westPos.y - 170 }));
  shell.push(shell[0]);

  const walls = [
    { id: 'wall-shell', polyline: shell },
    { id: 'wall-atrium', polyline: [...atriumRing(48), atriumRing(48)[0]] },
  ];

  return {
    id: 'palladium-ug',
    floorId: 'ug',
    coordinateSystem: { type: 'local', bounds: BOUNDS },
    rooms,
    walls,
    openings,
    labels,
    graph: { navigationGraphId: 'palladium-ug-graph', nodes, edges },
  };
}

export const palladiumUG = build();
export default palladiumUG;
