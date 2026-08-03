import axios from 'axios';

// Talks to the Atlas backend. For the MVP the client reuses the existing
// read/compute endpoints; a dedicated public wayfinding API is a planned
// follow-up (see ROADMAP.md).
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

export default apiClient;
