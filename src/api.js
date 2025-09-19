import axios from "axios";

const API = axios.create({
  baseURL: "https://wirewaveapi.onrender.com",
});

// Attach token automatically
API.interceptors.request.use((config) => {
  const token = global.authToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default API;
