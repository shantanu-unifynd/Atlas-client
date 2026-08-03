import { useEffect, useState } from 'react';
import * as THREE from 'three';

// Rasterises the plan SVG into a faded canvas texture (context, not clutter —
// the glowing route should pop). Returns { texture, size } where size is the
// plan's native coordinate box (matches node positions).
//
// The object URL is revoked only after load/error (never in the effect cleanup)
// so React StrictMode's double-mount can't revoke a URL an <img> is still
// loading — which produced blob ERR_FILE_NOT_FOUND noise.
export default function usePlanTexture(svg) {
  const [result, setResult] = useState({ texture: null, size: null });

  useEffect(() => {
    if (!svg) return undefined;
    let cancelled = false;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      if (cancelled) return;
      const iw = img.naturalWidth || 1000;
      const ih = img.naturalHeight || 1000;
      const scale = Math.min(1, 2048 / Math.max(iw, ih));
      const cw = Math.max(1, Math.round(iw * scale));
      const ch = Math.max(1, Math.round(ih * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      ctx.fillStyle = 'rgba(11,13,18,0.55)';
      ctx.fillRect(0, 0, cw, ch);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      setResult({ texture, size: { w: iw, h: ih } });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (!cancelled) setResult({ texture: null, size: null });
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [svg]);

  return result;
}
