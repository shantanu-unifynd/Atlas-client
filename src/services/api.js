import apiClient from './apiClient';

// Each helper resolves to the backend's {success, message, data} envelope.
async function get(url, config) {
  const response = await apiClient.get(url, config);
  return response.data;
}

async function post(url, body, config) {
  const response = await apiClient.post(url, body, config);
  return response.data;
}

export const api = { get, post };
