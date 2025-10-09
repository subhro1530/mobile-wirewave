import axios from "axios";

const API = axios.create({
  baseURL: "http://65.20.73.50:4000", // updated
});

// Attach token automatically
API.interceptors.request.use((config) => {
  const token = global.authToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default API;
