// True only if the browser can actually create a WebGL context. When hardware
// acceleration is disabled (or the browser is sandboxed without GPU access),
// three.js cannot render, so we detect this up front and avoid mounting the
// 3D canvas at all (show a friendly fallback + keep 2D working).
export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return Boolean(window.WebGLRenderingContext && gl);
  } catch {
    return false;
  }
}
