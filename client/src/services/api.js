import axios from "axios";

// Local: uses Vite proxy.
// Production: uses the Render backend URL from Vercel environment variables.
const API_BASE_URL = import.meta.env.VITE_API_URL || "/api/v1";

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/json",
    },
    timeout: 10000,
});

// Attach the saved login token to API requests.
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("himsafe_token");

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
    },
    (error) => Promise.reject(error)
);

export default api;