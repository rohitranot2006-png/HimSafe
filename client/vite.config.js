
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: "localhost",
    proxy: {
      "/api": {
        target: "https://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
      "/socket.io": {
        target: "https://localhost:5000",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
});
