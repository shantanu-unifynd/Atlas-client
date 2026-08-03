// Minimal fallback landing — the real entry is a per-floor wayfinding link/iframe.
function LandingPage() {
  return (
    <main className="screen">
      <div className="brand">Atlas</div>
      <p className="tagline">Indoor wayfinding</p>
      <p className="hint">Open a floor link to start navigating.</p>
    </main>
  );
}

export default LandingPage;
