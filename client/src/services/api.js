import axios from "axios";

const api = axios.create({
    baseURL: "/api/v1",
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