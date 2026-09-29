import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import WayfindingPage from './pages/WayfindingPage';
import MapModelPage from './pages/MapModelPage';
import { USE_MOCK } from './mock';

// Visitor app routes. Primary entry is a per-floor link/QR or an iframe src
// (/visit/:buildingId/:floorId[?to=<label>]). In the mocked showcase build the
// root goes straight to the Palladium UG floor so the map is one click from open.
function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={USE_MOCK ? <Navigate to="/visit/palladium/ug" replace /> : <LandingPage />}
      />
      <Route path="/visit/:buildingId/:floorId" element={<WayfindingPage />} />
      <Route path="/mpm/:floorId" element={<MapModelPage />} />
      <Route path="*" element={USE_MOCK ? <Navigate to="/visit/palladium/ug" replace /> : <LandingPage />} />
    </Routes>
  );
}

export default App;
