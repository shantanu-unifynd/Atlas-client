import { useEffect } from 'react';

// Minimal fallback landing — the real entry is a per-floor wayfinding link/iframe.
function LandingPage() {
  useEffect(() => { document.title = 'Atlas — Indoor Wayfinding'; }, []);
  return (
    <main className="screen">
      <div className="brand">Atlas</div>
      <p className="tagline">Indoor wayfinding</p>
      <p className="hint">Open a floor link to start navigating.</p>
    </main>
  );
}

export default LandingPage;
