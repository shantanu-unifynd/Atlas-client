// Map design system — the single source of colour/typography tokens for every
// map layer, so styling stays consistent and tunable in one place.
export const mapTheme = {
  bg: '#0e1116',
  room: {
    semanticFill: 'rgba(124,92,255,0.28)',
    semanticStroke: 'rgba(150,120,255,0.85)',
    manualFill: 'rgba(75,140,255,0.32)',
    manualStroke: 'rgba(110,165,255,0.9)',
    point: 'rgba(124,92,255,0.7)',
  },
  wall: '#b7bfcd',
  opening: { door: '#e8590c', passage: '#5b8cff' },
  label: { color: '#eef1f7', halo: '#0e1116', mutedOpacity: 0.68 },
  route: { line: '#ff7a1a', glow: 'rgba(255,122,26,0.28)', start: '#4b8cff', dest: '#7c5cff', markerRing: '#ffffff' },
  graph: { edge: 'rgba(255,255,255,0.10)', node: 'rgba(255,255,255,0.30)' },
};
