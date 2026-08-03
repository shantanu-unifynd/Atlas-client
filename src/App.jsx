import { Routes, Route } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import WayfindingPage from './pages/WayfindingPage';

// Visitor app routes. Primary entry is a per-floor link/QR or an iframe src
// (/visit/:buildingId/:floorId[?to=<label>]); the landing page is a fallback.
function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/visit/:buildingId/:floorId" element={<WayfindingPage />} />
      <Route path="*" element={<LandingPage />} />
    </Routes>
  );
}

export default App;
